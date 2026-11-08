import "server-only";
import { createHash } from "node:crypto";
import { lstat, mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { assertCan, can, type Session } from "@/lib/auth/roles";
import type { Database } from "@/lib/db/client";
import {
  candidateCorrections,
  candidateLinks,
  hospitals,
  inductionSeats,
  meritAllocations,
  meritRounds,
  programs,
  quotas,
  referenceDocuments,
  simCandidates,
  simConsent,
  simDatasets,
  simPreferences,
  simulationPlacements,
  simulationRuns,
  specialities,
} from "@/lib/db/schema";
import { effectiveCandidates, toCsv, type Correction } from "@/lib/domain/corrections";
import { compareRounds, groupKey, type Allocation, type RoundComparison } from "@/lib/domain/sim-compare";
import { consentRoundFromName, sanitizeConsent, sanitizeSimDataset, type SimCertificate, type SimDatasetSummary } from "@/lib/domain/sim-dataset";
import { consentRows, officialStatuses, type ConsentStatus, type ListAllocation, type OfficialReply } from "@/lib/domain/what-if";
import { acceptedConsent, programmeBansFromRound, runCascade, seatKeyFromParts, trackBansFromRound, type CascadeCandidate, type CascadeConsentRow, type CascadeStats } from "@/lib/engine/cascade";
import { effectiveMark, marksContext, parentBonus, programBonus, type EngineCandidate, type MarksContext, type Preference, type SpecialtyGroups } from "@/lib/engine/marks";
import { buildSeatTree, candidatePool, isEligible, runPlacement, type SeatLine } from "@/lib/engine/placement";
import { certificateParameters, compileFormula, formulaVariables } from "@/lib/engine/formula";
import { allocationRulesSchema, resolveRules, type ResolvedRules } from "@/lib/engine/rules";
import { env } from "@/lib/env";
import { UserFacingError } from "@/lib/errors";
import { loadInductionRules } from "./allocation-rules";
import { ensureUser } from "./users";
import { requireReason, writeAudit, type Db } from "./shared";

/**
 * Simulation: restricted inputs, runs and their results.
 *
 * Inputs live on the storage volume, one folder per induction:
 *   <APP_STORAGE_DIR>/simulation/induction<n>/marks.json             candidate marks       } required (split format,
 *                                           preferences.json       portal preferences    } written by the backend)
 *                                           certificates.json      (optional)
 *                                           profile_status.json    (optional, ProfileStatus.json)
 *                                           components.json        (optional, corrected marks)
 * or, instead of marks + preferences, the legacy combined candidates.json. Consent
 * replies, fetched from the portal after each round, go in the same folder as
 * consent_round<r>.json. Names may
 * carry an induction prefix (induction22_marks.json …). Formats: src/lib/domain/sim-dataset.ts.
 * Importing keeps only what the engine needs (src/lib/domain/sim-dataset.ts); the
 * files themselves stay where they are, on the server's volume, never in the database
 * or the repository.
 *
 * A run is queued, then executed after the response (`after()` in the action), and
 * records the rules, rules version and scoring policy it used.
 */

const MAX_BYTES = 200 * 1024 * 1024;

/**
 * Names are matched across files that space them differently (the seat file has
 * "Combined Military Hospital, Gujranwala " with a trailing space; published rounds
 * do not), so every name the simulation compares goes through this.
 */
const nm = (s: string) => s.trim().replace(/\s+/g, " ");
const ROLES = {
  marks: /^(?:induction\d{1,3}_)?(?:candidate_?)?marks\.json$/i,
  preferences: /^(?:induction\d{1,3}_)?preferences\.json$/i,
  candidates: /^(?:induction\d{1,3}_)?candidates\.json$/i,
  gazette: /^(?:induction\d{1,3}_)?gazette(?:_\d{1,3})?\.json$/i,
  components: /^(?:induction\d{1,3}_)?components\.json$/i,
  certificates: /^(?:induction\d{1,3}_)?certificates\.json$/i,
  profileStatus: /^(?:(?:induction\d{1,3}_)?profile_?status|ProfileStatus)\.json$/i,
} as const;
type Role = keyof typeof ROLES;

const simRoot = (root?: string) => path.resolve(/* turbopackIgnore: true */ root ?? env().APP_STORAGE_DIR, "simulation");
const folderFor = (root: string, induction: number) => path.join(/* turbopackIgnore: true */ root, `induction${induction}`);

/** Why a folder cannot be imported yet, or null when it can. */
export function importProblem(files: { role: Role }[]): string | null {
  const has = (r: Role) => files.some((f) => f.role === r);
  if (has("candidates") && (has("marks") || has("preferences"))) return "The folder has both the split files and a combined candidates.json; keep one format.";
  if (has("marks") && !has("preferences")) return "preferences.json is missing (marks.json needs it).";
  if (has("preferences") && !has("marks") && !has("gazette")) return "marks.json (or the gazette, gazette_<n>.json) is missing: preferences.json needs one.";
  if (!has("candidates") && !has("preferences")) return has("gazette")
    ? "The gazette has marks but no preferences: add preferences.json (or a combined candidates.json)."
    : "Put marks.json and preferences.json (or gazette_<n>.json and preferences.json, or a combined candidates.json) here.";
  return null;
}
const canImport = (files: { role: Role }[]) => importProblem(files) === null;

export type SimFolder = {
  induction: number;
  files: { role: Role; name: string; size: number; modifiedAt: Date }[];
  /** consent_round<r>.json files, by round. */
  consent: { round: number; name: string; size: number; modifiedAt: Date }[];
  ignored: string[];
  missing: Role[];
};

async function scanFolder(dir: string) {
  const files: SimFolder["files"] = [];
  const consent: SimFolder["consent"] = [];
  const ignored: string[] = [];
  for (const d of await readdir(dir, { withFileTypes: true })) {
    if (d.name.startsWith(".")) continue;
    const st = await lstat(path.join(/* turbopackIgnore: true */ dir, d.name));
    const regular = st.isFile() && !st.isSymbolicLink();
    const round = consentRoundFromName(d.name);
    if (round != null) {
      if (regular && !consent.some((c) => c.round === round)) consent.push({ round, name: d.name, size: st.size, modifiedAt: st.mtime });
      else ignored.push(d.name);
      continue;
    }
    const role = (Object.keys(ROLES) as Role[]).find((r) => ROLES[r].test(d.name));
    if (!role || !regular || files.some((f) => f.role === role)) ignored.push(d.name);
    else files.push({ role, name: d.name, size: st.size, modifiedAt: st.mtime });
  }
  consent.sort((a, b) => a.round - b.round);
  return { files, consent, ignored, missing: (Object.keys(ROLES) as Role[]).filter((r) => !files.some((f) => f.role === r)) };
}

/** Induction folders under <storage>/simulation/, with the files each holds. */
export async function listSimulationFolders(session: Session | null, opts: { root?: string } = {}): Promise<SimFolder[]> {
  assertCan(session, "staff");
  const root = simRoot(opts.root);
  await mkdir(root, { recursive: true });
  const out: SimFolder[] = [];
  for (const d of await readdir(root, { withFileTypes: true })) {
    const m = /^induction(\d{1,3})$/.exec(d.name);
    if (!m || !d.isDirectory()) continue;
    out.push({ induction: Number(m[1]), ...(await scanFolder(path.join(/* turbopackIgnore: true */ root, d.name))) });
  }
  return out.sort((a, b) => b.induction - a.induction);
}

export type ConsentRoundSummary = { round: number; replies: number; accepted: number; rejected: number; awaited: number };

async function consentRounds(db: Db, induction: number): Promise<ConsentRoundSummary[]> {
  const rows = await db
    .select({ round: simConsent.roundNo, status: simConsent.status, n: sql<number>`count(*)`.mapWith(Number) })
    .from(simConsent)
    .where(eq(simConsent.inductionId, induction))
    .groupBy(simConsent.roundNo, simConsent.status);
  const by = new Map<number, ConsentRoundSummary>();
  for (const r of rows) {
    const s = by.get(r.round) ?? { round: r.round, replies: 0, accepted: 0, rejected: 0, awaited: 0 };
    s.replies += r.n;
    if (r.status === "Accepted") s.accepted += r.n;
    else if (r.status === "Rejected") s.rejected += r.n;
    else if (r.status === "Awaited") s.awaited += r.n;
    by.set(r.round, s);
  }
  return [...by.values()].sort((a, b) => a.round - b.round);
}

export async function listDatasets(db: Database, session: Session | null) {
  assertCan(session, "staff");
  const rows = await db.select().from(simDatasets).orderBy(desc(simDatasets.inductionId));
  const published = await db.select({ inductionId: meritRounds.inductionId, roundNo: meritRounds.roundNo }).from(meritRounds);
  return Promise.all(
    rows.map(async (r) => ({
      ...r,
      summary: r.summary as SimDatasetSummary,
      sources: r.sources as { role: Role; name: string; size: number; sha256: string }[],
      consent: await consentRounds(db, r.inductionId),
      publishedRounds: published.filter((p) => p.inductionId === r.inductionId).map((p) => p.roundNo).sort((a, b) => a - b),
    })),
  );
}

async function readJsonFile(dir: string, name: string, size: number) {
  if (size > MAX_BYTES) throw new UserFacingError(`${name} is larger than ${MAX_BYTES / 1024 / 1024} MB.`);
  const raw = await readFile(path.join(/* turbopackIgnore: true */ dir, name));
  let data: unknown;
  try {
    data = JSON.parse(raw.toString("utf8"));
  } catch (e) {
    throw new UserFacingError(`${name} is not valid JSON: ${(e as Error).message}`);
  }
  return { data, sha256: createHash("sha256").update(raw).digest("hex") };
}

/** Replace an induction's consent replies with the folder's consent_round<r>.json files. */
async function writeConsent(tx: Db, induction: number, dir: string, files: SimFolder["consent"]) {
  const parsed = [];
  for (const f of files) {
    const { data, sha256 } = await readJsonFile(dir, f.name, f.size);
    parsed.push({ ...f, sha256, ...sanitizeConsent(data) });
  }
  await tx.delete(simConsent).where(eq(simConsent.inductionId, induction));
  for (const f of parsed) {
    for (let i = 0; i < f.rows.length; i += 2000) await tx.insert(simConsent).values(f.rows.slice(i, i + 2000).map((r) => ({ inductionId: induction, roundNo: f.round, ...r })));
  }
  return parsed.map((f) => ({ round: f.round, name: f.name, sha256: f.sha256, replies: f.rows.length, ...f.counts }));
}

/** Re-read only the consent files (after the portal publishes a round's replies). */
export async function importConsentRounds(db: Database, session: Session | null, input: { induction: number; reason: string }, opts: { root?: string } = {}) {
  assertCan(session, "data.edit");
  const reason = requireReason(input.reason, "imports");
  const [dataset] = await db.select().from(simDatasets).where(eq(simDatasets.inductionId, input.induction)).limit(1);
  if (!dataset) throw new UserFacingError(`Import induction ${input.induction}'s simulation data first.`);
  const dir = folderFor(simRoot(opts.root), input.induction);
  const scan = await scanFolder(dir).catch(() => null);
  if (!scan?.consent.length) throw new UserFacingError("There are no consent_round<r>.json files in the folder.");
  return db.transaction(async (tx) => {
    const rounds = await writeConsent(tx, input.induction, dir, scan.consent);
    await writeAudit(tx, session.email, { action: "simulation.import_consent", entityType: "sim_dataset", entityId: `induction ${input.induction}`, after: { rounds }, reason });
    return rounds;
  });
}

/**
 * Build an induction's dataset from its folder, replacing any previous one. All or
 * nothing: the files are validated first, then written in one transaction.
 */
export async function importSimulationDataset(db: Database, session: Session | null, input: { induction: number; reason: string }, opts: { root?: string } = {}) {
  assertCan(session, "data.edit");
  const reason = requireReason(input.reason, "imports");
  if (!Number.isInteger(input.induction) || input.induction <= 0) throw new UserFacingError("Choose an induction folder.");
  const dir = folderFor(simRoot(opts.root), input.induction);
  const st = await lstat(dir).catch(() => null);
  if (!st?.isDirectory()) throw new UserFacingError(`There is no simulation/induction${input.induction}/ folder on the storage volume.`);
  const scan = await scanFolder(dir);
  if (!canImport(scan.files)) throw new UserFacingError(importProblem(scan.files) ?? "The folder cannot be imported.");

  const data: Partial<Record<Role, unknown>> = {};
  const sources: { role: Role; name: string; size: number; sha256: string }[] = [];
  for (const f of scan.files) {
    const r = await readJsonFile(dir, f.name, f.size);
    sources.push({ role: f.role, name: f.name, size: f.size, sha256: r.sha256 });
    data[f.role] = r.data;
  }
  const { candidates, summary } = sanitizeSimDataset({
    marks: data.marks,
    gazette: data.gazette,
    preferences: data.preferences,
    candidates: data.candidates,
    components: data.components,
    certificates: data.certificates,
    profileStatus: data.profileStatus,
  });

  await db.transaction(async (tx) => {
    await tx.delete(simDatasets).where(eq(simDatasets.inductionId, input.induction));
    await tx.insert(simDatasets).values({ inductionId: input.induction, summary, sources, importedBy: session.email });
    for (let i = 0; i < candidates.length; i += 1000) {
      await tx.insert(simCandidates).values(
        candidates.slice(i, i + 1000).map((c) => ({
          inductionId: input.induction,
          applicantId: c.applicantId,
          baseMarks: c.baseMarks,
          params: c.params,
          programMarks: c.programMarks,
          appliedIn: c.appliedIn,
          certificates: c.certificates,
          profileStatus: c.profileStatus,
        })),
      );
    }
    const prefs = candidates.flatMap((c) => c.preferences.map((p) => ({ inductionId: input.induction, applicantId: c.applicantId, ...p })));
    for (let i = 0; i < prefs.length; i += 2000) await tx.insert(simPreferences).values(prefs.slice(i, i + 2000));
    const consent = await writeConsent(tx, input.induction, dir, scan.consent);
    await writeAudit(tx, session.email, {
      action: "simulation.import_dataset",
      entityType: "sim_dataset",
      entityId: `induction ${input.induction}`,
      after: { summary, sources, consent },
      reason,
    });
  });
  return summary;
}

// ── Runs ───────────────────────────────────────────────────────────────────────

export type RunSummary = {
  candidates: number;
  /** Candidates taking part, by profile status. */
  eligible: number;
  placed: number;
  byProgram: { program: string; pool: number; placed: number; seats: number }[];
  /** Preferences whose speciality id has no name in the lookups (skipped). */
  unnamedPreferences: number;
  /** Against the published round it simulates (round 1, or fromRound + 1), when imported. */
  comparison: RoundComparison | null;
  /** next_round: "official" consent, or "simulated" (a person's changes, or a simulated list). */
  consentSource?: "official" | "simulated";
  /** next_round: how many allocations' consent a person changed. */
  consentChanges?: number;
  /** next_round: how much of the published next round equals the previous one ("nobody moves"). */
  baseline?: number | null;
  /** next_round: the cascade's own counts, and the consent it started from. */
  cascade?: CascadeStats & { consent: ConsentRoundSummary | null; carriedRejected: number; droppedOut?: number; trackBanned?: number; programmeBanned?: number };
  /** The rules exactly as applied (with the policy's bonus switches and caps). */
  resolved: ResolvedRules;
};

/** Queue a first-round run with the induction's current rules. Execute it with executeRun. */
export async function queueFirstRoundRun(db: Database, session: Session | null, input: { induction: number }) {
  assertCan(session, "data.edit");
  return queueRun(db, session, { induction: input.induction, kind: "first_round", fromRound: null });
}

/** Queue round fromRound + 1, simulated from published round fromRound and its consent replies. */
export async function queueNextRoundRun(
  db: Database,
  session: Session | null,
  input: { induction: number; fromRound: number; awaitedConsent?: "vacate" | "keep" | "yield" },
) {
  assertCan(session, "data.edit");
  if (!(await roundId(db, input.induction, input.fromRound))) throw new UserFacingError(`Round ${input.fromRound} of induction ${input.induction} is not imported. Import it under Inductions & merit lists.`);
  const [c] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(simConsent).where(and(eq(simConsent.inductionId, input.induction), eq(simConsent.roundNo, input.fromRound)));
  if (!c?.n) throw new UserFacingError(`There are no consent replies for round ${input.fromRound}. Put consent_round${input.fromRound}.json in the folder and import the consent files.`);
  return queueRun(db, session, { induction: input.induction, kind: "next_round", fromRound: input.fromRound, awaitedConsent: input.awaitedConsent });
}

export async function queueRun(
  db: Database,
  session: Session | null,
  input: {
    induction: number;
    kind: "first_round" | "next_round";
    fromRound: number | null;
    awaitedConsent?: "vacate" | "keep" | "yield";
    /** What-if runs: private to this user, from this list, with this simulated consent. */
    ownerUserId?: string;
    baseRunId?: string | null;
    consentOverrides?: Record<string, string> | null;
  },
) {
  assertCan(session, "portal");
  // Shared runs need the data capability; a what-if run is the caller's own.
  if (!input.ownerUserId) assertCan(session, "data.edit");
  const [dataset] = await db.select().from(simDatasets).where(eq(simDatasets.inductionId, input.induction)).limit(1);
  if (!dataset) throw new UserFacingError(`Import induction ${input.induction}'s simulation data first.`);
  const [seat] = await db.select({ n: inductionSeats.seats }).from(inductionSeats).where(eq(inductionSeats.inductionId, input.induction)).limit(1);
  if (!seat) throw new UserFacingError(`Induction ${input.induction} has no seat matrix. Import its seats under Reference data first.`);
  const r = await loadInductionRules(db, input.induction);
  if (!r.resolved) throw new UserFacingError(r.problem ?? "The rules cannot be resolved.");
  const [run] = await db
    .insert(simulationRuns)
    .values({
      inductionId: input.induction,
      kind: input.kind,
      fromRound: input.fromRound,
      ownerUserId: input.ownerUserId ?? null,
      baseRunId: input.baseRunId ?? null,
      consentOverrides: input.consentOverrides ?? null,
      rulesOrigin: r.origin.kind === "stored" ? `v${r.origin.version}` : "default",
      // A run may override how Awaited replies are read (PHF has kept them in some rounds).
      rules: input.awaitedConsent ? { ...r.rules, cascade: { ...r.rules.cascade, awaitedConsent: input.awaitedConsent } } : r.rules,
      policy: r.policy ? `${r.policy.policyKey} v${r.policy.version}` : null,
      datasetImportedAt: dataset.importedAt,
      createdBy: session.email,
    })
    .returning({ id: simulationRuns.id });
  return run!.id;
}

async function specialtyGroups(db: Database, induction: number): Promise<SpecialtyGroups | null> {
  const [doc] = await db
    .select({ data: referenceDocuments.data })
    .from(referenceDocuments)
    .where(and(eq(referenceDocuments.kind, "specialty_groups"), or(eq(referenceDocuments.inductionId, induction), eq(referenceDocuments.inductionId, 0))))
    .orderBy(desc(referenceDocuments.inductionId), desc(referenceDocuments.version))
    .limit(1);
  return (doc?.data as SpecialtyGroups) ?? null;
}

/** A stored candidate row with typed JSON fields. */
const typed = (c: typeof simCandidates.$inferSelect) => ({
  ...c,
  params: (c.params ?? {}) as Record<string, number>,
  programMarks: c.programMarks as Record<string, number>,
  appliedIn: c.appliedIn as Record<string, boolean>,
  certificates: c.certificates as SimCertificate[],
});

/** The base-marks formula of a set of rules, compiled; null when base marks are as imported. */
function baseFormula(rules: Pick<ResolvedRules, "baseMarks">) {
  if (!rules.baseMarks?.formula) return null;
  try {
    return { ...compileFormula(rules.baseMarks.formula), onMissing: rules.baseMarks.onMissing };
  } catch (e) {
    throw new UserFacingError(`The base-marks formula cannot be used: ${e instanceof Error ? e.message : "invalid"}.`);
  }
}

/**
 * An induction's candidates as a run uses them: corrected parameters, the rules'
 * base-marks formula, then corrections to marks and status.
 */
async function candidateRows(db: Db, induction: number, rules: Pick<ResolvedRules, "baseMarks">, applicantId?: string) {
  const rows = (await db.select().from(simCandidates)
    .where(and(eq(simCandidates.inductionId, induction), applicantId ? eq(simCandidates.applicantId, applicantId) : undefined))).map(typed);
  return effectiveCandidates(rows, await activeCorrections(db, induction, applicantId), baseFormula(rules));
}

async function loadEngineCandidates(db: Database, induction: number, rules: ResolvedRules) {
  const names = await specialityNameMap(db);
  const rows = await candidateRows(db, induction, rules);
  const prefs = await db.select().from(simPreferences).where(eq(simPreferences.inductionId, induction)).orderBy(asc(simPreferences.applicantId), asc(simPreferences.preferenceNo));
  const byId = new Map<string, Record<string, Preference[]>>();
  let unnamed = 0;
  for (const p of prefs) {
    const name = names.get(p.specialityId);
    if (!name) {
      unnamed++;
      continue;
    }
    const m = byId.get(p.applicantId) ?? byId.set(p.applicantId, {}).get(p.applicantId)!;
    (m[nm(p.program)] ??= []).push({
      preferenceNo: p.preferenceNo,
      quotaName: nm(p.quota),
      specialityName: name,
      hospitalName: nm(p.hospital),
      typeName: nm(p.program),
      typeId: p.typeId,
      disciplineIds: p.disciplineIds,
      programMarks: p.programMarks,
      marks: p.parentMarks,
    });
  }
  const candidates: EngineCandidate[] = rows.map((c) => ({
    applicantId: c.applicantId,
    baseMarks: c.baseMarks,
    programMarks: c.programMarks,
    appliedIn: c.appliedIn,
    certificates: c.certificates,
    profileStatus: c.profileStatus,
    preferences: byId.get(c.applicantId) ?? {},
  }));
  return { candidates, unnamed };
}

/** Staff corrections in force for an induction, oldest first (later ones win). */
async function activeCorrections(db: Db, induction: number, applicantId?: string): Promise<Correction[]> {
  const rows = await db
    .select({ applicantId: candidateCorrections.applicantId, field: candidateCorrections.field, program: candidateCorrections.program, value: candidateCorrections.value })
    .from(candidateCorrections)
    .where(and(eq(candidateCorrections.inductionId, induction), isNull(candidateCorrections.revokedAt), applicantId ? eq(candidateCorrections.applicantId, applicantId) : undefined))
    .orderBy(asc(candidateCorrections.createdAt));
  return rows as Correction[];
}

async function seatLines(db: Database, induction: number): Promise<SeatLine[]> {
  const rows = await db
    .select({ typeName: programs.name, quotaName: quotas.name, specialityName: specialities.name, hospitalName: hospitals.name, seats: inductionSeats.seats })
    .from(inductionSeats)
    .innerJoin(programs, eq(programs.id, inductionSeats.programId))
    .innerJoin(quotas, eq(quotas.id, inductionSeats.quotaId))
    .innerJoin(specialities, eq(specialities.id, inductionSeats.specialityId))
    .innerJoin(hospitals, eq(hospitals.id, inductionSeats.hospitalId))
    .where(eq(inductionSeats.inductionId, induction))
    .orderBy(asc(inductionSeats.position));
  return rows.map((r) => ({ typeName: nm(r.typeName), quotaName: nm(r.quotaName), specialityName: nm(r.specialityName), hospitalName: nm(r.hospitalName), seats: r.seats }));
}

/** Speciality id → normalised lookup name. */
async function specialityNameMap(db: Database) {
  return new Map((await db.select({ id: specialities.id, name: specialities.name }).from(specialities)).map((s) => [s.id, nm(s.name)]));
}

async function roundId(db: Db, induction: number, roundNo: number) {
  const [round] = await db.select({ id: meritRounds.id }).from(meritRounds).where(and(eq(meritRounds.inductionId, induction), eq(meritRounds.roundNo, roundNo))).limit(1);
  return round?.id ?? null;
}

export type PublishedAllocation = Allocation & { preferenceNo: number };

/** A simulated run's list, in the same shape as a published round. */
export async function runList(db: Database, runId: string): Promise<PublishedAllocation[]> {
  const rows = await db.select().from(simulationPlacements).where(eq(simulationPlacements.runId, runId));
  return rows.map((p) => ({ applicantId: p.applicantId, program: p.program, quota: p.quota, speciality: p.speciality, hospital: p.hospital, mark: p.mark, preferenceNo: p.preferenceNo }));
}

export const toListAllocations = (rows: readonly PublishedAllocation[]): ListAllocation[] =>
  rows.map((m) => ({ ...m, seatKey: seatKeyFromParts(m.program, m.speciality, m.hospital, m.quota) }));

/** A round's official consent replies, for per-seat statuses. */
export async function officialReplies(db: Db, induction: number, roundNo: number): Promise<OfficialReply[]> {
  const rows = await db.select().from(simConsent).where(and(eq(simConsent.inductionId, induction), eq(simConsent.roundNo, roundNo)));
  return rows.map((r) => ({ applicantId: r.applicantId, status: r.status, program: nm(r.program), quota: nm(r.quota), preferenceNo: r.preferenceNo, speciality: r.speciality ? nm(r.speciality) : null, hospital: r.hospital ? nm(r.hospital) : null }));
}

/** Who is out going forward after a run, for runs chained on it. */
export type Carry = { out: number[]; trackBans: Record<string, string[]>; programmeBans: Record<string, string[]> };

/**
 * A published round's allocations. Speciality and hospital use the lookup names when
 * the import resolved them (the names seat lines use), else the published text.
 */
export async function publishedRound(db: Database, induction: number, roundNo: number): Promise<PublishedAllocation[] | null> {
  const id = await roundId(db, induction, roundNo);
  if (!id) return null;
  const rows = await db
    .select({
      applicantId: meritAllocations.applicantId,
      program: meritAllocations.program,
      quota: meritAllocations.quota,
      speciality: sql<string>`coalesce(${specialities.name}, ${meritAllocations.speciality})`,
      hospital: sql<string>`coalesce(${hospitals.name}, ${meritAllocations.hospital})`,
      mark: meritAllocations.marks,
      preferenceNo: meritAllocations.preferenceNo,
    })
    .from(meritAllocations)
    .leftJoin(specialities, eq(specialities.id, meritAllocations.specialityId))
    .leftJoin(hospitals, eq(hospitals.id, meritAllocations.hospitalId))
    .where(eq(meritAllocations.roundId, id));
  return rows.map((r) => ({ ...r, program: nm(r.program), quota: nm(r.quota), speciality: nm(r.speciality), hospital: nm(r.hospital) }));
}

/** Run a queued run to completion (or failure). Called after the response; never throws. */
export async function executeRun(db: Database, runId: string): Promise<void> {
  const [run] = await db.update(simulationRuns).set({ status: "running", startedAt: new Date() })
    .where(and(eq(simulationRuns.id, runId), eq(simulationRuns.status, "queued"))).returning();
  if (!run) return;
  try {
    // The rules recorded on the run (as they were when it was queued), under the covering policy.
    const { policy } = await loadInductionRules(db, run.inductionId);
    const rules: ResolvedRules = resolveRules(allocationRulesSchema.parse(run.rules), policy?.definition ?? null);
    const ctx = marksContext({ specialtyGroups: await specialtyGroups(db, run.inductionId) });
    const { placements, summary, carry } =
      run.kind === "next_round" ? await simulateNextRound(db, run, rules, ctx) : { ...(await simulateFirstRound(db, run, rules, ctx)), carry: null };
    await db.transaction(async (tx) => {
      await tx.delete(simulationPlacements).where(eq(simulationPlacements.runId, runId));
      for (let i = 0; i < placements.length; i += 2000) await tx.insert(simulationPlacements).values(placements.slice(i, i + 2000));
      await tx.update(simulationRuns).set({ status: "done", summary, carry, finishedAt: new Date() }).where(eq(simulationRuns.id, runId));
    });
  } catch (err) {
    console.error("simulation run failed", runId, err);
    await db.update(simulationRuns).set({ status: "failed", error: err instanceof UserFacingError ? err.message : "The run failed. See the server log.", finishedAt: new Date() }).where(eq(simulationRuns.id, runId));
  }
}

type Run = typeof simulationRuns.$inferSelect;
type Placement = typeof simulationPlacements.$inferInsert;
const toAllocation = (p: Placement): Allocation => ({ applicantId: p.applicantId, program: p.program, quota: p.quota, speciality: p.speciality, hospital: p.hospital, mark: p.mark });

/** Round 1 under one set of rules: every programme's placement over the seat lines. */
function placeFirstRound(rules: ResolvedRules, ctx: MarksContext, candidates: EngineCandidate[], lines: SeatLine[], runId: string) {
  const programNames = [...new Set(lines.map((l) => l.typeName))];
  const placements: Placement[] = [];
  const byProgram: RunSummary["byProgram"] = [];
  for (const program of programNames) {
    const pool = candidatePool(rules, ctx, candidates, program);
    const res = runPlacement(rules, ctx, pool, buildSeatTree(lines, program), program);
    let placed = 0;
    let seats = 0;
    for (const [quota, specs] of Object.entries(res.seatTree))
      for (const [speciality, hosps] of Object.entries(specs))
        for (const [hospital, sl] of Object.entries(hosps)) {
          seats += sl.jobs;
          for (const c of sl.candidates) {
            placed++;
            placements.push({ runId, applicantId: String(c.applicantId), program, quota, speciality, hospital, preferenceNo: c.preferenceNo, mark: c.marksTotal, track: c.track });
          }
        }
    byProgram.push({ program, pool: pool.length, placed, seats });
  }
  return { placements, byProgram };
}

async function simulateFirstRound(db: Database, run: Run, rules: ResolvedRules, ctx: MarksContext): Promise<{ placements: Placement[]; summary: RunSummary }> {
  const runId = run.id;
  const { candidates, unnamed } = await loadEngineCandidates(db, run.inductionId, rules);
  const lines = await seatLines(db, run.inductionId);
  const { placements, byProgram } = placeFirstRound(rules, ctx, candidates, lines, runId);
  const published = await publishedRound(db, run.inductionId, 1);
  const simulated: Allocation[] = placements.map(toAllocation);
  const summary: RunSummary = {
    eligible: candidates.filter((c) => isEligible(rules, c)).length,
    candidates: candidates.length,
    placed: placements.length,
    byProgram,
    unnamedPreferences: unnamed,
    comparison: published ? compareRounds(published, simulated) : null,
    resolved: rules,
  };
  return { placements, summary };
}

/** A round's consent replies, each resolved to the seat it was given (same programme, quota and preference). */
async function roundConsent(db: Database, induction: number, roundNo: number, merit: PublishedAllocation[]): Promise<CascadeConsentRow[]> {
  const replies = await db.select().from(simConsent).where(and(eq(simConsent.inductionId, induction), eq(simConsent.roundNo, roundNo)));
  const meritBy = new Map<string, PublishedAllocation[]>();
  for (const m of merit) (meritBy.get(m.applicantId) ?? meritBy.set(m.applicantId, []).get(m.applicantId)!).push(m);
  return replies.map((r) => {
    const held = meritBy.get(r.applicantId)?.find((m) => m.program === nm(r.program) && m.quota === nm(r.quota) && m.preferenceNo === r.preferenceNo);
    const seatKey = held
      ? seatKeyFromParts(held.program, held.speciality, held.hospital, held.quota)
      : r.speciality && r.hospital ? seatKeyFromParts(nm(r.program), nm(r.speciality), nm(r.hospital), nm(r.quota)) : null;
    return { applicantId: Number(r.applicantId), status: r.status, preferenceNo: r.preferenceNo, seatKey };
  });
}

/**
 * Round fromRound + 1: start from the published round fromRound, apply its consent
 * replies, and run the upgrade cascade over everyone's portal preferences.
 * Candidates who rejected everything in an earlier round stay out.
 */
async function simulateNextRound(db: Database, run: Run, rules: ResolvedRules, ctx: MarksContext): Promise<{ placements: Placement[]; summary: RunSummary; carry: Carry }> {
  let carryOut: Carry = { out: [], trackBans: {}, programmeBans: {} };
  const from = run.fromRound!;
  const induction = run.inductionId;
  // The list it starts from: a simulated run's, or the published round.
  const [baseRun] = run.baseRunId ? await db.select().from(simulationRuns).where(eq(simulationRuns.id, run.baseRunId)).limit(1) : [];
  if (run.baseRunId && !baseRun) throw new UserFacingError("The simulated list this run starts from was deleted.");
  const merit = baseRun ? await runList(db, baseRun.id) : await publishedRound(db, induction, from);
  if (!merit) throw new UserFacingError(`Round ${from} is no longer imported.`);
  const lines = await seatLines(db, induction);
  const names = await specialityNameMap(db);
  const rows = await candidateRows(db, induction, rules);
  const prefs = await db.select().from(simPreferences).where(eq(simPreferences.inductionId, induction)).orderBy(asc(simPreferences.applicantId), asc(simPreferences.preferenceNo));

  // The cascade keys candidates by integer id.
  const candidates: Record<string, CascadeCandidate & { preferences: NonNullable<CascadeCandidate["preferences"]> }> = {};
  const certificates: Record<string, SimCertificate[]> = {};
  const status = new Map<number, number | null>();
  for (const c of rows) {
    candidates[c.applicantId] = { marksTotal: c.baseMarks, programMarks: c.programMarks, preferences: [] };
    certificates[c.applicantId] = c.certificates;
    status.set(Number(c.applicantId), c.profileStatus);
  }
  let unnamed = 0;
  for (const p of prefs) {
    if (!names.has(p.specialityId)) unnamed++;
    candidates[p.applicantId]?.preferences.push({
      typeName: nm(p.program), typeId: p.typeId, specialityId: p.specialityId, hospitalName: nm(p.hospital), quotaName: nm(p.quota),
      preferenceNo: p.preferenceNo, disciplineIds: p.disciplineIds, programMarks: p.programMarks, marks: p.parentMarks,
    });
  }

  // Consent: the official replies, or per-seat statuses with a person's changes applied
  // (official where there is no change; Awaited on a simulated list).
  const overrides = (run.consentOverrides ?? null) as Record<string, ConsentStatus> | null;
  let consent: CascadeConsentRow[];
  if (!baseRun && !overrides) consent = await roundConsent(db, induction, from, merit);
  else {
    const list = toListAllocations(merit);
    const official = baseRun ? new Map<string, ConsentStatus>() : officialStatuses(list, await officialReplies(db, induction, from));
    consent = consentRows(list, (k) => overrides?.[k] ?? official.get(k) ?? "Awaited");
  }
  const asMerit = (rows: PublishedAllocation[]) =>
    rows.map((m) => ({ applicantId: Number(m.applicantId), typeName: m.program, specialityName: m.speciality, hospitalName: m.hospital, quotaName: m.quota }));

  // Bans from earlier rounds: seated in both tracks, or in two programmes, and consented to one.
  const trackBans = new Map<number, Set<string>>();
  const programmeBans = new Map<number, Set<string>>();
  const merge = (into: Map<number, Set<string>>, from: Map<number, Set<string>>) => {
    for (const [cid, t] of from) {
      const b = into.get(cid) ?? new Set<string>();
      t.forEach((x) => b.add(x));
      into.set(cid, b);
    }
  };
  const baseCarry = (baseRun?.carry ?? null) as Carry | null;
  if (baseRun) {
    for (const [cid, t] of Object.entries(baseCarry?.trackBans ?? {})) trackBans.set(Number(cid), new Set(t));
    for (const [cid, t] of Object.entries(baseCarry?.programmeBans ?? {})) programmeBans.set(Number(cid), new Set(t));
  } else if (rules.cascade.tracks === "phf" || rules.cascade.programmes === "phf") {
    for (let k = 1; k < from; k++) {
      const earlierMerit = await publishedRound(db, induction, k);
      if (!earlierMerit) continue;
      const accepted = acceptedConsent(await roundConsent(db, induction, k, earlierMerit));
      if (rules.cascade.tracks === "phf") merge(trackBans, trackBansFromRound(rules, asMerit(earlierMerit), accepted));
      if (rules.cascade.programmes === "phf") merge(programmeBans, programmeBansFromRound(asMerit(earlierMerit), accepted));
    }
  }

  // Rejected everything in an earlier round: no longer in the running.
  const earlier = baseRun ? [] : await db.select({ round: simConsent.roundNo, applicantId: simConsent.applicantId, status: simConsent.status })
    .from(simConsent).where(and(eq(simConsent.inductionId, induction), lt(simConsent.roundNo, from)));
  const byRound = new Map<string, string[]>();
  for (const e of earlier) {
    const k = `${e.round}:${e.applicantId}`;
    (byRound.get(k) ?? byRound.set(k, []).get(k)!).push(e.status);
  }
  const carried = new Set<number>();
  for (const [k, st] of byRound) if (st.every((x) => x === "Rejected")) carried.add(Number(k.split(":")[1]));
  for (const cid of baseCarry?.out ?? []) carried.add(cid);
  // Dropped off an earlier published list: no longer in the running either.
  let dropped = 0;
  if (rules.cascade.droppedStayOut && !baseRun) {
    const now = new Set(merit.map((m) => m.applicantId));
    const before = await db
      .selectDistinct({ applicantId: meritAllocations.applicantId })
      .from(meritAllocations)
      .innerJoin(meritRounds, eq(meritRounds.id, meritAllocations.roundId))
      .where(and(eq(meritRounds.inductionId, induction), lt(meritRounds.roundNo, from)));
    for (const b of before) {
      if (now.has(b.applicantId) || carried.has(Number(b.applicantId))) continue;
      carried.add(Number(b.applicantId));
      dropped++;
    }
  }

  const res = runCascade({
    rules,
    ctx,
    merit: asMerit(merit),
    consent,
    trackBans,
    programmeBans,
    seats: lines,
    candidates,
    certificates,
    specialityNames: Object.fromEntries(names),
    profileStatus: (cid) => status.get(cid) ?? null,
    extraRejected: carried,
  });

  // What chained runs carry forward: everyone out now, anyone who left this list, new bans.
  const placedIds = new Set(res.placements.map((p) => p.applicantId));
  const out = new Set<number>([...carried, ...res.consentRejected]);
  if (rules.cascade.droppedStayOut) for (const m of merit) if (!placedIds.has(Number(m.applicantId))) out.add(Number(m.applicantId));
  const accepted = acceptedConsent(consent);
  merge(trackBans, trackBansFromRound(rules, asMerit(merit), accepted));
  merge(programmeBans, programmeBansFromRound(asMerit(merit), accepted));
  const toRecord = (m: Map<number, Set<string>>) => Object.fromEntries([...m].map(([k, v]) => [String(k), [...v]]));
  carryOut = { out: [...out].sort((a, b) => a - b), trackBans: toRecord(trackBans), programmeBans: toRecord(programmeBans) };

  const placements: Placement[] = res.placements.map((p) => ({
    runId: run.id, applicantId: String(p.applicantId), program: p.typeName, quota: p.quotaName, speciality: p.specialityName,
    hospital: p.hospitalName, preferenceNo: p.preferenceNo, mark: p.effectiveMark, track: "",
  }));
  const seatsBy = new Map<string, number>();
  for (const l of lines) seatsBy.set(l.typeName, (seatsBy.get(l.typeName) ?? 0) + l.seats);
  const byProgram = [...seatsBy].map(([program, seats]) => ({
    program,
    pool: rows.filter((c) => (candidates[c.applicantId]?.preferences ?? []).some((p) => p.typeName === program)).length,
    placed: placements.filter((p) => p.program === program).length,
    seats,
  }));
  const next = await publishedRound(db, induction, from + 1);
  const summary: RunSummary = {
    candidates: rows.length,
    eligible: rows.filter((c) => rules.cascade.eligibleProfileStatus.includes(c.profileStatus ?? NaN)).length,
    placed: placements.length,
    byProgram,
    unnamedPreferences: unnamed,
    comparison: next ? compareRounds(next, placements.map(toAllocation)) : null,
    baseline: next && !baseRun ? compareRounds(next, merit).agreement : null,
    consentSource: overrides || baseRun ? "simulated" : "official",
    consentChanges: overrides ? Object.keys(overrides).length : 0,
    cascade: { ...res.stats, consent: (await consentRounds(db, induction)).find((c) => c.round === from) ?? null, carriedRejected: carried.size - dropped, droppedOut: dropped, trackBanned: trackBans.size, programmeBanned: programmeBans.size },
    resolved: rules,
  };
  return { placements, summary, carry: carryOut };
}

/** Shared runs, plus the caller's own what-if runs; other people's what-if runs stay private. */
export async function listRuns(db: Database, session: Session | null) {
  assertCan(session, "staff");
  const me = await ensureUser(db, session);
  const rows = await db
    .select({ id: simulationRuns.id, inductionId: simulationRuns.inductionId, kind: simulationRuns.kind, fromRound: simulationRuns.fromRound, status: simulationRuns.status, rulesOrigin: simulationRuns.rulesOrigin, policy: simulationRuns.policy, summary: simulationRuns.summary, createdBy: simulationRuns.createdBy, createdAt: simulationRuns.createdAt, finishedAt: simulationRuns.finishedAt, ownerUserId: simulationRuns.ownerUserId, baseRunId: simulationRuns.baseRunId })
    .from(simulationRuns)
    .where(or(isNull(simulationRuns.ownerUserId), eq(simulationRuns.ownerUserId, me.id)))
    .orderBy(desc(simulationRuns.createdAt))
    .limit(50);
  return rows.map((r) => ({ ...r, summary: r.summary as RunSummary | null }));
}

/** A run the caller may see: a shared run (staff), or their own what-if run (anyone signed in). */
export async function getRun(db: Database, session: Session | null, id: string) {
  assertCan(session, "portal");
  const [r] = await db.select().from(simulationRuns).where(eq(simulationRuns.id, id)).limit(1);
  if (!r) return null;
  // Published estimates are for everyone; otherwise a run is its owner's (what-if) or staff's.
  if (!r.publishedAt && (r.ownerUserId ? r.ownerUserId !== (await ensureUser(db, session)).id : !can(session, "staff"))) return null;
  return { ...r, summary: r.summary as RunSummary | null };
}

export const runRoundNo = (r: { kind: string; fromRound: number | null }) => (r.kind === "next_round" ? r.fromRound! + 1 : 1);

/**
 * Publish a finished staff simulation as an estimated merit list (or take it down).
 * Members then see the whole list, labelled Estimate, and can play what-if on it.
 */
export async function publishEstimate(db: Database, session: Session | null, input: { id: string; publish: boolean; reason: string }) {
  assertCan(session, "data.edit");
  const reason = requireReason(input.reason, "publishing an estimate");
  const [run] = await db.select().from(simulationRuns).where(eq(simulationRuns.id, input.id)).limit(1);
  if (!run || run.ownerUserId) throw new UserFacingError("That run does not exist.");
  if (run.status !== "done") throw new UserFacingError("Only a finished run can be published.");
  await db.update(simulationRuns)
    .set(input.publish ? { publishedAt: new Date(), publishedBy: session.email } : { publishedAt: null, publishedBy: null })
    .where(eq(simulationRuns.id, run.id));
  await writeAudit(db, session.email, {
    action: input.publish ? "simulation.publish_estimate" : "simulation.unpublish_estimate",
    entityType: "simulation_run",
    entityId: run.id,
    after: { induction: run.inductionId, round: runRoundNo(run) },
    reason,
  });
}

/**
 * Published estimates, newest first. `official` is true once PHF's own list for that
 * round is imported (the estimate is then kept for comparison, no longer current).
 */
export async function publishedEstimates(db: Database, session: Session | null, opts: { induction?: number } = {}) {
  assertCan(session, "portal");
  const rows = await db
    .select({ id: simulationRuns.id, inductionId: simulationRuns.inductionId, kind: simulationRuns.kind, fromRound: simulationRuns.fromRound, publishedAt: simulationRuns.publishedAt, summary: simulationRuns.summary })
    .from(simulationRuns)
    .where(and(isNotNull(simulationRuns.publishedAt), opts.induction ? eq(simulationRuns.inductionId, opts.induction) : undefined))
    .orderBy(desc(simulationRuns.publishedAt));
  const official = await db.select({ inductionId: meritRounds.inductionId, roundNo: meritRounds.roundNo }).from(meritRounds);
  return rows.map((r) => {
    const roundNo = runRoundNo(r);
    const placed = (r.summary as RunSummary | null)?.placed ?? null;
    return { id: r.id, induction: r.inductionId, roundNo, publishedAt: r.publishedAt!, placed, official: official.some((o) => o.inductionId === r.inductionId && o.roundNo === roundNo) };
  });
}

/**
 * A simulated list in full (applicant id, mark, seat, preference), for a published
 * estimate or a run the person may see (their own what-if, or any run for staff).
 */
export async function estimateList(db: Database, session: Session | null, runId: string) {
  const run = await getRun(db, session, runId);
  if (!run || run.status !== "done") return null;
  const rows = await runList(db, run.id);
  rows.sort((a, b) => a.program.localeCompare(b.program) || a.quota.localeCompare(b.quota) || a.speciality.localeCompare(b.speciality) || a.hospital.localeCompare(b.hospital) || b.mark - a.mark);
  return { run, roundNo: runRoundNo(run), published: Boolean(run.publishedAt), rows };
}

/**
 * Internal (the worker's tick): run queued runs that nobody started, oldest first.
 * A run is normally started right after the request that queued it; if the server
 * restarted in between, it waits here. executeRun's queued → running update means a
 * run is never executed twice.
 */
export async function processQueuedRuns(db: Database, opts: { olderThanSeconds?: number; limit?: number } = {}) {
  const cutoff = new Date(Date.now() - (opts.olderThanSeconds ?? 60) * 1000);
  const waiting = await db.select({ id: simulationRuns.id }).from(simulationRuns)
    .where(and(eq(simulationRuns.status, "queued"), lt(simulationRuns.createdAt, cutoff)))
    .orderBy(simulationRuns.createdAt).limit(opts.limit ?? 3);
  for (const r of waiting) await executeRun(db, r.id);
  return waiting.length;
}

/** Runs that were queued or running when the server stopped: mark them failed so they can be re-run. */
export async function failInterruptedRuns(db: Database, olderThanMinutes = 30) {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);
  const stuck = await db.select({ id: simulationRuns.id, createdAt: simulationRuns.createdAt }).from(simulationRuns).where(inArray(simulationRuns.status, ["queued", "running"]));
  const ids = stuck.filter((r) => r.createdAt < cutoff).map((r) => r.id);
  if (ids.length) await db.update(simulationRuns).set({ status: "failed", error: "Interrupted (the server restarted while it ran). Start it again.", finishedAt: new Date() }).where(inArray(simulationRuns.id, ids));
}

