import "server-only";
import { and, asc, count, desc, eq, inArray, isNull, max, min, sql } from "drizzle-orm";
import { z } from "zod";
import { assertCan, type Session } from "@/lib/auth/roles";
import type { Database } from "@/lib/db/client";
import {
  hospitals,
  inductions,
  inductionSeats,
  meritAllocations,
  meritRounds,
  nameAliases,
  scoringPolicyFileMeta,
  specialities,
} from "@/lib/db/schema";
import { isoDay, meritRoundFileSchema, nameKey } from "@/lib/domain/merit-round";
import { cleanName } from "@/lib/domain/sim-dataset";
import { UserFacingError } from "@/lib/errors";
import { notifyFollowers, notifyShortlists } from "./notifications";
import { postRoundDay } from "./rooms";
import { requireReason, writeAudit, type Db } from "./shared";

/**
 * Merit rounds: import (admin) and browsing (any signed-in user).
 *
 * Browsing functions here return aggregates (counts, closing and opening marks per
 * group); the full list of a round, with names, is in ./lists.ts.
 */

const reasonFor = (reason: string) => requireReason(reason, "merit data changes");
const inductionSchema = z.number().int().min(1).max(999);
const roundNoSchema = z.number().int().min(1).max(99);

export type AliasKind = "speciality" | "hospital";
const lookupTable = { speciality: specialities, hospital: hospitals } as const;

// ── Name resolution ────────────────────────────────────────────────────────────

/** name key → lookup id, from lookup names plus admin aliases (aliases win). */
async function resolver(db: Db, kind: AliasKind) {
  const table = lookupTable[kind];
  const [rows, aliases] = await Promise.all([
    db.select({ id: table.id, name: table.name }).from(table),
    db.select({ key: nameAliases.nameKey, id: nameAliases.lookupId }).from(nameAliases).where(eq(nameAliases.kind, kind)),
  ]);
  const map = new Map<string, number>();
  for (const r of rows) if (!map.has(nameKey(r.name))) map.set(nameKey(r.name), r.id);
  for (const a of aliases) map.set(a.key, a.id);
  return (name: string) => map.get(nameKey(name)) ?? null;
}

// ── Import (admin) ─────────────────────────────────────────────────────────────

/**
 * Import one round file. All or nothing: the file is validated, then in one
 * transaction the induction is created if needed (label and year from the cycle),
 * the round row is created or replaced, and its allocations are written with
 * speciality and hospital resolved to lookups where the name is known.
 */
