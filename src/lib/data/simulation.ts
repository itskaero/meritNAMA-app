import "server-only";
import { createHash } from "node:crypto";
import { lstat, mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
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
  simDatasets,
  simPreferences,
  simulationPlacements,
  simulationRuns,
  specialities,
} from "@/lib/db/schema";
import { compareRounds, type Allocation, type RoundComparison } from "@/lib/domain/sim-compare";
import { sanitizeSimDataset, type SimCertificate, type SimDatasetSummary } from "@/lib/domain/sim-dataset";
import { marksContext, type EngineCandidate, type Preference, type SpecialtyGroups } from "@/lib/engine/marks";
import { buildSeatTree, candidatePool, isEligible, runPlacement, type SeatLine } from "@/lib/engine/placement";
import { allocationRulesSchema, resolveRules, type ResolvedRules } from "@/lib/engine/rules";
import { env } from "@/lib/env";
import { UserFacingError } from "@/lib/errors";
import { loadInductionRules } from "./allocation-rules";
import { requireReason, writeAudit } from "./shared";

/**
 * Simulation: restricted inputs, runs and their results.
 *
 * Inputs live on the storage volume, one folder per induction:
 *   <APP_STORAGE_DIR>/simulation/induction<n>/marks.json             candidate marks       } required (split format,
 *                                           preferences.json       portal preferences    } written by the backend)
 *                                           certificates.json      (optional)
 *                                           profile_status.json    (optional, ProfileStatus.json)
 *                                           components.json        (optional, corrected marks)
 * or, instead of marks + preferences, the legacy combined candidates.json. Names may
 * carry an induction prefix (induction22_marks.json …). Formats: src/lib/domain/sim-dataset.ts.
 * Importing keeps only what the engine needs (src/lib/domain/sim-dataset.ts); the
 * files themselves stay where they are, on the server's volume, never in the database
 * or the repository.
 *
 * A run is queued, then executed after the response (`after()` in the action), and
 * records the rules, rules version and scoring policy it used.
 */

const MAX_BYTES = 200 * 1024 * 1024;
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
  ignored: string[];
  missing: Role[];
};

async function scanFolder(dir: string) {
  const files: SimFolder["files"] = [];
  const ignored: string[] = [];
  for (const d of await readdir(dir, { withFileTypes: true })) {
    if (d.name.startsWith(".")) continue;
    const st = await lstat(path.join(/* turbopackIgnore: true */ dir, d.name));
    const role = (Object.keys(ROLES) as Role[]).find((r) => ROLES[r].test(d.name));
    if (!role || !st.isFile() || st.isSymbolicLink() || files.some((f) => f.role === role)) ignored.push(d.name);
    else files.push({ role, name: d.name, size: st.size, modifiedAt: st.mtime });
  }
  return { files, ignored, missing: (Object.keys(ROLES) as Role[]).filter((r) => !files.some((f) => f.role === r)) };
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

export async function listDatasets(db: Database, session: Session | null) {
  assertCan(session, "staff");
  const rows = await db.select().from(simDatasets).orderBy(desc(simDatasets.inductionId));
  return rows.map((r) => ({ ...r, summary: r.summary as SimDatasetSummary, sources: r.sources as { role: Role; name: string; size: number; sha256: string }[] }));
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
    if (f.size > MAX_BYTES) throw new UserFacingError(`${f.name} is larger than ${MAX_BYTES / 1024 / 1024} MB.`);
    const raw = await readFile(path.join(/* turbopackIgnore: true */ dir, f.name));
    sources.push({ role: f.role, name: f.name, size: f.size, sha256: createHash("sha256").update(raw).digest("hex") });
    try {
      data[f.role] = JSON.parse(raw.toString("utf8"));
    } catch (e) {
      throw new UserFacingError(`${f.name} is not valid JSON: ${(e as Error).message}`);
    }
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
    await writeAudit(tx, session.email, {
      action: "simulation.import_dataset",
      entityType: "sim_dataset",
      entityId: `induction ${input.induction}`,
      after: { summary, sources },
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
  /** Against the induction's published round 1, when it is imported. */
  comparison: RoundComparison | null;
  /** The rules exactly as applied (with the policy's bonus switches and caps). */
  resolved: ResolvedRules;
};

/** Queue a first-round run with the induction's current rules. Execute it with executeRun. */
export async function queueFirstRoundRun(db: Database, session: Session | null, input: { induction: number }) {
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
  const names = new Map((await db.select({ id: specialities.id, name: specialities.name }).from(specialities)).map((s) => [s.id, s.name]));
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
    (m[p.program] ??= []).push({
      preferenceNo: p.preferenceNo,
      quotaName: p.quota,
      specialityName: name,
      hospitalName: p.hospital,
      typeName: p.program,
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
  return db
    .select({ typeName: programs.name, quotaName: quotas.name, specialityName: specialities.name, hospitalName: hospitals.name, seats: inductionSeats.seats })
    .from(inductionSeats)
    .innerJoin(programs, eq(programs.id, inductionSeats.programId))
    .innerJoin(quotas, eq(quotas.id, inductionSeats.quotaId))
    .innerJoin(specialities, eq(specialities.id, inductionSeats.specialityId))
    .innerJoin(hospitals, eq(hospitals.id, inductionSeats.hospitalId))
    .where(eq(inductionSeats.inductionId, induction))
    .orderBy(asc(inductionSeats.position));
}

async function publishedRound1(db: Database, induction: number): Promise<Allocation[] | null> {
  const [round] = await db.select({ id: meritRounds.id }).from(meritRounds).where(and(eq(meritRounds.inductionId, induction), eq(meritRounds.roundNo, 1))).limit(1);
  if (!round) return null;
  const rows = await db
    .select({ applicantId: meritAllocations.applicantId, program: meritAllocations.program, quota: meritAllocations.quota, speciality: meritAllocations.speciality, hospital: meritAllocations.hospital, mark: meritAllocations.marks })
    .from(meritAllocations)
    .where(eq(meritAllocations.roundId, round.id));
  return rows;
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
    const { candidates, unnamed } = await loadEngineCandidates(db, run.inductionId);
    const lines = await seatLines(db, run.inductionId);
    const programNames = [...new Set(lines.map((l) => l.typeName))];
    const placements: (typeof simulationPlacements.$inferInsert)[] = [];
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
    const published = await publishedRound1(db, run.inductionId);
    const simulated: Allocation[] = placements.map((p) => ({ applicantId: p.applicantId, program: p.program, quota: p.quota, speciality: p.speciality, hospital: p.hospital, mark: p.mark }));
    const summary: RunSummary = {
      eligible: candidates.filter((c) => isEligible(rules, c)).length,
      candidates: candidates.length,
      placed: placements.length,
      byProgram,
      unnamedPreferences: unnamed,
      comparison: published ? compareRounds(published, simulated) : null,
      resolved: rules,
    };
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

export async function listRuns(db: Database, session: Session | null) {
  assertCan(session, "staff");
  const rows = await db
    .select({ id: simulationRuns.id, inductionId: simulationRuns.inductionId, status: simulationRuns.status, rulesOrigin: simulationRuns.rulesOrigin, policy: simulationRuns.policy, summary: simulationRuns.summary, createdBy: simulationRuns.createdBy, createdAt: simulationRuns.createdAt, finishedAt: simulationRuns.finishedAt })
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