// ── One candidate's simulation inputs (admin candidate records) ──────────────

export type CandidateSimRecord = {
  induction: number;
  imported: { baseMarks: number; programMarks: Record<string, number>; profileStatus: number | null; params: Record<string, number> };
  effective: { baseMarks: number; programMarks: Record<string, number>; profileStatus: number | null; params: Record<string, number> };
  /** The induction's base-marks formula, when its rules set one. */
  formula: string | null;
  appliedIn: Record<string, boolean>;
  certificates: number;
  /** Per programme: the mark without a preference (base + programme marks under the rules), or null when not applied. */
  programmes: { program: string; mark: number | null; preferences: { preferenceNo: number; quota: string; speciality: string; hospital: string; mark: number | null; bonus: number; bonusSource: string; parent: number }[] }[];
  consent: { round: number; status: string; program: string; quota: string; preferenceNo: number; speciality: string | null; hospital: string | null }[];
  rulesProblem: string | null;
};

/**
 * One applicant's simulation inputs in an induction, with corrections applied and the
 * marks the engine would use for each preference under the induction's rules.
 */
export async function candidateSimRecord(db: Database, session: Session | null, input: { induction: number; applicantId: string }): Promise<CandidateSimRecord | null> {
  assertCan(session, "candidates.verify");
  const [row] = await db.select().from(simCandidates).where(and(eq(simCandidates.inductionId, input.induction), eq(simCandidates.applicantId, input.applicantId))).limit(1);
  if (!row) return null;
  const imported = typed(row);
  const { resolved, problem, rules } = await loadInductionRules(db, input.induction);
  const [effective] = await candidateRows(db, input.induction, resolved ?? rules, input.applicantId);
  const names = await specialityNameMap(db);
  const prefs = await db.select().from(simPreferences)
    .where(and(eq(simPreferences.inductionId, input.induction), eq(simPreferences.applicantId, input.applicantId)))
    .orderBy(asc(simPreferences.program), asc(simPreferences.preferenceNo));
  const byProgram: Record<string, Preference[]> = {};
  for (const p of prefs) {
    (byProgram[nm(p.program)] ??= []).push({
      preferenceNo: p.preferenceNo, quotaName: nm(p.quota), specialityName: names.get(p.specialityId) ?? `Speciality ${p.specialityId}`, hospitalName: nm(p.hospital),
      typeName: nm(p.program), typeId: p.typeId, disciplineIds: p.disciplineIds, programMarks: p.programMarks, marks: p.parentMarks,
    });
  }
  const engine: EngineCandidate = {
    applicantId: row.applicantId, baseMarks: effective!.baseMarks, programMarks: effective!.programMarks,
    appliedIn: row.appliedIn as Record<string, boolean>, certificates: row.certificates as SimCertificate[], profileStatus: effective!.profileStatus, preferences: byProgram,
  };
  const ctx = marksContext({ specialtyGroups: await specialtyGroups(db, input.induction) });
  const programs = [...new Set([...Object.keys(engine.appliedIn ?? {}), ...Object.keys(byProgram)])].sort();
  const consent = await db.select().from(simConsent)
    .where(and(eq(simConsent.inductionId, input.induction), eq(simConsent.applicantId, input.applicantId)))
    .orderBy(asc(simConsent.roundNo), asc(simConsent.preferenceNo));
  return {
    induction: input.induction,
    imported: { baseMarks: imported.baseMarks, programMarks: imported.programMarks, profileStatus: imported.profileStatus, params: imported.params },
    effective: { baseMarks: effective!.baseMarks, programMarks: effective!.programMarks, profileStatus: effective!.profileStatus, params: effective!.params },
    formula: rules.baseMarks.formula,
    appliedIn: engine.appliedIn as Record<string, boolean>,
    certificates: (engine.certificates ?? []).length,
    programmes: programs.map((program) => ({
      program,
      mark: resolved ? effectiveMark(resolved, ctx, engine, program) : null,
      preferences: (byProgram[program] ?? []).map((p) => {
        const bonus = resolved ? programBonus(resolved, ctx, engine, p, program) : { bonus: 0, source: "off" };
        return {
          preferenceNo: p.preferenceNo, quota: p.quotaName, speciality: p.specialityName, hospital: p.hospitalName,
          mark: resolved ? effectiveMark(resolved, ctx, engine, program, p) : null,
          bonus: bonus.bonus, bonusSource: bonus.source, parent: resolved ? parentBonus(resolved, p) : 0,
        };
      }),
    })),
    consent: consent.map((c) => ({ round: c.roundNo, status: c.status, program: c.program, quota: c.quota, preferenceNo: c.preferenceNo, speciality: c.speciality, hospital: c.hospital })),
    rulesProblem: problem ?? null,
  };
}

