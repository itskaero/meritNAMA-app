import "server-only";
import { and, desc, eq, inArray, isNotNull, sql, type SQL } from "drizzle-orm";
import { assertCan, type Session } from "@/lib/auth/roles";
import type { Database } from "@/lib/db/client";
import { gazetteEntries, gazettes, inductions, meritAllocations, meritRounds, simulationRuns } from "@/lib/db/schema";
import { inductionRunning } from "./predictions";
import { publishedEstimates } from "./simulation";

/**
 * Merit lists as people read them: every candidate on a list with their name, marks,
 * seat, preference and consent; the gazette; and the lowest and highest merit per
 * seat, speciality or hospital. Names are shown as PHF publishes them; CNIC, phone,
 * PMDC number and email are never stored.
 */

export const PAGE_SIZE = 100;

export type ListFilters = { program?: string; quota?: string; speciality?: string; hospital?: string; consent?: string; q?: string };

/** "%" and "_" are wildcards in LIKE; a search for them means the characters themselves. */
const likeText = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** A search box: digits match the applicant id, anything else the name. */
function searchCondition(q: string | undefined, idCol: SQL | typeof meritAllocations.applicantId, nameCol: SQL | typeof meritAllocations.candidateName) {
  const s = (q ?? "").trim().slice(0, 60);
  if (!s) return undefined;
  return /^\d+$/.test(s) ? sql`${idCol} like ${likeText(s)}` : sql`${nameCol} ilike ${likeText(s)}`;
}

function allocationWhere(roundId: number, f: ListFilters) {
  return and(
    eq(meritAllocations.roundId, roundId),
    f.program ? eq(meritAllocations.program, f.program) : undefined,
    f.quota ? eq(meritAllocations.quota, f.quota) : undefined,
    f.speciality ? eq(meritAllocations.speciality, f.speciality) : undefined,
    f.hospital ? eq(meritAllocations.hospital, f.hospital) : undefined,
    f.consent ? eq(meritAllocations.consent, f.consent) : undefined,
    searchCondition(f.q, meritAllocations.applicantId, meritAllocations.candidateName),
  );
}

const pageOf = (page: number | undefined, total: number) => {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return { page: Math.min(Math.max(1, Math.trunc(page ?? 1) || 1), pages), pages };
};

export type ListRow = {
  rank: number; applicantId: string; name: string | null; marks: number;
  program: string; quota: string; speciality: string; specialityId: number | null; hospital: string; hospitalId: number | null;
  preferenceNo: number; consent: string;
};

/**
 * One official round in full: every allocation that matches the filters, best marks
 * first, a page at a time. `rank` is the place within the filtered list.
 */
export async function roundList(db: Database, session: Session | null, input: { roundId: number; filters?: ListFilters; page?: number }) {
  assertCan(session, "portal");
  const where = allocationWhere(input.roundId, input.filters ?? {});
  const [{ n } = { n: 0 }] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(meritAllocations).where(where);
  const { page, pages } = pageOf(input.page, n ?? 0);
  const rows = await db
    .select({
      applicantId: meritAllocations.applicantId, name: meritAllocations.candidateName, marks: meritAllocations.marks,
      program: meritAllocations.program, quota: meritAllocations.quota, speciality: meritAllocations.speciality, specialityId: meritAllocations.specialityId,
      hospital: meritAllocations.hospital, hospitalId: meritAllocations.hospitalId, preferenceNo: meritAllocations.preferenceNo, consent: meritAllocations.consent,
    })
    .from(meritAllocations)
    .where(where)
    .orderBy(desc(meritAllocations.marks), meritAllocations.rowNo)
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);
  return { rows: rows.map((r, i): ListRow => ({ ...r, rank: (page - 1) * PAGE_SIZE + i + 1 })), total: n ?? 0, page, pages };
}

export type RangeBy = "seat" | "speciality" | "hospital";
export const RANGE_BY: readonly RangeBy[] = ["seat", "speciality", "hospital"];

export type MeritRange = {
  program: string; quota: string; speciality: string | null; specialityId: number | null; hospital: string | null; hospitalId: number | null;
  allocations: number; seats: number | null; lowest: number; highest: number; prevLowest: number | null;
};

/**
 * Lowest and highest merit allocated in a round, per seat (speciality at a hospital),
 * per speciality (all its hospitals) or per hospital (all its specialities), always
 * within one programme and quota; with the same group's lowest in `prevRoundId`.
 */
