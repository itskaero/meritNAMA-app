import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { assertCan, type Session } from "@/lib/auth/roles";
import type { Database } from "@/lib/db/client";
import { meritAllocations, meritRounds, scoringPolicies, shortlistItems } from "@/lib/db/schema";
import { classify, margin, toPercent, type FinderStatus } from "@/lib/domain/finder";
import { parseInductions } from "@/lib/domain/prediction";
import { sameScheme, schemeOf, type PolicyLike } from "@/lib/domain/scheme";
import { UserFacingError } from "@/lib/errors";
import { inductionMaxMarks } from "./merit";
import { ensureUser } from "./users";

/**
 * Score finder: where a score would have reached in past rounds. Aggregates only
 * (closing marks per option per round); no allocation rows leave the database.
 */

export type Track = { program: string; quota: string; allocations: number };

/** Inductions that have rounds and a known total, with their programme/quota tracks. */
export async function finderOptions(db: Database, session: Session | null) {
  assertCan(session, "portal");
  const [maxMarks, tracks, active] = await Promise.all([
    inductionMaxMarks(db),
    db
      .select({
        inductionId: meritRounds.inductionId,
        program: meritAllocations.program,
        quota: meritAllocations.quota,
        allocations: sql<number>`count(*)`.mapWith(Number),
      })
      .from(meritAllocations)
      .innerJoin(meritRounds, eq(meritRounds.id, meritAllocations.roundId))
      .groupBy(meritRounds.inductionId, meritAllocations.program, meritAllocations.quota)
      .orderBy(desc(meritRounds.inductionId), desc(sql`count(*)`)),
    db.select({ definition: scoringPolicies.definition, key: scoringPolicies.policyKey, status: scoringPolicies.status }).from(scoringPolicies),
  ]);
  const activePolicy = active.find((p) => p.status === "active");
  const scheme = schemeOf(activePolicy ? { key: activePolicy.key, ...(activePolicy.definition as PolicyLike) } : null);
  const schemeOfInduction = (id: number) => {
    const p = active.find((x) => parseInductions((x.definition as PolicyLike).induction).includes(id));
    return p ? schemeOf({ key: p.key, ...(p.definition as PolicyLike) }) : null;
  };
  const byInduction = new Map<number, Track[]>();
  for (const t of tracks) {
    if (!maxMarks[t.inductionId]) continue; // cannot compare without the induction's total
    (byInduction.get(t.inductionId) ?? byInduction.set(t.inductionId, []).get(t.inductionId)!).push({ program: t.program, quota: t.quota, allocations: t.allocations });
  }
  const activeTotal = (activePolicy?.definition as { total_marks?: number } | undefined)?.total_marks;
  const inductions = [...byInduction].map(([id, t]) => {
    const s = schemeOfInduction(id);
    return { id, total: maxMarks[id]!, tracks: t, likeForLike: sameScheme(scheme, s), label: s?.label ?? null };
  });
  return {
    inductions,
    /** Total of the active scoring policy: the scale a candidate's own score is on now. */
    defaultTotal: activeTotal ?? null,
    activePolicy: activePolicy?.key ?? null,
    activeLabel: scheme?.label ?? null,
    /** Past inductions scored the same way as the active policy: the only ones whose marks compare like for like. */
    likeForLike: inductions.filter((i) => i.likeForLike).map((i) => i.id),
  };
}

const inputSchema = z.object({
  induction: z.number().int().min(1).max(999),
  program: z.string().min(1).max(80),
  quota: z.string().min(1).max(80),
  marks: z.number().min(0),
  total: z.number().positive(),
});

export type FinderOption = {
  speciality: string;
  specialityId: number | null;
  hospital: string;
  hospitalId: number | null;
  firstRound: number;
  lastRound: number;
  firstClosing: number;
  lastClosing: number;
  firstPct: number;
  lastPct: number;
  allocations: number;
  status: FinderStatus;
  margin: number;
};

/**
 * Every option of one programme/quota in an induction, classified against a score.
 * Options sorted by status, then by margin.
 */
export async function findOptions(db: Database, session: Session | null, input: z.input<typeof inputSchema>) {
  assertCan(session, "portal");
  return computeOptions(db, input);
}

