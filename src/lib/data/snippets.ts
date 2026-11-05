import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import { meritAllocations, meritRounds } from "@/lib/db/schema";
import { snippetParam, type Snippet } from "@/lib/domain/community";
import { toPercent } from "@/lib/domain/finder";
import { UserFacingError } from "@/lib/errors";
import { inductionMaxMarks } from "./merit";
import type { Db } from "./shared";

/**
 * Live merit cards for community posts. A snippet names a group (programme, quota,
 * speciality, hospital) in one round; its numbers are always read from the
 * imported round, never from what the member typed.
 */

export type SnippetFigures = {
  snippet: Snippet;
  closing: number;
  opening: number;
  allocations: number;
  seats: number;
  total: number | null;
  closingPct: number | null;
  openingPct: number | null;
  /** Closing in the previous round of the same induction, when the group was there. */
  prevClosing: number | null;
  /** Ids for links, when the names are mapped. */
  specialityId: number | null;
  hospitalId: number | null;
};

async function group(db: Db, s: Snippet, round: number) {
  const [g] = await db
    .select({
      closing: sql<number>`min(${meritAllocations.marks})`.mapWith(Number),
      opening: sql<number>`max(${meritAllocations.marks})`.mapWith(Number),
      allocations: sql<number>`count(*)`.mapWith(Number),
      seats: sql<number>`max(${meritAllocations.seats})`.mapWith(Number),
      specialityId: sql<number | null>`max(${meritAllocations.specialityId})`,
      hospitalId: sql<number | null>`max(${meritAllocations.hospitalId})`,
    })
    .from(meritAllocations)
    .innerJoin(meritRounds, eq(meritRounds.id, meritAllocations.roundId))
    .where(and(
      eq(meritRounds.inductionId, s.induction), eq(meritRounds.roundNo, round),
      eq(meritAllocations.program, s.program), eq(meritAllocations.quota, s.quota),
      eq(meritAllocations.speciality, s.speciality), eq(meritAllocations.hospital, s.hospital),
    ));
  return g && g.allocations > 0 ? g : null;
}

/** Refuse a snippet that names a group not in that round. */
export async function assertSnippetExists(db: Db, s: Snippet) {
  if (!(await group(db, s, s.round))) throw new UserFacingError("That merit group is not in the round. Pick it again from the lists.");
}

/** Figures for the snippets on a page, keyed by snippetParam(snippet). Missing groups are left out. */
export async function snippetFigures(db: Database, snippets: Snippet[]): Promise<Map<string, SnippetFigures>> {
  const unique = new Map(snippets.map((s) => [snippetParam(s), s]));
  const out = new Map<string, SnippetFigures>();
  if (unique.size === 0) return out;
  const max = await inductionMaxMarks(db);
  await Promise.all(
    [...unique].map(async ([key, s]) => {
      const [now, prev] = await Promise.all([group(db, s, s.round), s.round > 1 ? group(db, s, s.round - 1) : Promise.resolve(null)]);
      if (!now) return;
      const total = max[s.induction] ?? null;
      out.set(key, {
        snippet: s,
        closing: now.closing,
        opening: now.opening,
        allocations: now.allocations,
        seats: now.seats,
        total,
        closingPct: total ? toPercent(now.closing, total) : null,
        openingPct: total ? toPercent(now.opening, total) : null,
        prevClosing: prev?.closing ?? null,
        specialityId: now.specialityId == null ? null : Number(now.specialityId),
        hospitalId: now.hospitalId == null ? null : Number(now.hospitalId),
      });
    }),
  );
  return out;
}

/** Choices for the "Attach a merit card" picker, narrowed step by step. */
export async function snippetChoices(db: Database, input: { induction?: number; round?: number; track?: string; speciality?: string }) {
  const rounds = await db.select({ induction: meritRounds.inductionId, round: meritRounds.roundNo }).from(meritRounds).orderBy(sql`${meritRounds.inductionId} desc`, sql`${meritRounds.roundNo} desc`);
  const induction = rounds.some((r) => r.induction === input.induction) ? input.induction! : rounds[0]?.induction;
  const roundList = rounds.filter((r) => r.induction === induction).map((r) => r.round);
  const round = roundList.includes(input.round ?? -1) ? input.round! : roundList[0];
  const where = (extra?: ReturnType<typeof and>) => and(eq(meritRounds.inductionId, induction ?? -1), eq(meritRounds.roundNo, round ?? -1), extra);
  const tracks = (await db.selectDistinct({ program: meritAllocations.program, quota: meritAllocations.quota }).from(meritAllocations)
    .innerJoin(meritRounds, eq(meritRounds.id, meritAllocations.roundId)).where(where()).orderBy(asc(meritAllocations.program), asc(meritAllocations.quota)))
    .map((t) => `${t.program}|${t.quota}`);
  const track = tracks.includes(input.track ?? "") ? input.track! : tracks[0];
  const [program, quota] = (track ?? "|").split("|") as [string, string];
  const inTrack = and(eq(meritAllocations.program, program), eq(meritAllocations.quota, quota));
  const specs = (await db.selectDistinct({ v: meritAllocations.speciality }).from(meritAllocations)
    .innerJoin(meritRounds, eq(meritRounds.id, meritAllocations.roundId)).where(where(inTrack)).orderBy(asc(meritAllocations.speciality))).map((r) => r.v);
  const speciality = specs.includes(input.speciality ?? "") ? input.speciality! : specs[0];
  const hosps = (await db.selectDistinct({ v: meritAllocations.hospital }).from(meritAllocations)
    .innerJoin(meritRounds, eq(meritRounds.id, meritAllocations.roundId)).where(where(and(inTrack, eq(meritAllocations.speciality, speciality ?? "")))).orderBy(asc(meritAllocations.hospital))).map((r) => r.v);
  return {
    inductions: [...new Set(rounds.map((r) => r.induction))],
    induction: induction ?? null,
    rounds: roundList,
    round: round ?? null,
    tracks,
    track: track ?? null,
    specialities: specs,
    speciality: speciality ?? null,
    hospitals: hosps,
  };
}