export async function meritRanges(db: Database, session: Session | null, input: { roundId: number; prevRoundId?: number | null; by: RangeBy; filters?: ListFilters }) {
  assertCan(session, "portal");
  const f = { ...input.filters, q: undefined };
  const bySpec = input.by !== "hospital", byHosp = input.by !== "speciality";
  const query = (roundId: number) => db
    .select({
      program: meritAllocations.program,
      quota: meritAllocations.quota,
      speciality: bySpec ? meritAllocations.speciality : sql<string | null>`null`,
      specialityId: bySpec ? sql<number | null>`max(${meritAllocations.specialityId})` : sql<number | null>`null`,
      hospital: byHosp ? meritAllocations.hospital : sql<string | null>`null`,
      hospitalId: byHosp ? sql<number | null>`max(${meritAllocations.hospitalId})` : sql<number | null>`null`,
      allocations: sql<number>`count(*)`.mapWith(Number),
      seats: bySpec && byHosp ? sql<number | null>`max(${meritAllocations.seats})` : sql<number | null>`null`,
      lowest: sql<number>`min(${meritAllocations.marks})`.mapWith(Number),
      highest: sql<number>`max(${meritAllocations.marks})`.mapWith(Number),
    })
    .from(meritAllocations)
    .where(allocationWhere(roundId, f))
    .groupBy(...[meritAllocations.program, meritAllocations.quota, ...(bySpec ? [meritAllocations.speciality] : []), ...(byHosp ? [meritAllocations.hospital] : [])]);
  const [now, before] = await Promise.all([query(input.roundId), input.prevRoundId ? query(input.prevRoundId) : Promise.resolve([])]);
  const key = (r: { program: string; quota: string; speciality: string | null; hospital: string | null }) => [r.program, r.quota, r.speciality ?? "", r.hospital ?? ""].join("|");
  const prev = new Map(before.map((r) => [key(r), r.lowest]));
  return now
    .map((r): MeritRange => ({ ...r, seats: r.seats == null ? null : Number(r.seats), prevLowest: input.prevRoundId ? prev.get(key(r)) ?? null : null }))
    .sort((a, b) => b.highest - a.highest || b.lowest - a.lowest);
}

/**
 * The induction people are going through now: the newest one with a gazette, an
 * official round or a published estimate, provided it is still running (no official
 * round yet, or its cycle has not ended, or it is marked active). Null between cycles.
 */
export async function currentInduction(db: Database, session: Session | null) {
  assertCan(session, "portal");
  const [g, r, e, a] = await Promise.all([
    db.select({ id: sql<number>`max(${gazettes.inductionId})` }).from(gazettes),
    db.select({ id: sql<number>`max(${meritRounds.inductionId})` }).from(meritRounds),
    db.select({ id: sql<number>`max(${simulationRuns.inductionId})` }).from(simulationRuns).where(isNotNull(simulationRuns.publishedAt)),
    db.select({ id: sql<number>`max(${inductions.id})` }).from(inductions).where(eq(inductions.status, "active")),
  ]);
  const id = Math.max(...[g[0]?.id, r[0]?.id, e[0]?.id, a[0]?.id].map((x) => Number(x ?? 0)));
  if (!id) return null;
  const rounds = (await db.select({ roundNo: meritRounds.roundNo }).from(meritRounds).where(eq(meritRounds.inductionId, id)).orderBy(meritRounds.roundNo)).map((x) => x.roundNo);
  const active = Number(a[0]?.id ?? 0) === id;
  if (rounds.length && !active && !(await inductionRunning(db, id))) return null;
  const [gaz] = await db.select({ entries: gazettes.entries, importedAt: gazettes.importedAt }).from(gazettes).where(eq(gazettes.inductionId, id)).limit(1);
  return { induction: id, rounds, gazette: gaz ?? null };
}

// ── Gazette ────────────────────────────────────────────────────────────────────

/** Every published gazette (for the staff processing page). */
export async function listGazettes(db: Database, session: Session | null) {
  assertCan(session, "staff");
  return (await db.select({ induction: gazettes.inductionId, entries: gazettes.entries, importedAt: gazettes.importedAt }).from(gazettes).orderBy(desc(gazettes.inductionId)));
}

