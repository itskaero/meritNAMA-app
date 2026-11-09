import "server-only";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, lstat, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import { assertCan, type Session } from "@/lib/auth/roles";
import type { Database } from "@/lib/db/client";
import { appSettings, dataFiles, inductionSeats, meritRounds, scoringPolicies, stagedChanges } from "@/lib/db/schema";
import {
  classifyByContents, classifyByPath, cleanRelPath, describeClassified, DATA_KIND_LABELS, missingDetail, simulationTarget,
  type Classified, type SimRole,
} from "@/lib/domain/data-files";
import { meritRoundFileSchema } from "@/lib/domain/merit-round";
import { DOCUMENT_KINDS, seatFileSchema } from "@/lib/domain/reference-data";
import { scoringPolicyFileSchema } from "@/lib/domain/scoring-policy";
import { env } from "@/lib/env";
import { UserFacingError } from "@/lib/errors";
import { proposeMeritRound, proposePolicyFile, proposeSeatFile, type Proposal } from "./changes";
import { saveReferenceDocument } from "./reference-data";
import { importProblem } from "./simulation";
import { writeAudit } from "./shared";

/**
 * The data folder: <APP_STORAGE_DIR>/data/, laid out like the old public repository.
 * Files stay where they are put. The app rescans the folder (every minute from the
 * worker, or on demand) and acts by hash:
 *   new file                → validated, and live at once (when auto-publish is on)
 *   changed / replacing file → waits for one click; applying stages a before/after
 *                              change for review, as every replacement does
 *   file with a mistake      → a plain message, nothing applied
 *   file removed from disk   → data kept, noted as "no longer in the folder"
 * Estimate inputs and consent files are copied to storage/simulation/induction<n>/,
 * where the existing estimate importer reads them.
 */

export const DATA_FILE_MAX_BYTES = 200 * 1024 * 1024;
/** Kinds that are parsed and validated at scan time must be small. */
const PARSED_MAX_BYTES = 25 * 1024 * 1024;
const SNIFF_MAX_BYTES = 5 * 1024 * 1024;
const MAX_FILES = 2000;
const MAX_DEPTH = 6;

/** The identity the worker applies new files under. It exists only inside this process. */
export const SYSTEM_SESSION: Session = { userId: "00000000-0000-0000-0000-000000000000", email: "worker@meritnama.system", role: "owner", isStub: false };

export type DataStatus = "new" | "replaces" | "live" | "held" | "problem" | "ignored" | "missing";

export const dataRoot = (root?: string) => path.resolve(/* turbopackIgnore: true */ root ?? env().APP_STORAGE_DIR, "data");
const simulationRoot = (root?: string) => path.resolve(/* turbopackIgnore: true */ root ?? env().APP_STORAGE_DIR, "simulation");

// ── Settings ───────────────────────────────────────────────────────────────────

export type DataSettings = { autoPublish: boolean; repo: string; branch: string; lastSyncAt: string | null; lastSyncMessage: string | null };
const DEFAULT_SETTINGS: DataSettings = { autoPublish: true, repo: "", branch: "main", lastSyncAt: null, lastSyncMessage: null };
const SETTINGS_KEY = "data_folder";

export async function loadDataSettings(db: Database): Promise<DataSettings> {
  const [r] = await db.select().from(appSettings).where(eq(appSettings.key, SETTINGS_KEY)).limit(1);
  return { ...DEFAULT_SETTINGS, ...((r?.value as Partial<DataSettings> | undefined) ?? {}) };
}

async function storeDataSettings(db: Database, actor: string, next: DataSettings, audit?: { reason: string; before: DataSettings }) {
  await db.insert(appSettings).values({ key: SETTINGS_KEY, value: next, updatedBy: actor, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: next, updatedBy: actor, updatedAt: new Date() } });
  if (audit) await writeAudit(db, actor, { action: "settings.data_folder", entityType: "settings", entityId: SETTINGS_KEY, before: audit.before, after: next, reason: audit.reason });
}

