import "server-only";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { assertCan, type Session } from "@/lib/auth/roles";
import type { Database } from "@/lib/db/client";
import { candidateCorrections, candidateIdentities, candidateLinks, meritAllocations, meritRounds, simCandidates, simDatasets, users } from "@/lib/db/schema";
import { applyCorrections, profileStatusLabel, toCsv, type Correction } from "@/lib/domain/corrections";
import { UserFacingError } from "@/lib/errors";
import { requireReason, writeAudit } from "./shared";

/**
 * Candidate records for staff who handle them (candidates.verify): search, one
 * applicant's record across inductions, corrections, likely duplicates and export.
 *
 * Only what the app already keeps is shown: applicant IDs, published allocations,
 * simulation inputs and the linked account's email. Names, PMDC numbers, phones and
 * CNICs are never stored, so they cannot appear here.
 */

export const RECORDS_PAGE = 50;
export const RECORD_FILTERS = ["all", "linked", "unlinked", "corrected", "placed", "not_placed", "rejected_profile"] as const;
export type RecordFilter = (typeof RECORD_FILTERS)[number];

/** Inductions with candidate data (published rounds or a simulation dataset), newest first. */
export async function recordInductions(db: Database, session: Session | null) {
  assertCan(session, "candidates.verify");
  const rounds = await db.selectDistinct({ id: meritRounds.inductionId }).from(meritRounds);
  const sims = await db.select({ id: simDatasets.inductionId }).from(simDatasets);
  const simIds = new Set(sims.map((r) => r.id));
  return [...new Set([...rounds.map((r) => r.id), ...simIds])].sort((a, b) => b - a).map((id) => ({ induction: id, simulation: simIds.has(id) }));
}

export type RecordRow = {
  applicantId: string;
  lastRound: number | null;
  lastSeat: string | null;
  bestMarks: number | null;
  baseMarks: number | null;
  profileStatus: string | null;
  linked: boolean;
  corrections: number;
};

/**
 * Applicants of one induction: anyone on a published round or in its simulation
 * data. `q` matches the start of an applicant ID; `program` an allocation or
 * preference programme.
 */
export async function searchRecords(
  db: Database,
  session: Session | null,
  input: { induction: number; q?: string; program?: string; filter?: RecordFilter; page?: number },
): Promise<{ rows: RecordRow[]; total: number; programs: string[] }> {
  assertCan(session, "candidates.verify");
  const i = input.induction;
  const q = (input.q ?? "").replace(/\D/g, "");
  const program = input.program?.trim() || null;
  const filter = input.filter ?? "all";
  const page = Math.max(1, Math.floor(input.page ?? 1));

  const where = sql.join(
    [
      sql`true`,
      q ? sql`ids.applicant_id like ${`${q}%`}` : sql`true`,
      program
        ? sql`(exists (select 1 from merit_allocations a join merit_rounds r on r.id = a.round_id where r.induction_id = ${i} and a.applicant_id = ids.applicant_id and trim(a.program) = ${program})
              or exists (select 1 from sim_preferences p where p.induction_id = ${i} and p.applicant_id = ids.applicant_id and trim(p.program) = ${program}))`
        : sql`true`,
      filter === "linked" ? sql`link.applicant_id is not null` : filter === "unlinked" ? sql`link.applicant_id is null` : sql`true`,
      filter === "corrected" ? sql`coalesce(corr.n, 0) > 0` : sql`true`,
      filter === "placed" ? sql`pub.last_round is not null` : filter === "not_placed" ? sql`pub.last_round is null` : sql`true`,
      filter === "rejected_profile" ? sql`sim.profile_status = 2` : sql`true`,
    ],
    sql` and `,
  );
  const base = sql`
    with pub as (
      select distinct on (a.applicant_id) a.applicant_id, r.round_no as last_round,
             trim(a.program) || ' · ' || trim(a.quota) || ' · ' || trim(a.speciality) || ' · ' || trim(a.hospital) as last_seat,
             max(a.marks) over (partition by a.applicant_id) as best_marks
      from merit_allocations a join merit_rounds r on r.id = a.round_id
      where r.induction_id = ${i}
      order by a.applicant_id, r.round_no desc, a.row_no
    ),
    sim as (select applicant_id, base_marks, profile_status from sim_candidates where induction_id = ${i}),
    ids as (select applicant_id from pub union select applicant_id from sim),
    link as (select applicant_id from candidate_links where status = 'verified'),
    corr as (select applicant_id, count(*)::int as n from candidate_corrections where induction_id = ${i} and revoked_at is null group by applicant_id)
    select ids.applicant_id, pub.last_round, pub.last_seat, pub.best_marks, sim.base_marks, sim.profile_status,
           link.applicant_id is not null as linked, coalesce(corr.n, 0) as corrections, count(*) over () as total
    from ids
    left join pub on pub.applicant_id = ids.applicant_id
    left join sim on sim.applicant_id = ids.applicant_id
    left join link on link.applicant_id = ids.applicant_id
    left join corr on corr.applicant_id = ids.applicant_id
    where ${where}
    order by length(ids.applicant_id), ids.applicant_id
    limit ${RECORDS_PAGE} offset ${(page - 1) * RECORDS_PAGE}`;
  const rows = (await db.execute(base)) as unknown as {
    applicant_id: string; last_round: number | null; last_seat: string | null; best_marks: number | null; base_marks: number | null;
    profile_status: number | null; linked: boolean; corrections: number; total: string | number;
  }[];
  const programs = (await db.execute(sql`
    select distinct trim(a.program) as program from merit_allocations a join merit_rounds r on r.id = a.round_id where r.induction_id = ${i}
    union select distinct trim(program) from sim_preferences where induction_id = ${i}
    order by 1`)) as unknown as { program: string }[];
  return {
    rows: rows.map((r) => ({
      applicantId: r.applicant_id,
      lastRound: r.last_round,
      lastSeat: r.last_seat,
      bestMarks: r.best_marks == null ? null : Number(r.best_marks),
      baseMarks: r.base_marks == null ? null : Number(r.base_marks),
      profileStatus: r.base_marks == null ? null : profileStatusLabel(r.profile_status),
      linked: r.linked,
      corrections: Number(r.corrections),
    })),
    total: Number(rows[0]?.total ?? 0),
    programs: programs.map((p) => p.program),
  };
}