/** An induction's gazette at a glance: size, counts by status, highest and median marks. Null when not imported. */
export async function gazetteInfo(db: Database, session: Session | null, induction: number) {
  assertCan(session, "portal");
  const [g] = await db.select().from(gazettes).where(eq(gazettes.inductionId, induction)).limit(1);
  if (!g) return null;
  const [statuses, [stats]] = await Promise.all([
    db.select({ status: gazetteEntries.status, n: sql<number>`count(*)`.mapWith(Number) }).from(gazetteEntries)
      .where(eq(gazetteEntries.inductionId, induction)).groupBy(gazetteEntries.status).orderBy(desc(sql`count(*)`)),
    db.select({
      highest: sql<number>`max(${gazetteEntries.marksTotal})`.mapWith(Number),
      median: sql<number>`percentile_cont(0.5) within group (order by ${gazetteEntries.marksTotal})`.mapWith(Number),
    }).from(gazetteEntries).where(eq(gazetteEntries.inductionId, induction)),
  ]);
  return { induction, entries: g.entries, importedAt: g.importedAt, statuses: statuses.map((s) => ({ status: s.status ?? "No status", value: s.status, n: s.n })), highest: stats?.highest ?? null, median: stats?.median ?? null };
}

export type GazetteRow = { rank: number; applicantId: string; name: string | null; marksTotal: number; status: string | null; parts: Record<string, number> };

/** The gazette, best marks first, filtered by status and a name or id search, a page at a time. */
export async function gazetteList(db: Database, session: Session | null, input: { induction: number; status?: string; q?: string; page?: number }) {
  assertCan(session, "portal");
  const where = and(
    eq(gazetteEntries.inductionId, input.induction),
    input.status ? (input.status === "No status" ? sql`${gazetteEntries.status} is null` : eq(gazetteEntries.status, input.status)) : undefined,
    searchCondition(input.q, sql`${gazetteEntries.applicantId}`, sql`${gazetteEntries.candidateName}`),
  );
  const [{ n } = { n: 0 }] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(gazetteEntries).where(where);
  const { page, pages } = pageOf(input.page, n ?? 0);
  const rows = await db
    .select({ applicantId: gazetteEntries.applicantId, name: gazetteEntries.candidateName, marksTotal: gazetteEntries.marksTotal, status: gazetteEntries.status, parts: gazetteEntries.parts })
    .from(gazetteEntries)
    .where(where)
    .orderBy(desc(gazetteEntries.marksTotal), gazetteEntries.position)
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);
  return { rows: rows.map((r, i): GazetteRow => ({ ...r, parts: (r.parts ?? {}) as Record<string, number>, rank: (page - 1) * PAGE_SIZE + i + 1 })), total: n ?? 0, page, pages };
}

/**
 * Names for applicant ids in an induction (for estimated lists, which carry ids only):
 * from the gazette, else from the induction's official lists.
 */
export async function namesFor(db: Database, session: Session | null, input: { induction: number; applicantIds: string[] }) {
  assertCan(session, "portal");
  const ids = [...new Set(input.applicantIds)];
  const out = new Map<string, string>();
  if (!ids.length) return out;
  for (let i = 0; i < ids.length; i += 5000) {
    const chunk = ids.slice(i, i + 5000);
    const [fromGazette, fromLists] = await Promise.all([
      db.select({ id: gazetteEntries.applicantId, name: gazetteEntries.candidateName }).from(gazetteEntries)
        .where(and(eq(gazetteEntries.inductionId, input.induction), inArray(gazetteEntries.applicantId, chunk), isNotNull(gazetteEntries.candidateName))),
      db.selectDistinctOn([meritAllocations.applicantId], { id: meritAllocations.applicantId, name: meritAllocations.candidateName })
        .from(meritAllocations).innerJoin(meritRounds, eq(meritRounds.id, meritAllocations.roundId))
        .where(and(eq(meritRounds.inductionId, input.induction), inArray(meritAllocations.applicantId, chunk), isNotNull(meritAllocations.candidateName))),
    ]);
    for (const r of fromLists) if (r.name) out.set(r.id, r.name);
    for (const r of fromGazette) if (r.name) out.set(r.id, r.name);
  }
  return out;
}

/** One applicant in every imported gazette, newest induction first. */
export async function gazetteForApplicant(db: Database, session: Session | null, applicantId: string) {
  assertCan(session, "portal");
  const id = String(applicantId ?? "").replace(/\D/g, "").slice(0, 12);
  if (!id) return [];
  const rows = await db
    .select({ induction: gazetteEntries.inductionId, name: gazetteEntries.candidateName, marksTotal: gazetteEntries.marksTotal, status: gazetteEntries.status, parts: gazetteEntries.parts })
    .from(gazetteEntries)
    .where(eq(gazetteEntries.applicantId, id))
    .orderBy(desc(gazetteEntries.inductionId));
  return Promise.all(rows.map(async (r) => {
    const [{ above } = { above: 0 }] = await db.select({ above: sql<number>`count(*)`.mapWith(Number) }).from(gazetteEntries)
      .where(and(eq(gazetteEntries.inductionId, r.induction), sql`${gazetteEntries.marksTotal} > ${r.marksTotal}`));
    return { ...r, parts: (r.parts ?? {}) as Record<string, number>, rank: (above ?? 0) + 1 };
  }));
}