/** Staff may read the settings; the sync token is never part of them. */
export async function dataSettings(db: Database, session: Session | null): Promise<DataSettings & { tokenSet: boolean }> {
  assertCan(session, "staff");
  return { ...(await loadDataSettings(db)), tokenSet: Boolean(env().GITHUB_TOKEN) };
}

export async function saveDataSettings(db: Database, session: Session | null, input: { autoPublish: boolean; repo: string; branch: string; reason: string }) {
  assertCan(session, "data.edit");
  const repo = input.repo.trim();
  const branch = input.branch.trim() || "main";
  if (repo && !/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/.test(repo)) throw new UserFacingError("The repository must look like owner/name.");
  if (!/^[A-Za-z0-9_./-]{1,100}$/.test(branch) || branch.includes("..")) throw new UserFacingError("That is not a branch name.");
  if (!input.reason.trim()) throw new UserFacingError("Enter a reason.");
  const before = await loadDataSettings(db);
  await storeDataSettings(db, session.email, { ...before, autoPublish: input.autoPublish, repo, branch }, { reason: input.reason.trim(), before });
}

/** For the sync: record when it ran and what it did. */
export async function recordSync(db: Database, message: string) {
  const before = await loadDataSettings(db);
  await storeDataSettings(db, SYSTEM_SESSION.email, { ...before, lastSyncAt: new Date().toISOString(), lastSyncMessage: message });
}

// ── Reading the folder ─────────────────────────────────────────────────────────

type Found = { rel: string; abs: string; size: number };

async function walk(dir: string, rel: string, depth: number, out: Found[]): Promise<void> {
  if (depth > MAX_DEPTH || out.length >= MAX_FILES) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const d of entries) {
    if (d.name.startsWith(".") || out.length >= MAX_FILES) continue;
    const abs = path.join(/* turbopackIgnore: true */ dir, d.name);
    const childRel = rel ? `${rel}/${d.name}` : d.name;
    const st = await lstat(abs);
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) await walk(abs, childRel, depth + 1, out);
    else if (st.isFile() && /\.json$/i.test(d.name)) out.push({ rel: childRel, abs, size: st.size });
  }
}

function sha256File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    createReadStream(file).on("data", (c) => h.update(c)).on("error", reject).on("end", () => resolve(h.digest("hex")));
  });
}

/** Zod issues in plain words: "row 4, marks: Expected number". */
export function plainIssues(r: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }, limit = 3): string[] {
  if (r.success) return [];
  return (r.error?.issues ?? []).slice(0, limit).map((i) => {
    const parts = i.path.map(String);
    const where: string[] = [];
    for (const p of parts) {
      if (/^\d+$/.test(p)) where.push(`row ${Number(p) + 1}`);
      else if (where.length && where[where.length - 1]!.startsWith("row ")) where[where.length - 1] += `, ${p}`;
      else where.push(p);
    }
    return `${where.join(" › ") || "the file"}: ${i.message}`;
  });
}

type Inspection = { cls: Classified | null; status: DataStatus; summary: string | null; message: string | null };

async function readParsed(abs: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(abs, "utf8")) as unknown;
  } catch (e) {
    throw new UserFacingError(`Not valid JSON: ${(e as Error).message}`);
  }
}

