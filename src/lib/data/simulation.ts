import "server-only";
import { createHash } from "node:crypto";
import { lstat, mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { and, asc, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { assertCan, type Session } from "@/lib/auth/roles";
import type { Database } from "@/lib/db/client";
import {
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
import { compareRounds, type Allocation, type RoundComparison } from "@/lib/domain/sim-compare";
import { consentRoundFromName, sanitizeConsent, sanitizeSimDataset, type SimCertificate, type SimDatasetSummary } from "@/lib/domain/sim-dataset";
import { runCascade, seatKeyFromParts, type CascadeCandidate, type CascadeConsentRow, type CascadeStats } from "@/lib/engine/cascade";
import { marksContext, type EngineCandidate, type MarksContext, type Preference, type SpecialtyGroups } from "@/lib/engine/marks";
import { buildSeatTree, candidatePool, isEligible, runPlacement, type SeatLine } from "@/lib/engine/placement";
import { allocationRulesSchema, resolveRules, type ResolvedRules } from "@/lib/engine/rules";
import { env } from "@/lib/env";
import { UserFacingError } from "@/lib/errors";
import { loadInductionRules } from "./allocation-rules";
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
  if (has("marks") !== has("preferences")) return has("marks") ? "preferences.json is missing (marks.json needs it)." : "marks.json is missing (preferences.json needs it).";
  if (!has("candidates") && !has("marks")) return "Put marks.json and preferences.json (or a combined candidates.json) here.";
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
  /** next_round: how much of the published next round equals the previous one ("nobody moves"). */
  baseline?: number | null;
  /** next_round: the cascade's own counts, and the consent it started from. */
  cascade?: CascadeStats & { consent: ConsentRoundSummary | null; carriedRejected: number };
  /** The rules exactly as applied (with the policy's bonus switches and caps). */
  resolved: ResolvedRules;
};

/** Queue a first-round run with the induction's current rules. Execute it with executeRun. */
export async function queueFirstRoundRun(db: Database, session: Session | null, input: { induction: number }) {
  return queueRun(db, session, { induction: input.induction, kind: "first_round", fromRound: null });
}

/** Queue round fromRound + 1, simulated from published round fromRound and its consent replies. */
export async function queueNextRoundRun(db: Database, session: Session | null, input: { induction: number; fromRound: number }) {
  assertCan(session, "data.edit");
  if (!(await roundId(db, input.induction, input.fromRound))) throw new UserFacingError(`Round ${input.fromRound} of induction ${input.induction} is not imported. Import it under Inductions & merit lists.`);
  const [c] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(simConsent).where(and(eq(simConsent.inductionId, input.induction), eq(simConsent.roundNo, input.fromRound)));
  if (!c?.n) throw new UserFacingError(`There are no consent replies for round ${input.fromRound}. Put consent_round${input.fromRound}.json in the folder and import the consent files.`);
  return queueRun(db, session, { induction: input.induction, kind: "next_round", fromRound: input.fromRound });
}

async function queueRun(db: Database, session: Session | null, input: { induction: number; kind: "first_round" | "next_round"; fromRound: number | null }) {
  assertCan(session, "data.edit");
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
      rulesOrigin: r.origin.kind === "stored" ? `v${r.origin.version}` : "default",
      rules: r.rules,
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

async function loadEngineCandidates(db: Database, induction: number) {
  const names = await specialityNameMap(db);
  const rows = await db.select().from(simCandidates).where(eq(simCandidates.inductionId, induction));
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
    programMarks: c.programMarks as Record<string, number>,
    appliedIn: c.appliedIn as Record<string, boolean>,
    certificates: c.certificates as SimCertificate[],
    profileStatus: c.profileStatus,
    preferences: byId.get(c.applicantId) ?? {},
  }));
  return { candidates, unnamed };
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

type PublishedAllocation = Allocation & { preferenceNo: number };

/**
 * A published round's allocations. Speciality and hospital use the lookup names when
 * the import resolved them (the names seat lines use), else the published text.
 */
async function publishedRound(db: Database, induction: number, roundNo: number): Promise<PublishedAllocation[] | null> {
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
    const { placements, summary } =
      run.kind === "next_round" ? await simulateNextRound(db, run, rules, ctx) : await simulateFirstRound(db, run, rules, ctx);
    await db.transaction(async (tx) => {
      await tx.delete(simulationPlacements).where(eq(simulationPlacements.runId, runId));
      for (let i = 0; i < placements.length; i += 2000) await tx.insert(simulationPlacements).values(placements.slice(i, i + 2000));
      await tx.update(simulationRuns).set({ status: "done", summary, finishedAt: new Date() }).where(eq(simulationRuns.id, runId));
    });
  } catch (err) {
    console.error("simulation run failed", runId, err);
    await db.update(simulationRuns).set({ status: "failed", error: err instanceof UserFacingError ? err.message : "The run failed. See the server log.", finishedAt: new Date() }).where(eq(simulationRuns.id, runId));
  }
}

type Run = typeof simulationRuns.$inferSelect;
type Placement = typeof simulationPlacements.$inferInsert;
const toAllocation = (p: Placement): Allocation => ({ applicantId: p.applicantId, program: p.program, quota: p.quota, speciality: p.speciality, hospital: p.hospital, mark: p.mark });