export async function importMeritRound(
  db: Database,
  session: Session | null,
  input: { roundNo: number; file: unknown; reason: string },
) {
  assertCan(session, "data.edit");
  const roundNo = roundNoSchema.parse(input.roundNo);
  const file = meritRoundFileSchema.parse(input.file);
  const reason = reasonFor(input.reason);
  const cycle = file.Table[0]!;
  const inductionId = cycle.inductionId;

  return db.transaction(async (tx) => {
    const [ind] = await tx.select().from(inductions).where(eq(inductions.id, inductionId)).limit(1);
    if (!ind) {
      const year = Number((isoDay(cycle.endDate) ?? isoDay(cycle.startDate) ?? "").slice(0, 4));
      if (!year) throw new UserFacingError(`Induction ${inductionId} does not exist and the file has no dates to create it from.`);
      await tx.insert(inductions).values({ id: inductionId, label: `Induction ${inductionId} · ${cycle.displayName}`, calendarYear: year, status: "completed" });
    }

    const [prev] = await tx
      .select({ id: meritRounds.id, allocations: meritRounds.allocations })
      .from(meritRounds)
      .where(and(eq(meritRounds.inductionId, inductionId), eq(meritRounds.roundNo, roundNo)))
      .limit(1);
    if (prev) await tx.delete(meritRounds).where(eq(meritRounds.id, prev.id)); // cascades to allocations

    const [round] = await tx
      .insert(meritRounds)
      .values({
        inductionId,
        roundNo,
        cycleCode: cycle.name,
        cycleName: cycle.displayName,
        startsOn: isoDay(cycle.startDate),
        endsOn: isoDay(cycle.endDate),
        allocations: file.Table5.length,
        importedBy: session.email,
      })
      .returning({ id: meritRounds.id });

    const [spec, hosp] = await Promise.all([resolver(tx, "speciality"), resolver(tx, "hospital")]);
    const rows = file.Table5.map((r) => ({
      roundId: round!.id,
      rowNo: r.rowNo,
      applicantId: r.applicantId,
      program: r.type.trim(),
      quota: r.quota.trim(),
      specialityJobId: r.specialityJobId,
      speciality: r.speciality.trim(),
      specialityId: spec(r.speciality),
      hospital: r.hospital.trim(),
      hospitalId: hosp(r.hospital),
      institute: r.institute.trim(),
      seats: r.seats,
      marks: r.marks,
      preferenceNo: r.preferenceNo,
      consent: r.consent.trim(),
      candidateName: cleanName(r.name),
    }));
    // Chunked: one statement per 1,000 rows keeps well under the bind-parameter limit.
    for (let i = 0; i < rows.length; i += 1000) await tx.insert(meritAllocations).values(rows.slice(i, i + 1000));

    // Tell followers of the induction, the round, and the specialities/hospitals in it.
    await notifyFollowers(
      tx,
      [
        { kind: "induction", key: String(inductionId) },
        { kind: "round", key: `${inductionId}:${roundNo}` },
        ...[...new Set(rows.map((r) => r.specialityId).filter((x): x is number => x !== null))].map((id) => ({ kind: "speciality" as const, key: String(id) })),
        ...[...new Set(rows.map((r) => r.hospitalId).filter((x): x is number => x !== null))].map((id) => ({ kind: "hospital" as const, key: String(id) })),
      ],
      { kind: "new_round", title: `Induction ${inductionId}, round ${roundNo} ${prev ? "was updated" : "is out"}`, href: `/portal/history/${inductionId}/rounds/${roundNo}` },
    );
    // People with seats from this round on their shortlist get the closing merit of each.
    const alerted = await notifyShortlists(tx, { induction: inductionId, roundNo, roundId: round!.id });
    // Round day: the round's own figures open the conversation in its room.
    await postRoundDay(tx, { induction: inductionId, roundNo, roundId: round!.id, alerted, updated: Boolean(prev) });

    const unmatched = {
      specialities: [...new Set(rows.filter((r) => r.specialityId === null).map((r) => r.speciality))],
      hospitals: [...new Set(rows.filter((r) => r.hospitalId === null).map((r) => r.hospital))],
    };
    await writeAudit(tx, session.email, {
      action: prev ? "merit_round.replace" : "merit_round.import",
      entityType: "merit_round",
      entityId: `induction:${inductionId}:round:${roundNo}`,
      before: prev ? { allocations: prev.allocations } : null,
      after: { allocations: rows.length, cycle: cycle.name, unmatched },
      reason,
    });
    return { inductionId, roundNo, cycle: cycle.displayName, allocations: rows.length, replaced: Boolean(prev), unmatched };
  });
}

export async function deleteMeritRound(db: Database, session: Session | null, input: { roundId: number; reason: string }) {
  assertCan(session, "data.edit");
  const reason = reasonFor(input.reason);
  return db.transaction(async (tx) => {
    const [r] = await tx.delete(meritRounds).where(eq(meritRounds.id, input.roundId)).returning();
    if (!r) throw new UserFacingError("That round does not exist");
    await writeAudit(tx, session.email, {
      action: "merit_round.delete",
      entityType: "merit_round",
      entityId: `induction:${r.inductionId}:round:${r.roundNo}`,
      before: { allocations: r.allocations, cycle: r.cycleCode },
      reason,
    });
  });
}