/** Work out what a file is and whether it is good to apply. Never throws for a bad file. */
async function inspect(db: Database, f: Found): Promise<Inspection> {
  let cls = classifyByPath(f.rel);
  try {
    if (cls?.kind === "derived") return { cls, status: "ignored", summary: null, message: "Worked out by meritNAMA from the other files; not imported." };
    if (cls?.kind === "later") return { cls, status: "ignored", summary: null, message: "Recognised, but this kind of file is not imported yet." };
    if (f.size === 0) return { cls, status: "problem", summary: null, message: "The file is empty." };

    let data: unknown;
    if (!cls) {
      if (f.size > SNIFF_MAX_BYTES) return { cls, status: "ignored", summary: null, message: "Not recognised: name it like round_<n>.json, induction<n>_seats.json, scoring_policy.json … (see the data formats guide)." };
      data = await readParsed(f.abs);
      cls = classifyByContents(data);
      if (!cls) return { cls, status: "ignored", summary: null, message: "Not recognised from its name or contents. Name it like round_<n>.json, induction<n>_seats.json, scoring_policy.json … (see the data formats guide)." };
    }
    const missing = missingDetail(cls);
    if (missing) return { cls, status: "problem", summary: null, message: missing };

    if (cls.kind === "sim_input" || cls.kind === "consent") {
      if (f.size > DATA_FILE_MAX_BYTES) return { cls, status: "problem", summary: null, message: "The file is larger than 200 MB." };
      if (f.size <= PARSED_MAX_BYTES) await readParsed(f.abs); // catches broken JSON early; the estimate importer validates the shape
      const note = cls.kind === "consent" ? `Consent replies for round ${cls.round}` : `${describeClassified(cls)}`;
      return { cls, status: "new", summary: `${note} · used for estimates`, message: null };
    }

    if (f.size > PARSED_MAX_BYTES) return { cls, status: "problem", summary: null, message: "The file is larger than 25 MB." };
    data ??= await readParsed(f.abs);

    if (cls.kind === "merit") {
      const r = meritRoundFileSchema.safeParse(data);
      if (!r.success) return { cls, status: "problem", summary: null, message: plainIssues(r).join("; ") };
      const ind = r.data.Table[0]!.inductionId;
      if (cls.induction != null && cls.induction !== ind) return { cls, status: "problem", summary: null, message: `The name says induction ${cls.induction} but the file is for induction ${ind}.` };
      cls = { ...cls, induction: ind };
      const [ex] = await db.select({ id: meritRounds.id }).from(meritRounds).where(and(eq(meritRounds.inductionId, ind), eq(meritRounds.roundNo, cls.round!))).limit(1);
      return { cls, status: ex ? "replaces" : "new", summary: `Induction ${ind}, round ${cls.round} · ${r.data.Table5.length.toLocaleString("en-US")} allocations`, message: ex ? "Replaces the round that is live now. Applying shows exactly what changes." : null };
    }
    if (cls.kind === "seats") {
      const r = seatFileSchema.safeParse(data);
      if (!r.success) return { cls, status: "problem", summary: null, message: plainIssues(r).join("; ") };
      const [n] = await db.select({ n: count() }).from(inductionSeats).where(eq(inductionSeats.inductionId, cls.induction!));
      const has = (n?.n ?? 0) > 0;
      return { cls, status: has ? "replaces" : "new", summary: `Induction ${cls.induction} · ${r.data.length} seat lines`, message: has ? "Replaces the seat matrix that is live now." : null };
    }
    if (cls.kind === "policy") {
      const r = scoringPolicyFileSchema.safeParse(data);
      if (!r.success) return { cls, status: "problem", summary: null, message: plainIssues(r).join("; ") };
      const [a] = await db.select({ id: scoringPolicies.id }).from(scoringPolicies).where(eq(scoringPolicies.status, "active")).limit(1);
      return { cls, status: a ? "replaces" : "new", summary: `${Object.keys(r.data.policies).length} policies, active "${r.data.active_policy}"`, message: a ? "A scoring policy is live now; this one waits for your review." : null };
    }
    // reference document
    const def = DOCUMENT_KINDS[cls.refKind!];
    const r = def.schema.safeParse(data);
    if (!r.success) return { cls, status: "problem", summary: null, message: plainIssues(r).join("; ") };
    return { cls, status: "new", summary: `${def.label}${cls.induction ? `, induction ${cls.induction}` : ""} · saved as a new version`, message: null };
  } catch (e) {
    return { cls, status: "problem", summary: null, message: e instanceof UserFacingError ? e.message : "The file could not be read." };
  }
}

// ── Scanning ───────────────────────────────────────────────────────────────────

export type ScanResult = { files: number; added: number; changed: number; missing: number };

let scanning: Promise<ScanResult> | null = null;