/** The finder's calculation without an access check: aggregates only. Used by the public landing page too. */
export async function computeOptions(db: Database, input: z.input<typeof inputSchema>) {
  const v = inputSchema.parse(input);
  if (v.marks > v.total) throw new UserFacingError(`Your marks cannot be more than the total (${v.total}).`);
  const maxMarks = await inductionMaxMarks(db);
  const indTotal = maxMarks[v.induction];
  if (!indTotal) throw new UserFacingError(`The total marks for induction ${v.induction} are not known. Ask an admin to import scoring_policy.json.`);

  const rows = (await db.execute(sql`
    with g as (
      select m.speciality, m.hospital, max(m.speciality_id) as speciality_id, max(m.hospital_id) as hospital_id,
             r.round_no, min(m.marks) as closing, count(*)::int as allocations
      from merit_allocations m join merit_rounds r on r.id = m.round_id
      where r.induction_id = ${v.induction} and m.program = ${v.program} and m.quota = ${v.quota}
      group by m.speciality, m.hospital, r.round_no)
    select speciality, hospital, max(speciality_id) as speciality_id, max(hospital_id) as hospital_id,
           min(round_no) as first_round, max(round_no) as last_round,
           (array_agg(closing order by round_no asc))[1] as first_closing,
           (array_agg(closing order by round_no desc))[1] as last_closing,
           max(allocations) as allocations
    from g group by speciality, hospital`)) as unknown as {
    speciality: string; hospital: string; speciality_id: number | null; hospital_id: number | null;
    first_round: number; last_round: number; first_closing: number; last_closing: number; allocations: number;
  }[];

  const me = toPercent(v.marks, v.total);
  const order: Record<FinderStatus, number> = { safe: 0, borderline: 1, out: 2 };
  const options: FinderOption[] = rows.map((r) => {
    const firstPct = toPercent(Number(r.first_closing), indTotal);
    const lastPct = toPercent(Number(r.last_closing), indTotal);
    return {
      speciality: r.speciality,
      specialityId: r.speciality_id,
      hospital: r.hospital,
      hospitalId: r.hospital_id,
      firstRound: r.first_round,
      lastRound: r.last_round,
      firstClosing: Number(r.first_closing),
      lastClosing: Number(r.last_closing),
      firstPct,
      lastPct,
      allocations: r.allocations,
      status: classify(me, firstPct, lastPct),
      margin: margin(me, lastPct),
    };
  });
  options.sort((a, b) => order[a.status] - order[b.status] || b.lastPct - a.lastPct);
  return { mePct: me, inductionTotal: indTotal, options };
}

/** One option's closing merit across every induction and round, in percent of each total. */
export async function optionHistory(
  db: Database,
  session: Session | null,
  o: { program: string; quota: string; speciality: string; hospital: string },
) {
  assertCan(session, "portal");
  const [maxMarks, rows] = await Promise.all([
    inductionMaxMarks(db),
    db
      .select({ inductionId: meritRounds.inductionId, roundNo: meritRounds.roundNo, closing: sql<number>`min(${meritAllocations.marks})`.mapWith(Number) })
      .from(meritAllocations)
      .innerJoin(meritRounds, eq(meritRounds.id, meritAllocations.roundId))
      .where(and(eq(meritAllocations.program, o.program), eq(meritAllocations.quota, o.quota), eq(meritAllocations.speciality, o.speciality), eq(meritAllocations.hospital, o.hospital)))
      .groupBy(meritRounds.inductionId, meritRounds.roundNo)
      .orderBy(meritRounds.inductionId, meritRounds.roundNo),
  ]);
  return rows
    .filter((r) => maxMarks[r.inductionId])
    .map((r) => ({ ...r, pct: toPercent(r.closing, maxMarks[r.inductionId]!) }));
}

// ── Shortlist ──────────────────────────────────────────────────────────────────

const itemSchema = z.object({
  program: z.string().trim().min(1).max(80),
  quota: z.string().trim().min(1).max(80),
  speciality: z.string().trim().min(1).max(160),
  hospital: z.string().trim().min(1).max(200),
});
const SHORTLIST_MAX = 60;

export async function listShortlist(db: Database, session: Session | null) {
  assertCan(session, "portal");
  const me = await ensureUser(db, session);
  return db
    .select({ program: shortlistItems.program, quota: shortlistItems.quota, speciality: shortlistItems.speciality, hospital: shortlistItems.hospital, createdAt: shortlistItems.createdAt })
    .from(shortlistItems)
    .where(eq(shortlistItems.userId, me.id))
    .orderBy(shortlistItems.createdAt);
}

/** Add or remove an option. Returns whether it is now on the shortlist. */
export async function toggleShortlist(db: Database, session: Session | null, input: z.input<typeof itemSchema>) {
  assertCan(session, "portal");
  const item = itemSchema.parse(input);
  return db.transaction(async (tx) => {
    const me = await ensureUser(tx, session);
    const where = and(
      eq(shortlistItems.userId, me.id),
      eq(shortlistItems.program, item.program),
      eq(shortlistItems.quota, item.quota),
      eq(shortlistItems.speciality, item.speciality),
      eq(shortlistItems.hospital, item.hospital),
    );
    const removed = await tx.delete(shortlistItems).where(where).returning({ u: shortlistItems.userId });
    if (removed.length) return { saved: false };
    const [{ n }] = (await tx.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(shortlistItems).where(eq(shortlistItems.userId, me.id))) as [{ n: number }];
    if (n >= SHORTLIST_MAX) throw new UserFacingError(`Your shortlist is full (${SHORTLIST_MAX}). Remove an option first.`);
    await tx.insert(shortlistItems).values({ userId: me.id, ...item });
    return { saved: true };
  });
}