// ── Impact preview: round 1 under the current rules vs a draft ──────────────────

export type RulesImpact =
  | { induction: number; status: "no_data"; reason: string }
  | { induction: number; status: "same"; reason: string }
  | {
      induction: number; status: "computed";
      candidates: number; eligible: { from: number; to: number }; placed: { from: number; to: number };
      /** Applicants by what happens to their seat(s). */
      sameSeat: number; moved: number; gained: number; lost: number;
      groupsChanged: number; groupsTotal: number;
      topChanges: { group: string; from: number | null; to: number | null }[];
      ms: number;
    };

/**
 * What a change of rules or scoring policy would do to an induction's round 1: the
 * simulation runs twice over the same imported data, under the rules in force and
 * under `next`, and the two lists are compared. Aggregates only, no applicant ids.
 */
export async function firstRoundImpact(db: Database, session: Session | null, input: { induction: number; next: ResolvedRules }): Promise<RulesImpact> {
  assertCan(session, "staff");
  const { induction, next } = input;
  const [ds] = await db.select({ id: simDatasets.inductionId }).from(simDatasets).where(eq(simDatasets.inductionId, induction)).limit(1);
  if (!ds) return { induction, status: "no_data", reason: `Induction ${induction} has no simulation data, so the effect on placement cannot be shown.` };
  const lines = await seatLines(db, induction);
  if (!lines.length) return { induction, status: "no_data", reason: `Induction ${induction} has no seat matrix, so the effect on placement cannot be shown.` };
  const current = await loadInductionRules(db, induction);
  if (!current.resolved) return { induction, status: "no_data", reason: `The rules in force cannot be applied (${current.problem}), so there is nothing to compare with.` };
  if (JSON.stringify(current.resolved) === JSON.stringify(next)) return { induction, status: "same", reason: "The simulation would run exactly as now: the settings that change do not alter how marks or placement are worked out." };

  const started = Date.now();
  const ctx = marksContext({ specialtyGroups: await specialtyGroups(db, induction) });
  // Loaded per side: a base-marks formula changes the candidates themselves.
  const { candidates } = await loadEngineCandidates(db, induction, current.resolved);
  const nextCandidates = JSON.stringify(current.resolved.baseMarks) === JSON.stringify(next.baseMarks) ? candidates : (await loadEngineCandidates(db, induction, next)).candidates;
  const before = placeFirstRound(current.resolved, ctx, candidates, lines, "impact").placements;
  const after = placeFirstRound(next, ctx, nextCandidates, lines, "impact").placements;

  const seatsOf = (rows: Placement[]) => {
    const m = new Map<string, string>();
    for (const p of rows) m.set(p.applicantId, [m.get(p.applicantId), groupKey(p)].filter(Boolean).sort().join(" | "));
    return m;
  };
  const a = seatsOf(before), b = seatsOf(after);
  let sameSeat = 0, moved = 0, gained = 0, lost = 0;
  for (const id of new Set([...a.keys(), ...b.keys()])) {
    const x = a.get(id), y = b.get(id);
    if (x && y) x === y ? sameSeat++ : moved++;
    else if (y) gained++;
    else lost++;
  }
  const closing = (rows: Placement[]) => {
    const m = new Map<string, number>();
    for (const p of rows) m.set(groupKey(p), Math.min(m.get(groupKey(p)) ?? Infinity, p.mark));
    return m;
  };
  const ca = closing(before), cb = closing(after);
  const changes: { group: string; from: number | null; to: number | null }[] = [];
  for (const g of new Set([...ca.keys(), ...cb.keys()])) {
    const x = ca.get(g) ?? null, y = cb.get(g) ?? null;
    if (x == null || y == null || Math.abs(x - y) > 1e-9) changes.push({ group: g, from: x, to: y });
  }
  changes.sort((p, q) => Math.abs((q.to ?? 0) - (q.from ?? 0)) - Math.abs((p.to ?? 0) - (p.from ?? 0)));
  return {
    induction, status: "computed",
    candidates: candidates.length,
    eligible: { from: candidates.filter((c) => isEligible(current.resolved!, c)).length, to: nextCandidates.filter((c) => isEligible(next, c)).length },
    placed: { from: before.length, to: after.length },
    sameSeat, moved, gained, lost,
    groupsChanged: changes.length, groupsTotal: new Set([...ca.keys(), ...cb.keys()]).size,
    topChanges: changes.slice(0, 25),
    ms: Date.now() - started,
  };
}