/** Read the folder and update the table. One scan at a time; callers during a scan share its result. */
function scan(db: Database, root?: string): Promise<ScanResult> {
  scanning ??= doScan(db, root).finally(() => { scanning = null; });
  return scanning;
}

async function doScan(db: Database, rootOverride?: string): Promise<ScanResult> {
  const root = dataRoot(rootOverride);
  await mkdir(root, { recursive: true });
  const found: Found[] = [];
  await walk(root, "", 0, found);

  const rows = await db.select().from(dataFiles);
  const byPath = new Map(rows.map((r) => [r.path, r]));
  const now = new Date();
  const result: ScanResult = { files: found.length, added: 0, changed: 0, missing: 0 };

  for (const f of found) {
    if (!cleanRelPath(f.rel)) continue; // a name the folder does not accept (spaces are fine, odd characters are not)
    const sha = await sha256File(f.abs);
    const row = byPath.get(f.rel);
    byPath.delete(f.rel);
    if (row && row.sha256 === sha && row.status !== "missing") {
      // Unchanged. A staged change that was published since makes the file live.
      if (row.changeId && row.status === "replaces") {
        const [c] = await db.select({ status: stagedChanges.status }).from(stagedChanges).where(eq(stagedChanges.id, row.changeId)).limit(1);
        if (c?.status === "published") await db.update(dataFiles).set({ status: "live", message: null, lastSeenAt: now }).where(eq(dataFiles.id, row.id));
        else if (c?.status === "discarded") await db.update(dataFiles).set({ changeId: null, appliedSha256: null, message: "The staged change was discarded. Apply again to restage it.", lastSeenAt: now }).where(eq(dataFiles.id, row.id));
        else await db.update(dataFiles).set({ lastSeenAt: now }).where(eq(dataFiles.id, row.id));
      } else {
        await db.update(dataFiles).set({ lastSeenAt: now }).where(eq(dataFiles.id, row.id));
      }
      continue;
    }
    const ins = await inspect(db, f);
    const values = {
      kind: ins.cls?.kind ?? "unknown",
      induction: ins.cls?.induction ?? null,
      round: ins.cls?.round ?? null,
      sizeBytes: f.size,
      sha256: sha,
      status: ins.status,
      summary: ins.summary,
      message: ins.message,
      lastSeenAt: now,
    };
    if (row) {
      result.changed++;
      await db.update(dataFiles).set({ ...values, changeId: null }).where(eq(dataFiles.id, row.id));
    } else {
      result.added++;
      await db.insert(dataFiles).values({ path: f.rel, ...values });
    }
  }

  // Rows whose file is gone: keep the data, say so.
  const gone = [...byPath.values()].filter((r) => r.status !== "missing");
  result.missing = gone.length;
  if (gone.length) {
    await db.update(dataFiles).set({ status: "missing", message: "No longer in the folder. The data it brought stays live." }).where(inArray(dataFiles.id, gone.map((g) => g.id)));
  }
  return result;
}

// ── Applying ───────────────────────────────────────────────────────────────────

const ORDER: Record<string, number> = { policy: 0, reference: 1, merit: 2, seats: 3, consent: 4, sim_input: 5 };

async function safeAbs(rel: string, rootOverride?: string) {
  const clean = cleanRelPath(rel);
  if (!clean) throw new UserFacingError("That is not a file name the data folder accepts.");
  const root = dataRoot(rootOverride);
  const abs = path.join(/* turbopackIgnore: true */ root, ...clean.split("/"));
  if (!abs.startsWith(root + path.sep)) throw new UserFacingError("That is not a file name the data folder accepts.");
  const st = await lstat(abs).catch(() => null);
  if (!st) throw new UserFacingError("That file is no longer in the folder.");
  if (!st.isFile() || st.isSymbolicLink()) throw new UserFacingError("Only regular files are read from the data folder.");
  return { abs, rel: clean, size: st.size };
}