async function simulateFirstRound(db: Database, run: Run, rules: ResolvedRules, ctx: MarksContext): Promise<{ placements: Placement[]; summary: RunSummary }> {
  const runId = run.id;
  const { candidates, unnamed } = await loadEngineCandidates(db, run.inductionId);
  const lines = await seatLines(db, run.inductionId);
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

/**
 * Round fromRound + 1: start from the published round fromRound, apply its consent
 * replies, and run the upgrade cascade over everyone's portal preferences.
 * Candidates who rejected everything in an earlier round stay out.
 */
async function simulateNextRound(db: Database, run: Run, rules: ResolvedRules, ctx: MarksContext): Promise<{ placements: Placement[]; summary: RunSummary }> {
  const from = run.fromRound!;
  const induction = run.inductionId;
  const merit = await publishedRound(db, induction, from);
  if (!merit) throw new UserFacingError(`Round ${from} is no longer imported.`);
  const lines = await seatLines(db, induction);
  const names = await specialityNameMap(db);
  const rows = await db.select().from(simCandidates).where(eq(simCandidates.inductionId, induction));
  const prefs = await db.select().from(simPreferences).where(eq(simPreferences.inductionId, induction)).orderBy(asc(simPreferences.applicantId), asc(simPreferences.preferenceNo));

  // The cascade keys candidates by integer id.
  const candidates: Record<string, CascadeCandidate & { preferences: NonNullable<CascadeCandidate["preferences"]> }> = {};
  const certificates: Record<string, SimCertificate[]> = {};
  const status = new Map<number, number | null>();
  for (const c of rows) {
    candidates[c.applicantId] = { marksTotal: c.baseMarks, programMarks: c.programMarks as Record<string, number>, preferences: [] };
    certificates[c.applicantId] = c.certificates as SimCertificate[];
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

  // Consent: resolve each reply to the seat it was given in round `from` (same programme, quota and preference).
  const replies = await db.select().from(simConsent).where(and(eq(simConsent.inductionId, induction), eq(simConsent.roundNo, from)));
  const meritBy = new Map<string, PublishedAllocation[]>();
  for (const m of merit) (meritBy.get(m.applicantId) ?? meritBy.set(m.applicantId, []).get(m.applicantId)!).push(m);
  const consent: CascadeConsentRow[] = replies.map((r) => {
    const held = meritBy.get(r.applicantId)?.find((m) => m.program === nm(r.program) && m.quota === nm(r.quota) && m.preferenceNo === r.preferenceNo);
    const seatKey = held
      ? seatKeyFromParts(held.program, held.speciality, held.hospital, held.quota)
      : r.speciality && r.hospital ? seatKeyFromParts(nm(r.program), nm(r.speciality), nm(r.hospital), nm(r.quota)) : null;
    return { applicantId: Number(r.applicantId), status: r.status, preferenceNo: r.preferenceNo, seatKey };
  });

  // Rejected everything in an earlier round: no longer in the running.
  const earlier = await db.select({ round: simConsent.roundNo, applicantId: simConsent.applicantId, status: simConsent.status })
    .from(simConsent).where(and(eq(simConsent.inductionId, induction), lt(simConsent.roundNo, from)));
  const byRound = new Map<string, string[]>();
  for (const e of earlier) {
    const k = `${e.round}:${e.applicantId}`;
    (byRound.get(k) ?? byRound.set(k, []).get(k)!).push(e.status);
  }
  const carried = new Set<number>();
  for (const [k, st] of byRound) if (st.every((x) => x === "Rejected")) carried.add(Number(k.split(":")[1]));

  const res = runCascade({
    rules,
    ctx,
    merit: merit.map((m) => ({ applicantId: Number(m.applicantId), typeName: m.program, specialityName: m.speciality, hospitalName: m.hospital, quotaName: m.quota })),
    consent,
    seats: lines,
    candidates,
    certificates,
    specialityNames: Object.fromEntries(names),
    profileStatus: (cid) => status.get(cid) ?? null,
    extraRejected: carried,
  });

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
    baseline: next ? compareRounds(next, merit).agreement : null,
    cascade: { ...res.stats, consent: (await consentRounds(db, induction)).find((c) => c.round === from) ?? null, carriedRejected: carried.size },
    resolved: rules,
  };
  return { placements, summary };
}

export async function listRuns(db: Database, session: Session | null) {
  assertCan(session, "staff");
  const rows = await db
    .select({ id: simulationRuns.id, inductionId: simulationRuns.inductionId, kind: simulationRuns.kind, fromRound: simulationRuns.fromRound, status: simulationRuns.status, rulesOrigin: simulationRuns.rulesOrigin, policy: simulationRuns.policy, summary: simulationRuns.summary, createdBy: simulationRuns.createdBy, createdAt: simulationRuns.createdAt, finishedAt: simulationRuns.finishedAt })
    .from(simulationRuns)
    .orderBy(desc(simulationRuns.createdAt))
    .limit(50);
  return rows.map((r) => ({ ...r, summary: r.summary as RunSummary | null }));
}

export async function getRun(db: Database, session: Session | null, id: string) {
  assertCan(session, "staff");
  const [r] = await db.select().from(simulationRuns).where(eq(simulationRuns.id, id)).limit(1);
  return r ? { ...r, summary: r.summary as RunSummary | null } : null;
}

/** Runs that were queued or running when the server stopped: mark them failed so they can be re-run. */
export async function failInterruptedRuns(db: Database, olderThanMinutes = 30) {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);
  const stuck = await db.select({ id: simulationRuns.id, createdAt: simulationRuns.createdAt }).from(simulationRuns).where(inArray(simulationRuns.status, ["queued", "running"]));
  const ids = stuck.filter((r) => r.createdAt < cutoff).map((r) => r.id);
  if (ids.length) await db.update(simulationRuns).set({ status: "failed", error: "Interrupted (the server restarted while it ran). Start it again.", finishedAt: new Date() }).where(inArray(simulationRuns.id, ids));
}