/** Published names that matched no lookup, with how many allocations use them. */
export async function listUnmatchedNames(db: Database, session: Session | null) {
  assertCan(session, "staff");
  const [spec, hosp] = await Promise.all([
    db
      .select({ name: meritAllocations.speciality, rows: count() })
      .from(meritAllocations)
      .where(isNull(meritAllocations.specialityId))
      .groupBy(meritAllocations.speciality)
      .orderBy(desc(count())),
    db
      .select({ name: meritAllocations.hospital, rows: count() })
      .from(meritAllocations)
      .where(isNull(meritAllocations.hospitalId))
      .groupBy(meritAllocations.hospital)
      .orderBy(desc(count())),
  ]);
  return { speciality: spec, hospital: hosp };
}

/** Map a published name to a lookup id, and apply it to every allocation that uses it. */
export async function saveNameAlias(
  db: Database,
  session: Session | null,
  input: { kind: AliasKind; name: string; lookupId: number; reason: string },
) {
  assertCan(session, "data.edit");
  const reason = reasonFor(input.reason);
  const key = nameKey(input.name);
  if (!key) throw new UserFacingError("The name is empty");
  const table = lookupTable[input.kind];
  return db.transaction(async (tx) => {
    const [target] = await tx.select({ id: table.id, name: table.name }).from(table).where(eq(table.id, input.lookupId)).limit(1);
    if (!target) throw new UserFacingError(`No ${input.kind} with id ${input.lookupId}`);
    await tx
      .insert(nameAliases)
      .values({ kind: input.kind, nameKey: key, lookupId: target.id, createdBy: session.email })
      .onConflictDoUpdate({ target: [nameAliases.kind, nameAliases.nameKey], set: { lookupId: target.id, createdBy: session.email, createdAt: new Date() } });

    // Apply to existing rows whose published name has this key.
    const col = input.kind === "speciality" ? meritAllocations.speciality : meritAllocations.hospital;
    const names = (await tx.selectDistinct({ name: col }).from(meritAllocations)).map((r) => r.name).filter((n) => nameKey(n) === key);
    let updated = 0;
    if (names.length) {
      const set = input.kind === "speciality" ? { specialityId: target.id } : { hospitalId: target.id };
      const res = await tx.update(meritAllocations).set(set).where(inArray(col, names)).returning({ r: meritAllocations.rowNo });
      updated = res.length;
    }
    await writeAudit(tx, session.email, {
      action: "name_alias.save",
      entityType: `${input.kind}_alias`,
      entityId: key,
      after: { lookupId: target.id, lookupName: target.name, rowsUpdated: updated },
      reason,
    });
    return { target: target.name, updated };
  });
}

// ── Browsing (signed-in users; aggregates only) ────────────────────────────────

/** Total marks per induction, from the imported scoring_policy.json (`_induction_max`). */
export async function inductionMaxMarks(db: Database): Promise<Record<number, number>> {
  const [row] = await db.select({ meta: scoringPolicyFileMeta.meta }).from(scoringPolicyFileMeta).orderBy(desc(scoringPolicyFileMeta.id)).limit(1);
  const raw = (row?.meta as { _induction_max?: Record<string, unknown> } | undefined)?._induction_max ?? {};
  const out: Record<number, number> = {};
  for (const [k, v] of Object.entries(raw)) if (/^\d+$/.test(k) && typeof v === "number") out[Number(k)] = v;
  return out;
}

export async function listInductionsWithRounds(db: Database, session: Session | null) {
  assertCan(session, "portal");
  const [inds, rounds, maxMarks] = await Promise.all([
    db.select().from(inductions).orderBy(desc(inductions.id)),
    db
      .select({
        id: meritRounds.id,
        inductionId: meritRounds.inductionId,
        roundNo: meritRounds.roundNo,
        cycleCode: meritRounds.cycleCode,
        cycleName: meritRounds.cycleName,
        startsOn: meritRounds.startsOn,
        endsOn: meritRounds.endsOn,
        allocations: meritRounds.allocations,
        importedAt: meritRounds.importedAt,
      })
      .from(meritRounds)
      .orderBy(asc(meritRounds.inductionId), asc(meritRounds.roundNo)),
    inductionMaxMarks(db),
  ]);
  return inds
    .map((i) => ({ ...i, maxMarks: maxMarks[i.id] ?? null, rounds: rounds.filter((r) => r.inductionId === i.id) }))
    .filter((i) => i.rounds.length > 0);
}