// ── Run outputs (downloads) ────────────────────────────────────────────────────

/**
 * A finished shared run as a file: the simulated list, plus (JSON) what it was run
 * with, so each download is a self-describing version of the output. What-if runs
 * stay private to their owner and are not exported here.
 */
export async function runOutput(db: Database, session: Session | null, input: { id: string; format: "csv" | "json" }): Promise<{ filename: string; body: string; type: string }> {
  assertCan(session, "data.edit");
  const [run] = await db.select().from(simulationRuns).where(eq(simulationRuns.id, input.id)).limit(1);
  if (!run || run.ownerUserId) throw new UserFacingError("That run does not exist.");
  if (run.status !== "done") throw new UserFacingError("The run has not finished.");
  const rows = await db.select().from(simulationPlacements).where(eq(simulationPlacements.runId, run.id))
    .orderBy(asc(simulationPlacements.program), asc(simulationPlacements.quota), asc(simulationPlacements.speciality), asc(simulationPlacements.hospital), desc(simulationPlacements.mark));
  const roundNo = run.kind === "next_round" ? run.fromRound! + 1 : 1;
  const stamp = (run.finishedAt ?? run.createdAt).toISOString().replace(/[-:]/g, "").slice(0, 15);
  const base = `induction${run.inductionId}_round${roundNo}_simulated_${stamp}Z_${run.id.slice(0, 8)}`;
  const placements = rows.map((p) => ({ program: p.program, quota: p.quota, speciality: p.speciality, hospital: p.hospital, preferenceNo: p.preferenceNo, applicantId: p.applicantId, mark: p.mark, track: p.track }));
  await writeAudit(db, session.email, { action: "simulation.export", entityType: "simulation_run", entityId: run.id, after: { format: input.format, rows: rows.length }, reason: "Run output downloaded" });
  if (input.format === "csv") {
    const header = ["program", "quota", "speciality", "hospital", "preference_no", "applicant_id", "mark", "track"];
    return { filename: `${base}.csv`, type: "text/csv", body: toCsv([header, ...placements.map((p) => [p.program, p.quota, p.speciality, p.hospital, p.preferenceNo, p.applicantId, p.mark, p.track])]) };
  }
  const summary = run.summary as RunSummary | null;
  const doc = {
    simulated: true,
    run: { id: run.id, induction: run.inductionId, round: roundNo, kind: run.kind, fromRound: run.fromRound, baseRunId: run.baseRunId, createdBy: run.createdBy, createdAt: run.createdAt, finishedAt: run.finishedAt },
    inputs: { datasetImportedAt: run.datasetImportedAt, rulesOrigin: run.rulesOrigin, policy: run.policy, rules: run.rules, consentChanges: summary?.consentChanges ?? 0 },
    summary: summary ? { candidates: summary.candidates, eligible: summary.eligible, placed: summary.placed, byProgram: summary.byProgram, agreementWithPublished: summary.comparison?.agreement ?? null } : null,
    placements,
  };
  return { filename: `${base}.json`, type: "application/json", body: JSON.stringify(doc, null, 2) + "\n" };
}