export type ListStep =
  | { kind: "gazette"; href: string; label: string; note: string }
  | { kind: "official"; href: string; label: string; note: string; roundNo: number }
  | { kind: "estimate"; href: string; label: string; note: string; roundNo: number; runId: string }
  | { kind: "simulate"; href: string; label: string; note: string; roundNo: number };

/**
 * The lists of one induction, in order, for its navigator. A finished induction has
 * its official rounds only. The current one starts with the gazette; each round is
 * official once PHF publishes it and an estimate until then; after the last official
 * round comes "simulate the next one" (or the published estimate of it).
 */
export async function inductionLists(db: Database, session: Session | null, induction: number) {
  assertCan(session, "portal");
  const [rounds, current, [gaz]] = await Promise.all([
    db.select({ roundNo: meritRounds.roundNo }).from(meritRounds).where(eq(meritRounds.inductionId, induction)).orderBy(meritRounds.roundNo),
    currentInduction(db, session),
    db.select({ entries: gazettes.entries }).from(gazettes).where(eq(gazettes.inductionId, induction)).limit(1),
  ]);
  const official = rounds.map((r) => r.roundNo);
  const isCurrent = current?.induction === induction;
  const base = `/portal/history/${induction}`;
  const steps: ListStep[] = [];
  if (isCurrent && gaz) steps.push({ kind: "gazette", href: `${base}/gazette`, label: "Gazette", note: `${gaz.entries.toLocaleString("en-US")} applicants` });
  if (!isCurrent) {
    for (const n of official) steps.push({ kind: "official", href: `${base}/rounds/${n}`, label: `Round ${n}`, note: "Official", roundNo: n });
    return { induction, current: false, official, steps };
  }
  const estimates = (await publishedEstimates(db, session, { induction })).filter((e) => !e.official);
  const last = Math.max(0, ...official, ...estimates.map((e) => e.roundNo));
  for (let n = 1; n <= last; n++) {
    if (official.includes(n)) steps.push({ kind: "official", href: `${base}/rounds/${n}`, label: `Round ${n}`, note: "Official", roundNo: n });
    else {
      const e = estimates.find((x) => x.roundNo === n); // newest first
      if (e) steps.push({ kind: "estimate", href: `${base}/estimates/${e.id}`, label: `Round ${n}`, note: "Estimate", roundNo: n, runId: e.id });
    }
  }
  const lastOfficial = official.at(-1);
  if (lastOfficial && lastOfficial >= last) {
    steps.push({ kind: "simulate", href: `/portal/simulation?i=${induction}&base=${encodeURIComponent(`published:${lastOfficial}`)}`, label: `Round ${lastOfficial + 1}`, note: "Simulate it", roundNo: lastOfficial + 1 });
  }
  return { induction, current: true, official, steps };
}

/**
 * Applicants whose name contains the text (at least 3 letters), from the official
 * lists and the gazettes, newest induction first; at most 30.
 */
export async function searchByName(db: Database, session: Session | null, text: string) {
  assertCan(session, "portal");
  const s = String(text ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
  if (s.replace(/[^\p{L}]/gu, "").length < 3) return [];
  const pattern = likeText(s);
  const rows = (await db.execute(sql`
    with hits as (
      select m.applicant_id, m.candidate_name as name, r.induction_id as induction
      from merit_allocations m join merit_rounds r on r.id = m.round_id
      where m.candidate_name ilike ${pattern}
      union
      select g.applicant_id, g.candidate_name, g.induction_id
      from gazette_entries g where g.candidate_name ilike ${pattern}
    )
    select applicant_id, max(name) as name, array_agg(distinct induction order by induction desc) as inductions
    from hits group by applicant_id
    order by max(induction) desc, max(name)
    limit 30`)) as unknown as { applicant_id: string; name: string; inductions: number[] }[];
  return rows.map((r) => ({ applicantId: r.applicant_id, name: r.name, inductions: r.inductions.map(Number) }));
}