export async function getRound(db: Database, session: Session | null, induction: number, roundNo: number) {
  assertCan(session, "portal");
  const [r] = await db
    .select()
    .from(meritRounds)
    .where(and(eq(meritRounds.inductionId, inductionSchema.parse(induction)), eq(meritRounds.roundNo, roundNoSchema.parse(roundNo))))
    .limit(1);
  return r ?? null;
}

/**
 * Per-round totals for an induction: allocations by consent state, distinct
 * candidates, and the median closing merit across programme/quota/speciality
 * groups. The median is used because the single lowest allocation is set by small
 * special quotas and barely moves.
 */
export async function inductionTimeline(db: Database, session: Session | null, induction: number) {
  assertCan(session, "portal");
  const ind = inductionSchema.parse(induction);
  const rows = (await db.execute(sql`
    with g as (
      select m.round_id, min(m.marks) as closing
      from merit_allocations m join merit_rounds r on r.id = m.round_id
      where r.induction_id = ${ind}
      group by m.round_id, m.program, m.quota, m.speciality)
    select r.round_no, r.cycle_name,
      count(m.*)::int as allocations,
      (count(*) filter (where m.consent = 'Accepted'))::int as accepted,
      (count(*) filter (where m.consent = 'Rejected'))::int as rejected,
      (count(*) filter (where m.consent = 'Not Avail'))::int as not_avail,
      count(distinct m.applicant_id)::int as applicants,
      (select percentile_cont(0.5) within group (order by g.closing) from g where g.round_id = r.id) as median_closing
    from merit_rounds r join merit_allocations m on m.round_id = r.id
    where r.induction_id = ${ind}
    group by r.id, r.round_no, r.cycle_name
    order by r.round_no`)) as unknown as {
    round_no: number; cycle_name: string; allocations: number; accepted: number; rejected: number; not_avail: number; applicants: number; median_closing: number | null;
  }[];
  return rows.map((r) => ({
    roundNo: r.round_no,
    cycleName: r.cycle_name,
    allocations: r.allocations,
    accepted: r.accepted,
    rejected: r.rejected,
    notAvail: r.not_avail,
    applicants: r.applicants,
    medianClosing: r.median_closing == null ? null : Number(r.median_closing),
  }));
}

export type RoundFilters = { program?: string; quota?: string; speciality?: string; hospital?: string };

/**
 * Closing merit for a round, grouped by programme, quota, speciality and hospital,
 * with the same group's closing marks in the previous round for comparison.
 */
export async function roundGroups(db: Database, session: Session | null, roundId: number, prevRoundId: number | null, f: RoundFilters = {}) {
  assertCan(session, "portal");
  const where = (id: number) =>
    and(
      eq(meritAllocations.roundId, id),
      f.program ? eq(meritAllocations.program, f.program) : undefined,
      f.quota ? eq(meritAllocations.quota, f.quota) : undefined,
      f.speciality ? eq(meritAllocations.speciality, f.speciality) : undefined,
      f.hospital ? eq(meritAllocations.hospital, f.hospital) : undefined,
    );
  const group = [meritAllocations.program, meritAllocations.quota, meritAllocations.speciality, meritAllocations.hospital] as const;
  const select = {
    program: meritAllocations.program,
    quota: meritAllocations.quota,
    speciality: meritAllocations.speciality,
    specialityId: max(meritAllocations.specialityId),
    hospital: meritAllocations.hospital,
    hospitalId: max(meritAllocations.hospitalId),
    allocations: count(),
    accepted: sql<number>`count(*) filter (where ${meritAllocations.consent} = 'Accepted')`.mapWith(Number),
    closing: min(meritAllocations.marks),
    opening: max(meritAllocations.marks),
  };
  const [now, before] = await Promise.all([
    db.select(select).from(meritAllocations).where(where(roundId)).groupBy(...group),
    prevRoundId ? db.select(select).from(meritAllocations).where(where(prevRoundId)).groupBy(...group) : Promise.resolve([]),
  ]);
  const key = (r: { program: string; quota: string; speciality: string; hospital: string }) => [r.program, r.quota, r.speciality, r.hospital].join("|");
  const prev = new Map(before.map((r) => [key(r), r.closing]));
  return now
    .map((r) => ({ ...r, prevClosing: prev.get(key(r)) ?? null }))
    .sort((a, b) => a.speciality.localeCompare(b.speciality) || (b.closing ?? 0) - (a.closing ?? 0));
}