/** One applicant across inductions: published allocations, link, corrections and identity flags. */
export async function candidateRecord(db: Database, session: Session | null, applicantId: string) {
  assertCan(session, "candidates.verify");
  if (!/^\d{1,12}$/.test(applicantId)) return null;
  const allocations = await db
    .select({ induction: meritRounds.inductionId, roundNo: meritRounds.roundNo, cycle: meritRounds.cycleName, program: meritAllocations.program, quota: meritAllocations.quota, speciality: meritAllocations.speciality, hospital: meritAllocations.hospital, marks: meritAllocations.marks, preferenceNo: meritAllocations.preferenceNo, consent: meritAllocations.consent })
    .from(meritAllocations)
    .innerJoin(meritRounds, eq(meritRounds.id, meritAllocations.roundId))
    .where(eq(meritAllocations.applicantId, applicantId))
    .orderBy(desc(meritRounds.inductionId), asc(meritRounds.roundNo), asc(meritAllocations.preferenceNo));
  const sims = await db.select({ induction: simCandidates.inductionId }).from(simCandidates).where(eq(simCandidates.applicantId, applicantId));
  if (!allocations.length && !sims.length) return null;
  const links = await db
    .select({ id: candidateLinks.id, email: users.email, status: candidateLinks.status, method: candidateLinks.method, reviewedBy: candidateLinks.reviewedBy, reviewedAt: candidateLinks.reviewedAt, createdAt: candidateLinks.createdAt, reason: candidateLinks.reason })
    .from(candidateLinks)
    .innerJoin(users, eq(users.id, candidateLinks.userId))
    .where(eq(candidateLinks.applicantId, applicantId))
    .orderBy(desc(candidateLinks.createdAt));
  const corrections = await db.select().from(candidateCorrections).where(eq(candidateCorrections.applicantId, applicantId)).orderBy(desc(candidateCorrections.createdAt));
  const [identity] = await db.select({ emailHmac: candidateIdentities.emailHmac, pmdcHmac: candidateIdentities.pmdcHmac, lastInduction: candidateIdentities.lastInduction }).from(candidateIdentities).where(eq(candidateIdentities.applicantId, applicantId)).limit(1);
  const sameAs = identity ? await sharedIdentities(db, [identity]) : [];
  const inductions = [...new Set([...allocations.map((a) => a.induction), ...sims.map((s) => s.induction)])].sort((a, b) => b - a);
  return {
    applicantId,
    inductions,
    simulation: sims.map((s) => s.induction),
    allocations,
    links,
    corrections: corrections.map((c) => ({ id: c.id, induction: c.inductionId, field: c.field, program: c.program, value: c.value, reason: c.reason, createdBy: c.createdBy, createdAt: c.createdAt, revokedBy: c.revokedBy, revokedAt: c.revokedAt, changeId: c.changeId })),
    identity: identity ? { email: identity.emailHmac != null, pmdc: identity.pmdcHmac != null, lastInduction: identity.lastInduction } : null,
    possibleDuplicates: sameAs.filter((d) => d.applicantId !== applicantId),
  };
}