async function copyToSimulation(abs: string, target: string, rootOverride?: string) {
  const dest = path.join(/* turbopackIgnore: true */ simulationRoot(rootOverride), ...target.split("/"));
  await mkdir(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.part`;
  await copyFile(abs, tmp);
  await rename(tmp, dest);
}

/**
 * Apply one file. Goes through the same proposals as an upload: new data is live at
 * once, data that would replace live data is staged with a before/after to review.
 */
async function applyRow(db: Database, session: Session, row: typeof dataFiles.$inferSelect, rootOverride?: string): Promise<Proposal> {
  const { abs, rel } = await safeAbs(row.path, rootOverride);
  const sha = await sha256File(abs);
  if (sha !== row.sha256) throw new UserFacingError("The file changed since the list was made. Rescan and check it again.");
  const cls = classifyByPath(rel) ?? { kind: row.kind as Classified["kind"], induction: row.induction, round: row.round };
  const reason = `Data folder: ${rel}`;
  let result: Proposal;

  if (cls.kind === "consent" || cls.kind === "sim_input") {
    const target = simulationTarget({ ...cls, induction: row.induction ?? cls.induction, round: row.round ?? cls.round }, path.basename(rel));
    if (!target) throw new UserFacingError("The induction is not in the name or folder.");
    assertCan(session, "data.edit");
    await copyToSimulation(abs, target, rootOverride);
    result = { applied: true, message: `Kept for estimates (${target}).` };
  } else {
    const file = await readParsed(abs);
    if (cls.kind === "merit") result = await proposeMeritRound(db, session, { roundNo: row.round ?? cls.round!, file, reason });
    else if (cls.kind === "seats") result = await proposeSeatFile(db, session, { induction: row.induction ?? cls.induction!, file, reason });
    else if (cls.kind === "policy") result = await proposePolicyFile(db, session, { file, reason });
    else if (cls.kind === "reference" && "refKind" in cls && cls.refKind) {
      const saved = await saveReferenceDocument(db, session, { kind: cls.refKind, induction: row.induction ?? cls.induction, data: file, reason });
      result = { applied: true, message: `${DOCUMENT_KINDS[cls.refKind].label} saved as version ${saved.version}.` };
    } else throw new UserFacingError("This kind of file is not imported.");
  }

  await db.update(dataFiles).set({
    appliedSha256: sha,
    appliedAt: new Date(),
    appliedBy: session.email,
    status: result.applied ? (cls.kind === "consent" || cls.kind === "sim_input" ? "held" : "live") : "replaces",
    message: result.applied ? null : "Staged for review: open the change to see what differs, then publish it.",
    changeId: result.applied ? null : result.changeId,
  }).where(eq(dataFiles.id, row.id));
  await writeAudit(db, session.email, { action: "data_file.apply", entityType: "data_file", entityId: rel, after: { applied: result.applied, kind: row.kind }, reason });
  return result;
}

/** Apply one listed file (a click on its row). */
export async function applyDataFile(db: Database, session: Session | null, input: { id: string }, opts: { root?: string } = {}): Promise<Proposal> {
  assertCan(session, "data.edit");
  const [row] = await db.select().from(dataFiles).where(eq(dataFiles.id, input.id)).limit(1);
  if (!row) throw new UserFacingError("That file is not in the list.");
  if (row.status === "problem" || row.status === "ignored" || row.status === "missing") throw new UserFacingError(row.message ?? "This file cannot be applied.");
  try {
    return await applyRow(db, session, row, opts.root);
  } catch (e) {
    if (e instanceof UserFacingError) await db.update(dataFiles).set({ status: "problem", message: e.message }).where(eq(dataFiles.id, row.id));
    throw e;
  }
}

export type ApplyAllResult = { applied: string[]; staged: string[]; failed: { path: string; message: string }[] };

/** Apply every file that is new (not those replacing live data), in a safe order. */
async function applyNew(db: Database, session: Session, opts: { root?: string } = {}): Promise<ApplyAllResult> {
  const rows = (await db.select().from(dataFiles).where(eq(dataFiles.status, "new")))
    .sort((a, b) => (ORDER[a.kind] ?? 9) - (ORDER[b.kind] ?? 9) || (a.induction ?? 0) - (b.induction ?? 0) || (a.round ?? 0) - (b.round ?? 0) || a.path.localeCompare(b.path));
  const out: ApplyAllResult = { applied: [], staged: [], failed: [] };
  for (const row of rows) {
    try {
      const r = await applyRow(db, session, row, opts.root);
      (r.applied ? out.applied : out.staged).push(row.path);
    } catch (e) {
      const message = e instanceof UserFacingError ? e.message : "Applying failed; see the server log.";
      if (!(e instanceof UserFacingError)) console.error("data folder apply", row.path, e);
      await db.update(dataFiles).set({ status: "problem", message }).where(eq(dataFiles.id, row.id));
      out.failed.push({ path: row.path, message });
    }
  }
  return out;
}

/** Rescan, then apply everything new: the "Publish all" button. */
export async function applyAllDataFiles(db: Database, session: Session | null, opts: { root?: string } = {}): Promise<ApplyAllResult> {
  assertCan(session, "data.edit");
  await scan(db, opts.root);
  return applyNew(db, session, opts);
}

/** Rescan the folder without applying anything. */
export async function scanDataFolder(db: Database, session: Session | null, opts: { root?: string } = {}): Promise<ScanResult> {
  assertCan(session, "data.edit");
  return scan(db, opts.root);
}

/**
 * The worker's job, once a minute: rescan, and publish new files when auto-publish is
 * on. Replacements are never applied here; they wait for a person.
 */
export async function autoImportDataFolder(db: Database, opts: { root?: string } = {}): Promise<{ scan: ScanResult; applied: number; failed: number }> {
  const scanned = await scan(db, opts.root);
  if (!(await loadDataSettings(db)).autoPublish) return { scan: scanned, applied: 0, failed: 0 };
  const r = await applyNew(db, SYSTEM_SESSION, opts);
  return { scan: scanned, applied: r.applied.length + r.staged.length, failed: r.failed.length };
}

// ── Listing ────────────────────────────────────────────────────────────────────

export type DataFileItem = {
  id: string;
  path: string;
  name: string;
  kind: string;
  kindLabel: string;
  induction: number | null;
  round: number | null;
  sizeBytes: number;
  status: DataStatus;
  summary: string | null;
  message: string | null;
  changeId: string | null;
  changeStatus: string | null;
  firstSeenAt: Date;
  appliedAt: Date | null;
  appliedBy: string | null;
};

export async function listDataFiles(db: Database, session: Session | null): Promise<DataFileItem[]> {
  assertCan(session, "staff");
  const rows = await db.select({ f: dataFiles, changeStatus: stagedChanges.status }).from(dataFiles)
    .leftJoin(stagedChanges, eq(stagedChanges.id, dataFiles.changeId))
    .orderBy(asc(dataFiles.induction), asc(dataFiles.kind), asc(dataFiles.round), asc(dataFiles.path));
  return rows.map(({ f, changeStatus }) => ({
    id: f.id,
    path: f.path,
    name: path.posix.basename(f.path),
    kind: f.kind,
    kindLabel: DATA_KIND_LABELS[f.kind as keyof typeof DATA_KIND_LABELS] ?? "Not recognised",
    induction: f.induction,
    round: f.round,
    sizeBytes: f.sizeBytes,
    status: f.status as DataStatus,
    summary: f.summary,
    message: f.message,
    changeId: f.changeId,
    changeStatus: changeStatus ?? null,
    firstSeenAt: f.firstSeenAt,
    appliedAt: f.appliedAt,
    appliedBy: f.appliedBy,
  }));
}

/** Counts for the Today tile: files waiting for a click, with problems, and new. */
export async function dataCounts(db: Database, session: Session | null): Promise<{ waiting: number; problems: number; fresh: number; total: number }> {
  assertCan(session, "staff");
  const rows = await db.select({ status: dataFiles.status, n: count() }).from(dataFiles).groupBy(dataFiles.status);
  const n = (s: string) => rows.find((r) => r.status === s)?.n ?? 0;
  return { waiting: n("replaces"), problems: n("problem"), fresh: n("new"), total: rows.reduce((s, r) => s + r.n, 0) };
}

export type EstimateReadiness = { induction: number; roles: SimRole[]; problem: string | null };

/** Per induction: which estimate inputs are in the folder and whether the estimate dataset can be built. */
export async function estimateReadiness(db: Database, session: Session | null): Promise<EstimateReadiness[]> {
  assertCan(session, "staff");
  const rows = await db.select({ induction: dataFiles.induction, path: dataFiles.path, status: dataFiles.status }).from(dataFiles).where(eq(dataFiles.kind, "sim_input"));
  const by = new Map<number, Set<SimRole>>();
  for (const r of rows) {
    if (r.induction == null || r.status === "missing" || r.status === "problem") continue;
    const role = classifyByPath(r.path)?.role;
    if (role) (by.get(r.induction) ?? by.set(r.induction, new Set()).get(r.induction)!).add(role);
  }
  return [...by.entries()].map(([induction, set]) => ({ induction, roles: [...set], problem: importProblem([...set].map((role) => ({ role }))) })).sort((a, b) => b.induction - a.induction);
}

// ── Files in and out ───────────────────────────────────────────────────────────

/** Write an uploaded file into the folder (atomically). Returns its clean path. */
export async function writeDataFile(session: Session | null, relIn: string, bytes: Uint8Array, opts: { root?: string } = {}): Promise<string> {
  assertCan(session, "data.edit");
  const rel = cleanRelPath(relIn);
  if (!rel) throw new UserFacingError(`"${relIn.slice(0, 80)}" is not a name the data folder accepts (JSON files, simple names).`);
  if (bytes.byteLength === 0) throw new UserFacingError("The file is empty.");
  if (bytes.byteLength > DATA_FILE_MAX_BYTES) throw new UserFacingError("The file is larger than 200 MB.");
  const root = dataRoot(opts.root);
  const abs = path.join(/* turbopackIgnore: true */ root, ...rel.split("/"));
  if (!abs.startsWith(root + path.sep)) throw new UserFacingError("That is not a name the data folder accepts.");
  const existing = await lstat(abs).catch(() => null);
  if (existing && (!existing.isFile() || existing.isSymbolicLink())) throw new UserFacingError("A folder or link is already at that path.");
  await mkdir(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.part`;
  await writeFile(tmp, bytes, { mode: 0o600 });
  await rename(tmp, abs);
  return rel;
}

/** A file for the Download button: the same bytes that are in the folder. Raw files can hold personal data, so data editors only. */
export async function readDataFile(db: Database, session: Session | null, input: { id: string }, opts: { root?: string } = {}): Promise<{ filename: string; body: Buffer }> {
  assertCan(session, "data.edit");
  const [row] = await db.select({ path: dataFiles.path }).from(dataFiles).where(eq(dataFiles.id, input.id)).limit(1);
  if (!row) throw new UserFacingError("That file is not in the list.");
  const { abs } = await safeAbs(row.path, opts.root);
  return { filename: path.posix.basename(row.path), body: await readFile(abs) };
}

/** Take a file out of the folder. Data it already brought stays live. */
export async function removeDataFile(db: Database, session: Session | null, input: { id: string; reason: string }, opts: { root?: string } = {}) {
  assertCan(session, "data.edit");
  if (!input.reason.trim()) throw new UserFacingError("Enter a reason.");
  const [row] = await db.select().from(dataFiles).where(eq(dataFiles.id, input.id)).limit(1);
  if (!row) throw new UserFacingError("That file is not in the list.");
  const abs = await safeAbs(row.path, opts.root).then((r) => r.abs, () => null);
  if (abs) await rm(abs, { force: true });
  await db.delete(dataFiles).where(eq(dataFiles.id, row.id));
  await writeAudit(db, session.email, { action: "data_file.remove", entityType: "data_file", entityId: row.path, before: { status: row.status }, reason: input.reason.trim() });
}