/** Distinct values present in a round, for the filter pickers. */
export async function roundFacets(db: Database, session: Session | null, roundId: number) {
  assertCan(session, "portal");
  type TextCol = typeof meritAllocations.program | typeof meritAllocations.quota | typeof meritAllocations.speciality | typeof meritAllocations.hospital | typeof meritAllocations.consent;
  const distinct = async (col: TextCol) =>
    (await db.selectDistinct({ v: col }).from(meritAllocations).where(eq(meritAllocations.roundId, roundId)).orderBy(asc(col))).map((r) => r.v);
  const [program, quota, speciality, hospital, consent] = await Promise.all([
    distinct(meritAllocations.program),
    distinct(meritAllocations.quota),
    distinct(meritAllocations.speciality),
    distinct(meritAllocations.hospital),
    distinct(meritAllocations.consent),
  ]);
  return { program, quota, speciality, hospital, consent: consent.filter(Boolean) };
}

/**
 * What changed between two rounds of one induction: closing merit per programme,
 * quota and speciality, and how many applicants entered, left or moved seat line.
 */
export async function compareRounds(db: Database, session: Session | null, induction: number, fromNo: number, toNo: number) {
  assertCan(session, "portal");
  const [a, b] = await Promise.all([getRound(db, session, induction, fromNo), getRound(db, session, induction, toNo)]);
  if (!a || !b) return null;
  const closing = (roundId: number) =>
    db
      .select({
        program: meritAllocations.program,
        quota: meritAllocations.quota,
        speciality: meritAllocations.speciality,
        specialityId: max(meritAllocations.specialityId),
        closing: min(meritAllocations.marks),
        allocations: count(),
      })
      .from(meritAllocations)
      .where(eq(meritAllocations.roundId, roundId))
      .groupBy(meritAllocations.program, meritAllocations.quota, meritAllocations.speciality);
  const [ca, cb] = await Promise.all([closing(a.id), closing(b.id)]);
  const k = (r: { program: string; quota: string; speciality: string }) => `${r.program}|${r.quota}|${r.speciality}`;
  const fromMap = new Map(ca.map((r) => [k(r), r]));
  const groups = cb
    .map((r) => {
      const f = fromMap.get(k(r));
      return { ...r, fromClosing: f?.closing ?? null, fromAllocations: f?.allocations ?? 0, delta: f?.closing != null && r.closing != null ? r.closing - f.closing : null };
    })
    .sort((x, y) => (x.delta ?? 0) - (y.delta ?? 0));

  // Movement, computed in SQL so applicant ids stay in the database.
  const [movement] = (await db.execute(sql`
    with a as (select applicant_id, program, quota, speciality_job_id from merit_allocations where round_id = ${a.id}),
         b as (select applicant_id, program, quota, speciality_job_id from merit_allocations where round_id = ${b.id})
    select
      (select count(*) from b where not exists (select 1 from a where a.applicant_id = b.applicant_id and a.program = b.program and a.quota = b.quota))::int as entered,
      (select count(*) from a where not exists (select 1 from b where b.applicant_id = a.applicant_id and b.program = a.program and b.quota = a.quota))::int as left_,
      (select count(*) from a join b on a.applicant_id = b.applicant_id and a.program = b.program and a.quota = b.quota and a.speciality_job_id <> b.speciality_job_id)::int as moved
  `)) as unknown as { entered: number; left_: number; moved: number }[];

  return { from: a, to: b, groups, movement: { entered: movement?.entered ?? 0, left: movement?.left_ ?? 0, moved: movement?.moved ?? 0 } };
}