/** Other applicant IDs sharing an email or PMDC number (by keyed hash) with the given identities. */
async function sharedIdentities(db: Database, ids: { emailHmac: string | null; pmdcHmac: string | null }[]) {
  const emails = ids.map((i) => i.emailHmac).filter((v): v is string => !!v);
  const pmdcs = ids.map((i) => i.pmdcHmac).filter((v): v is string => !!v);
  const out: { applicantId: string; by: "email" | "pmdc" }[] = [];
  if (emails.length) for (const r of await db.select({ applicantId: candidateIdentities.applicantId }).from(candidateIdentities).where(inArray(candidateIdentities.emailHmac, emails))) out.push({ ...r, by: "email" });
  if (pmdcs.length) for (const r of await db.select({ applicantId: candidateIdentities.applicantId }).from(candidateIdentities).where(inArray(candidateIdentities.pmdcHmac, pmdcs))) out.push({ ...r, by: "pmdc" });
  return out;
}

export type DuplicateGroup = { by: "email" | "pmdc"; applicantIds: string[]; linked: string[]; lastInduction: number };

/**
 * Applicant IDs that share an email or a PMDC number on the official record — most
 * often one person who applied under two IDs. Compared by keyed hash; the values
 * themselves are never stored.
 */
export async function duplicateGroups(db: Database, session: Session | null, opts: { limit?: number } = {}): Promise<{ groups: DuplicateGroup[]; total: number }> {
  assertCan(session, "candidates.verify");
  const rows = (await db.execute(sql`
    select by, ids, last_induction, count(*) over () as total from (
      select 'email' as by, array_agg(applicant_id order by applicant_id) as ids, max(last_induction) as last_induction
        from candidate_identities where email_hmac is not null group by email_hmac having count(*) > 1
      union all
      select 'pmdc', array_agg(applicant_id order by applicant_id), max(last_induction)
        from candidate_identities where pmdc_hmac is not null group by pmdc_hmac having count(*) > 1
    ) g
    order by last_induction desc, ids[1]
    limit ${opts.limit ?? 200}`)) as unknown as { by: "email" | "pmdc"; ids: string[]; last_induction: number; total: string | number }[];
  const all = [...new Set(rows.flatMap((r) => r.ids))];
  const linked = all.length
    ? new Set((await db.select({ id: candidateLinks.applicantId }).from(candidateLinks).where(and(eq(candidateLinks.status, "verified"), inArray(candidateLinks.applicantId, all)))).map((r) => r.id))
    : new Set<string>();
  return {
    groups: rows.map((r) => ({ by: r.by, applicantIds: r.ids, linked: r.ids.filter((id) => linked.has(id)), lastInduction: r.last_induction })),
    total: Number(rows[0]?.total ?? 0),
  };
}

export async function duplicateCount(db: Database, session: Session | null) {
  assertCan(session, "candidates.verify");
  const [r] = (await db.execute(sql`
    select (select count(*) from (select 1 from candidate_identities where email_hmac is not null group by email_hmac having count(*) > 1) e)
         + (select count(*) from (select 1 from candidate_identities where pmdc_hmac is not null group by pmdc_hmac having count(*) > 1) p) as n`)) as unknown as { n: string | number }[];
  return Number(r?.n ?? 0);
}

/**
 * One induction's candidates as CSV: simulation inputs (corrections applied, with
 * the imported value alongside when corrected) and published placement. No personal
 * fields exist to export. The export is recorded in the audit history.
 */