// ── Base-marks formula workbench (allocation rules page) ──────────────────────

export type FormulaParameter = { name: string; source: "data" | "certificates" | "imported total"; candidates: number; min: number; max: number; mean: number };
export type FormulaTrial =
  | { ok: false; error: string }
  | {
      ok: true; formula: string; onMissing: "imported" | "zero";
      candidates: number; computed: number; missing: number;
      /** Candidates whose base marks would differ from the imported ones by more than 0.005. */
      differ: number; maxUp: number; maxDown: number;
      buckets: { label: string; count: number }[];
    };

/**
 * What a base-marks formula can use for an induction, and (with `formula`) how it would
 * compare with the imported base marks, over every candidate. Aggregates only.
 * Parameter corrections are applied, as in a run.
 */
export async function baseMarksWorkbench(db: Database, session: Session | null, input: { induction: number; formula?: string | null; onMissing?: "imported" | "zero" }) {
  assertCan(session, "policy.edit");
  const rows = await candidateRows(db, input.induction, { baseMarks: { formula: null, onMissing: "imported" } });
  if (!rows.length) return null;
  const stats = new Map<string, { source: FormulaParameter["source"]; xs: number[] }>();
  for (const r of rows) {
    const add = (name: string, v: number, source: FormulaParameter["source"]) => {
      const s = stats.get(name) ?? stats.set(name, { source, xs: [] }).get(name)!;
      s.xs.push(v);
    };
    for (const [k, v] of Object.entries(r.params)) add(k, v, "data");
    add("marksTotal", r.baseMarks, "imported total");
    for (const [k, v] of Object.entries(certificateParameters(r.certificates))) add(k, v, "certificates");
  }
  const parameters: FormulaParameter[] = [...stats].map(([name, s]) => ({
    name, source: s.source, candidates: s.xs.length,
    min: Math.min(...s.xs), max: Math.max(...s.xs), mean: s.xs.reduce((a, b) => a + b, 0) / s.xs.length,
  })).sort((a, b) => (a.source === b.source ? a.name.localeCompare(b.name) : a.source === "data" ? -1 : b.source === "data" ? 1 : a.source.localeCompare(b.source)));

  // A starting point: the data parameters that are ever non-zero, added up.
  const summed = parameters.filter((p) => p.source === "data" && (p.max !== 0 || p.min !== 0)).map((p) => p.name);
  const suggestion = summed.length ? summed.join(" + ") : null;

  let trial: FormulaTrial | null = null;
  const src = input.formula?.trim();
  if (src) {
    try {
      const f = compileFormula(src, parameters.map((p) => p.name));
      const onMissing = input.onMissing ?? "imported";
      let computed = 0, missing = 0, differ = 0, maxUp = 0, maxDown = 0;
      const edges = [0.005, 0.5, 1, 2, 5];
      const counts = new Array(edges.length + 1).fill(0) as number[];
      for (const r of rows) {
        const v = f.evaluate(formulaVariables(r));
        if (v == null) missing++;
        else computed++;
        const base = v ?? (onMissing === "zero" ? 0 : r.baseMarks);
        const d = base - r.baseMarks;
        if (Math.abs(d) > 0.005) differ++;
        maxUp = Math.max(maxUp, d);
        maxDown = Math.min(maxDown, d);
        const i = edges.findIndex((e) => Math.abs(d) <= e);
        counts[i < 0 ? edges.length : i]!++;
      }
      const labels = ["same (±0.005)", "up to 0.5", "0.5 – 1", "1 – 2", "2 – 5", "more than 5"];
      trial = { ok: true, formula: f.source, onMissing, candidates: rows.length, computed, missing, differ, maxUp, maxDown, buckets: labels.map((label, i) => ({ label, count: counts[i]! })) };
    } catch (e) {
      trial = { ok: false, error: e instanceof Error ? e.message : "Not a valid formula" };
    }
  }
  return { candidates: rows.length, parameters, suggestion, trial };
}