/** Lookup rows that appear in merit data or seat matrices, with counts, for the explore index. */
export async function exploreIndex(db: Database, session: Session | null) {
  assertCan(session, "portal");
  const [spec, hosp] = await Promise.all([
    db
      .select({ id: specialities.id, name: specialities.name, allocations: count(meritAllocations.rowNo) })
      .from(specialities)
      .leftJoin(meritAllocations, eq(meritAllocations.specialityId, specialities.id))
      .groupBy(specialities.id, specialities.name)
      .orderBy(asc(specialities.name)),
    db
      .select({ id: hospitals.id, name: hospitals.name, allocations: count(meritAllocations.rowNo) })
      .from(hospitals)
      .leftJoin(meritAllocations, eq(meritAllocations.hospitalId, hospitals.id))
      .groupBy(hospitals.id, hospitals.name)
      .orderBy(asc(hospitals.name)),
  ]);
  return { specialities: spec, hospitals: hosp };
}

/**
 * A speciality across inductions and rounds: closing marks per (induction, round,
 * programme, quota), plus the published names that mapped to it.
 */
export async function specialityHistory(db: Database, session: Session | null, specialityId: number) {
  assertCan(session, "portal");
  const [s] = await db.select().from(specialities).where(eq(specialities.id, specialityId)).limit(1);
  if (!s) return null;
  const [rows, byHospital, maxMarks] = await Promise.all([
    db
      .select({
        inductionId: meritRounds.inductionId,
        roundNo: meritRounds.roundNo,
        program: meritAllocations.program,
        quota: meritAllocations.quota,
        closing: min(meritAllocations.marks),
        allocations: count(),
      })
      .from(meritAllocations)
      .innerJoin(meritRounds, eq(meritRounds.id, meritAllocations.roundId))
      .where(eq(meritAllocations.specialityId, specialityId))
      .groupBy(meritRounds.inductionId, meritRounds.roundNo, meritAllocations.program, meritAllocations.quota)
      .orderBy(asc(meritRounds.inductionId), asc(meritRounds.roundNo)),
    // Latest round of the latest induction that has this speciality: closing per hospital.
    db.execute(sql`
      with latest as (
        select r.id, r.induction_id, r.round_no from merit_rounds r
        where exists (select 1 from merit_allocations m where m.round_id = r.id and m.speciality_id = ${specialityId})
        order by r.induction_id desc, r.round_no desc limit 1)
      select m.program, m.quota, m.hospital, max(m.hospital_id) as hospital_id, min(m.marks) as closing, count(*)::int as allocations,
             (select induction_id from latest) as induction_id, (select round_no from latest) as round_no
      from merit_allocations m join latest on m.round_id = latest.id
      where m.speciality_id = ${specialityId}
      group by m.program, m.quota, m.hospital
      order by min(m.marks) desc`),
    inductionMaxMarks(db),
  ]);
  return {
    speciality: s,
    rows,
    maxMarks,
    byHospital: byHospital as unknown as { program: string; quota: string; hospital: string; hospital_id: number | null; closing: number; allocations: number; induction_id: number; round_no: number }[],
  };
}