export async function exportRecordsCsv(db: Database, session: Session | null, induction: number): Promise<{ filename: string; csv: string; rows: number }> {
  assertCan(session, "candidates.verify");
  const sim = await db.select({ applicantId: simCandidates.applicantId, baseMarks: simCandidates.baseMarks, programMarks: simCandidates.programMarks, profileStatus: simCandidates.profileStatus })
    .from(simCandidates).where(eq(simCandidates.inductionId, induction));
  const corr = (await db.select({ applicantId: candidateCorrections.applicantId, field: candidateCorrections.field, program: candidateCorrections.program, value: candidateCorrections.value })
    .from(candidateCorrections).where(and(eq(candidateCorrections.inductionId, induction), isNull(candidateCorrections.revokedAt))).orderBy(asc(candidateCorrections.createdAt))) as Correction[];
  const imported = new Map(sim.map((s) => [s.applicantId, { ...s, programMarks: s.programMarks as Record<string, number> }]));
  const effective = new Map(applyCorrections([...imported.values()], corr).map((s) => [s.applicantId, s]));
  const correctedIds = new Set(corr.map((c) => c.applicantId));
  const pub = (await db.execute(sql`
    select distinct on (a.applicant_id) a.applicant_id, r.round_no, trim(a.program) as program, trim(a.quota) as quota, trim(a.speciality) as speciality, trim(a.hospital) as hospital, a.marks, a.preference_no, a.consent
    from merit_allocations a join merit_rounds r on r.id = a.round_id
    where r.induction_id = ${induction}
    order by a.applicant_id, r.round_no desc, a.row_no`)) as unknown as { applicant_id: string; round_no: number; program: string; quota: string; speciality: string; hospital: string; marks: number; preference_no: number; consent: string }[];
  const pubById = new Map(pub.map((p) => [p.applicant_id, p]));
  const ids = [...new Set([...imported.keys(), ...pubById.keys()])].sort((a, b) => a.length - b.length || a.localeCompare(b));
  if (!ids.length) throw new UserFacingError(`Induction ${induction} has no candidate data to export.`);
  const programs = [...new Set(sim.flatMap((s) => Object.keys(s.programMarks as object)))].sort();
  const header = ["applicant_id", "base_marks", ...programs.map((p) => `program_marks:${p}`), "profile_status", "corrected", "imported_base_marks", "last_round", "last_program", "last_quota", "last_speciality", "last_hospital", "last_marks", "last_preference_no", "last_consent"];
  const body = ids.map((id) => {
    const e = effective.get(id), im = imported.get(id), p = pubById.get(id);
    return [
      id, e?.baseMarks ?? null, ...programs.map((pg) => (e?.programMarks[pg] == null ? null : Number(e.programMarks[pg]))),
      e ? profileStatusLabel(e.profileStatus) : null, correctedIds.has(id) ? "yes" : "", correctedIds.has(id) ? (im?.baseMarks ?? null) : null,
      p?.round_no ?? null, p?.program ?? null, p?.quota ?? null, p?.speciality ?? null, p?.hospital ?? null, p ? Number(p.marks) : null, p?.preference_no ?? null, p?.consent ?? null,
    ];
  });
  await writeAudit(db, session.email, { action: "candidates.export", entityType: "induction", entityId: String(induction), after: { rows: body.length }, reason: "Candidate records exported" });
  return { filename: `induction${induction}_candidates.csv`, csv: toCsv([header, ...body]), rows: body.length };
}

/** Withdraw one correction: the imported value (or an earlier correction) applies again. */
export async function revokeCorrection(db: Database, session: Session | null, input: { id: string; reason: string }) {
  assertCan(session, "candidates.verify");
  const reason = requireReason(input.reason, "withdrawing a correction");
  const [c] = await db.select().from(candidateCorrections).where(eq(candidateCorrections.id, input.id)).limit(1);
  if (!c) throw new UserFacingError("That correction does not exist.");
  if (c.revokedAt) throw new UserFacingError("That correction was already withdrawn.");
  await db.transaction(async (tx) => {
    await tx.update(candidateCorrections).set({ revokedAt: new Date(), revokedBy: session.email }).where(eq(candidateCorrections.id, c.id));
    await writeAudit(tx, session.email, { action: "candidate.correction_revoke", entityType: "candidate_correction", entityId: c.id, before: { applicantId: c.applicantId, field: c.field, program: c.program, value: c.value }, reason });
  });
  return { applicantId: c.applicantId, induction: c.inductionId };
}