// ── A candidate's own inputs (merit profile) ─────────────────────────────────

/**
 * What the app holds about the signed-in candidate's own record in the newest
 * induction with simulation data: marks (as runs use them), components, profile status,
 * preferences, certificates and consent replies. Only their own verified record.
 */
export async function myDataChecklist(db: Database, session: Session | null) {
  assertCan(session, "portal");
  const me = await ensureUser(db, session);
  const [link] = await db.select({ applicantId: candidateLinks.applicantId }).from(candidateLinks)
    .where(and(eq(candidateLinks.userId, me.id), eq(candidateLinks.status, "verified"))).limit(1);
  if (!link) return null;
  const applicantId = link.applicantId;
  const [ds] = await db.select({ induction: simDatasets.inductionId, at: simDatasets.importedAt }).from(simDatasets).orderBy(desc(simDatasets.inductionId)).limit(1);
  if (!ds) return { applicantId, induction: null, inData: false as const };
  const { resolved, rules } = await loadInductionRules(db, ds.induction);
  const [row] = await candidateRows(db, ds.induction, resolved ?? rules, applicantId);
  if (!row) return { applicantId, induction: ds.induction, inData: false as const, importedAt: ds.at };
  const prefs = await db.select({ program: simPreferences.program, n: sql<number>`count(*)`.mapWith(Number) }).from(simPreferences)
    .where(and(eq(simPreferences.inductionId, ds.induction), eq(simPreferences.applicantId, applicantId))).groupBy(simPreferences.program);
  const consent = await db.select({ round: simConsent.roundNo, status: simConsent.status }).from(simConsent)
    .where(and(eq(simConsent.inductionId, ds.induction), eq(simConsent.applicantId, applicantId))).orderBy(asc(simConsent.roundNo));
  const rounds = await consentRounds(db, ds.induction);
  const [corrected] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(candidateCorrections)
    .where(and(eq(candidateCorrections.inductionId, ds.induction), eq(candidateCorrections.applicantId, applicantId), isNull(candidateCorrections.revokedAt)));
  return {
    applicantId,
    induction: ds.induction,
    inData: true as const,
    importedAt: ds.at,
    baseMarks: row.baseMarks,
    components: row.params,
    programMarks: row.programMarks,
    profileStatus: row.profileStatus,
    certificates: row.certificates.length,
    preferences: prefs.map((p) => ({ program: p.program.trim(), count: p.n })),
    consent: rounds.map((r) => ({ round: r.round, replies: consent.filter((c) => c.round === r.round).map((c) => c.status) })),
    corrected: (corrected?.n ?? 0) > 0,
  };
}