/** A hospital: seats by speciality (latest seat matrix) and closing merit in its latest round. */
export async function hospitalProfile(db: Database, session: Session | null, hospitalId: number) {
  assertCan(session, "portal");
  const [h] = await db.select().from(hospitals).where(eq(hospitals.id, hospitalId)).limit(1);
  if (!h) return null;
  const [seatRows, closing] = await Promise.all([
    db.execute(sql`
      with latest as (select max(induction_id) as ind from induction_seats where hospital_id = ${hospitalId})
      select s.speciality_id, sp.name as speciality, p.name as program, q.name as quota, sum(s.seats)::int as seats, (select ind from latest) as induction_id
      from induction_seats s
      join specialities sp on sp.id = s.speciality_id
      join programs p on p.id = s.program_id
      join quotas q on q.id = s.quota_id
      where s.hospital_id = ${hospitalId} and s.induction_id = (select ind from latest)
      group by s.speciality_id, sp.name, p.name, q.name
      order by sum(s.seats) desc, sp.name`),
    db.execute(sql`
      with latest as (
        select r.id, r.induction_id, r.round_no from merit_rounds r
        where exists (select 1 from merit_allocations m where m.round_id = r.id and m.hospital_id = ${hospitalId})
        order by r.induction_id desc, r.round_no desc limit 1)
      select m.speciality, max(m.speciality_id) as speciality_id, m.program, m.quota, min(m.marks) as closing, count(*)::int as allocations,
             (select induction_id from latest) as induction_id, (select round_no from latest) as round_no
      from merit_allocations m join latest on m.round_id = latest.id
      where m.hospital_id = ${hospitalId}
      group by m.speciality, m.program, m.quota
      order by min(m.marks) desc`),
  ]);
  return {
    hospital: h,
    seats: seatRows as unknown as { speciality_id: number; speciality: string; program: string; quota: string; seats: number; induction_id: number }[],
    closing: closing as unknown as { speciality: string; speciality_id: number | null; program: string; quota: string; closing: number; allocations: number; induction_id: number; round_no: number }[],
    maxMarks: await inductionMaxMarks(db),
  };
}

/** Headline numbers for dashboards. */
export async function meritOverview(db: Database, session: Session | null) {
  assertCan(session, "portal");
  const [[r], [a], [s]] = await Promise.all([
    db.select({ rounds: count(), inductions: sql<number>`count(distinct ${meritRounds.inductionId})`.mapWith(Number) }).from(meritRounds),
    db.select({ allocations: count() }).from(meritAllocations),
    db.select({ seats: sql<number>`coalesce(sum(${inductionSeats.seats}), 0)`.mapWith(Number), hospitals: sql<number>`count(distinct ${inductionSeats.hospitalId})`.mapWith(Number) }).from(inductionSeats),
  ]);
  return { rounds: r?.rounds ?? 0, inductions: r?.inductions ?? 0, allocations: a?.allocations ?? 0, seats: s?.seats ?? 0, hospitals: s?.hospitals ?? 0 };
}


/**
 * The latest round of the latest induction against the round before it: allocations,
 * acceptances and median closing merit. Null when there is no earlier round.
 */
export async function latestRoundChange(db: Database, session: Session | null) {
  assertCan(session, "portal");
  const [latest] = await db.select({ ind: meritRounds.inductionId }).from(meritRounds).orderBy(desc(meritRounds.inductionId)).limit(1);
  if (!latest) return null;
  const t = await inductionTimeline(db, session, latest.ind);
  const now = t.at(-1), before = t.at(-2);
  if (!now) return null;
  return { induction: latest.ind, now, before: before ?? null };
}

/** Seats per induction, in total and by programme, from the seat matrices (merit lists page). */
export async function seatTrends(db: Database, session: Session | null) {
  assertCan(session, "portal");
  const rows = (await db.execute(sql`
    select s.induction_id, trim(p.name) as program, sum(s.seats)::int as seats
    from induction_seats s join programs p on p.id = s.program_id
    group by 1, 2 order by 1, 2`)) as unknown as { induction_id: number; program: string; seats: number }[];
  const inductions = [...new Set(rows.map((r) => r.induction_id))].sort((a, b) => a - b);
  const programs = [...new Set(rows.map((r) => r.program))].sort();
  const at = (i: number, p?: string) => rows.filter((r) => r.induction_id === i && (!p || r.program === p)).reduce((n, r) => n + r.seats, 0);
  return {
    inductions,
    total: inductions.map((i) => at(i)),
    byProgram: programs.map((p) => ({ program: p, values: inductions.map((i) => (rows.some((r) => r.induction_id === i && r.program === p) ? at(i, p) : null)) })),
  };
}

// ── Find an applicant (as the public site's "find yourself") ─────────────────────

export type ApplicantRound = {
  induction: number; roundNo: number; program: string; quota: string; speciality: string; specialityId: number | null;
  hospital: string; hospitalId: number | null; marks: number; preferenceNo: number; consent: string; closing: number; groupSize: number;
};

/**
 * Everything published about one applicant id: their allocation in every round of every
 * induction (with that seat group's closing merit), their place in published estimates,
 * and, for their latest seats, everyone else in the same seat group. Applicant ids, marks
 * and seats, with the name PHF printed on the lists.
 */
export async function findApplicant(db: Database, session: Session | null, rawId: string) {
  assertCan(session, "portal");
  const id = String(rawId ?? "").replace(/\D/g, "").slice(0, 12);
  if (!id) return null;
  const rounds = (await db.execute(sql`
    select r.induction_id as induction, r.round_no, m.program, m.quota, m.speciality, m.speciality_id, m.hospital, m.hospital_id,
           m.marks, m.preference_no, m.consent, m.round_id, m.candidate_name,
           (select min(x.marks) from merit_allocations x where x.round_id = m.round_id and x.program = m.program and x.quota = m.quota and x.speciality = m.speciality and x.hospital = m.hospital) as closing,
           (select count(*) from merit_allocations x where x.round_id = m.round_id and x.program = m.program and x.quota = m.quota and x.speciality = m.speciality and x.hospital = m.hospital)::int as group_size
    from merit_allocations m join merit_rounds r on r.id = m.round_id
    where m.applicant_id = ${id}
    order by r.induction_id desc, r.round_no desc, m.program`)) as unknown as {
    induction: number; round_no: number; program: string; quota: string; speciality: string; speciality_id: number | null; hospital: string; hospital_id: number | null;
    marks: number; preference_no: number; consent: string; round_id: number; candidate_name: string | null; closing: number; group_size: number;
  }[];
  const estimates = (await db.execute(sql`
    select s.run_id, sr.induction_id as induction, case when sr.kind = 'next_round' then sr.from_round + 1 else 1 end as round_no,
           s.program, s.quota, s.speciality, s.hospital, s.mark, s.preference_no
    from simulation_placements s join simulation_runs sr on sr.id = s.run_id
    where s.applicant_id = ${id} and sr.published_at is not null
    order by sr.published_at desc`)) as unknown as { run_id: string; induction: number; round_no: number; program: string; quota: string; speciality: string; hospital: string; mark: number; preference_no: number }[];

  // Who else holds the same seats in their latest round.
  const latest = rounds[0] ? rounds.filter((r) => r.induction === rounds[0]!.induction && r.round_no === rounds[0]!.round_no) : [];
  const neighbours = await Promise.all(latest.map(async (r) => ({
    program: r.program.trim(), quota: r.quota.trim(), speciality: r.speciality.trim(), hospital: r.hospital.trim(),
    people: ((await db.execute(sql`
      select applicant_id, candidate_name, marks, preference_no, consent from merit_allocations
      where round_id = ${r.round_id} and program = ${r.program} and quota = ${r.quota} and speciality = ${r.speciality} and hospital = ${r.hospital}
      order by marks desc`)) as unknown as { applicant_id: string; candidate_name: string | null; marks: number; preference_no: number; consent: string }[])
      .map((p) => ({ applicantId: p.applicant_id, name: p.candidate_name, marks: Number(p.marks), preferenceNo: p.preference_no, consent: p.consent })),
  })));

  return {
    applicantId: id,
    name: rounds.find((r) => r.candidate_name)?.candidate_name ?? null,
    rounds: rounds.map((r): ApplicantRound => ({
      induction: r.induction, roundNo: r.round_no, program: r.program.trim(), quota: r.quota.trim(), speciality: r.speciality.trim(), specialityId: r.speciality_id,
      hospital: r.hospital.trim(), hospitalId: r.hospital_id, marks: Number(r.marks), preferenceNo: r.preference_no, consent: r.consent, closing: Number(r.closing), groupSize: r.group_size,
    })),
    estimates: estimates.map((e) => ({ runId: e.run_id, induction: e.induction, roundNo: e.round_no, program: e.program, quota: e.quota, speciality: e.speciality, hospital: e.hospital, mark: Number(e.mark), preferenceNo: e.preference_no })),
    neighbours,
  };
}
