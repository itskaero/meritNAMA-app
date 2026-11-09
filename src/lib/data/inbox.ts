import "server-only";
import { lstat, mkdir, readdir, readFile, rename } from "node:fs/promises";
import path from "node:path";
import { and, count, eq } from "drizzle-orm";
import { assertCan, can, type Capability, type Session } from "@/lib/auth/roles";
import type { Database } from "@/lib/db/client";
import { inductionSeats, meritRounds, scoringPolicies } from "@/lib/db/schema";
import { meritRoundFileSchema, roundNoFromFilename } from "@/lib/domain/merit-round";
import { seatFileSchema } from "@/lib/domain/reference-data";
import { scoringPolicyFileSchema } from "@/lib/domain/scoring-policy";
import { env } from "@/lib/env";
import { UserFacingError } from "@/lib/errors";
import { DOCUMENT_KINDS, type DocumentKind } from "@/lib/domain/reference-data";
import { proposeMeritRound, proposePolicyFile, proposeSeatFile, type Proposal } from "./changes";
import { saveReferenceDocument } from "./reference-data";
import { requireReason, writeAudit } from "./shared";

/**
 * The watched folder ("inbox") on the server's storage volume. Files dropped into
 *   <APP_STORAGE_DIR>/inbox/merit/   round_<n>.json  (or i20_round_6.json …)
 *   <APP_STORAGE_DIR>/inbox/seats/   induction<n>_seats.json
 *   <APP_STORAGE_DIR>/inbox/policy/  scoring_policy.json
 *   <APP_STORAGE_DIR>/inbox/reference/  disciplineFullData.json, induction<n>_specialty_groups.json,
 *                                       cpsp_accreditation.json
 * are listed with their validation result; an admin imports them with one click,
 * through the same preview → publish path as uploads, and the file then moves to
 * inbox/processed/. Only names matching a folder's pattern are ever opened;
 * symlinks and non-regular files are refused.
 */

export const INBOX_KINDS = {
  merit: { folder: "merit", pattern: /^(?:[a-z0-9]{1,12}[_-])?round[_-]?(\d{1,2})\.json$/i, capability: "data.edit", label: "Merit round" },
  seats: { folder: "seats", pattern: /^induction(\d{1,3})_seats\.json$/i, capability: "data.edit", label: "Seat matrix" },
  policy: { folder: "policy", pattern: /^scoring_policy\.json$/i, capability: "policy.edit", label: "Scoring policy file" },
  reference: { folder: "reference", pattern: /^(?:disciplineFullData|induction(\d{1,3})_specialty_groups|cpsp_accreditation)\.json$/i, capability: "data.edit", label: "Reference document" },
} as const satisfies Record<string, { folder: string; pattern: RegExp; capability: Capability; label: string }>;
export type InboxKind = keyof typeof INBOX_KINDS;

const MAX_BYTES = 3 * 1024 * 1024;

/** Which reference document a file in inbox/reference/ is, by its name. */
function referenceKind(name: string): { kind: DocumentKind; induction: number | null } | null {
  const n = name.toLowerCase();
  if (n === "disciplinefulldata.json") return { kind: "disciplines", induction: null };
  if (n === "cpsp_accreditation.json") return { kind: "cpsp_accreditation", induction: null };
  const m = /^induction(\d{1,3})_specialty_groups\.json$/.exec(n);
  return m ? { kind: "specialty_groups", induction: Number(m[1]) } : null;
}

const PATTERN_HINT: Record<InboxKind, string> = {
  merit: "round_<n>.json",
  seats: "induction<n>_seats.json",
  policy: "scoring_policy.json",
  reference: "disciplineFullData.json, induction<n>_specialty_groups.json or cpsp_accreditation.json",
};

export type InboxItem = {
  kind: InboxKind | "unrecognised";
  folder: string;
  name: string;
  size: number;
  modifiedAt: Date;
  /** Shown to the admin: what the file is about. */
  target: string | null;
  /** Would replace existing data (so it will be staged for review). */
  replaces: boolean;
  issues: string[];
  canImport: boolean;
};

const inboxRoot = (root?: string) => path.resolve(/* turbopackIgnore: true */ root ?? env().APP_STORAGE_DIR, "inbox");

async function ensureFolders(root: string) {
  for (const f of [...Object.values(INBOX_KINDS).map((k) => k.folder), "processed"]) await mkdir(path.join(/* turbopackIgnore: true */ root, f), { recursive: true });
}

/** A file inside a kind's folder, by basename only. Refuses traversal, symlinks and non-files. */
async function safeFile(root: string, kind: InboxKind, name: string) {
  const k = INBOX_KINDS[kind];
  if (path.basename(name) !== name || !k.pattern.test(name)) throw new UserFacingError("That is not a file name the inbox accepts.");
  const file = path.join(/* turbopackIgnore: true */ root, k.folder, name);
  const st = await lstat(file).catch(() => null);
  if (!st) throw new UserFacingError("That file is no longer in the inbox.");
  if (!st.isFile() || st.isSymbolicLink()) throw new UserFacingError("Only regular files are read from the inbox.");
  if (st.size > MAX_BYTES) throw new UserFacingError(`The file is larger than ${MAX_BYTES / 1024 / 1024} MB.`);
  return { file, st };
}

async function readJson(file: string) {
  try {
    return JSON.parse(await readFile(file, "utf8")) as unknown;
  } catch (e) {
    throw new UserFacingError(`Not valid JSON: ${(e as Error).message}`);
  }
}

const issuesOf = (r: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  r.success ? [] : (r.error?.issues ?? []).slice(0, 5).map((i) => `${i.path.map(String).join(".") || "(root)"}: ${i.message}`);

/** Files waiting in the inbox, with what each one would do. */
export async function listInbox(db: Database, session: Session | null, opts: { root?: string } = {}): Promise<InboxItem[]> {
  assertCan(session, "staff");
  const root = inboxRoot(opts.root);
  await ensureFolders(root);
  const items: InboxItem[] = [];
  for (const [kind, k] of Object.entries(INBOX_KINDS) as [InboxKind, (typeof INBOX_KINDS)[InboxKind]][]) {
    const names = (await readdir(path.join(/* turbopackIgnore: true */ root, k.folder), { withFileTypes: true })).filter((d) => !d.name.startsWith("."));
    for (const d of names) {
      const base = { folder: k.folder, name: d.name, target: null, replaces: false, issues: [] as string[] };
      const st = await lstat(path.join(/* turbopackIgnore: true */ root, k.folder, d.name));
      if (!k.pattern.test(d.name) || !st.isFile() || st.isSymbolicLink()) {
        items.push({ ...base, kind: "unrecognised", size: st.size, modifiedAt: st.mtime, canImport: false, issues: [`Not opened: names in ${k.folder}/ must look like ${PATTERN_HINT[kind]}${st.isSymbolicLink() ? " (symlinks are refused)" : ""}.`] });
        continue;
      }
      const item: InboxItem = { ...base, kind, size: st.size, modifiedAt: st.mtime, canImport: can(session, k.capability) };
      if (st.size > MAX_BYTES) item.issues.push("Larger than 3 MB.");
      else {
        try {
          const data = await readJson(path.join(/* turbopackIgnore: true */ root, k.folder, d.name));
          if (kind === "merit") {
            const r = meritRoundFileSchema.safeParse(data);
            item.issues = issuesOf(r);
            const roundNo = roundNoFromFilename(d.name);
            if (r.success && roundNo) {
              const ind = r.data.Table[0]!.inductionId;
              item.target = `Induction ${ind}, round ${roundNo} · ${r.data.Table5.length} allocations`;
              const [ex] = await db.select({ id: meritRounds.id }).from(meritRounds).where(and(eq(meritRounds.inductionId, ind), eq(meritRounds.roundNo, roundNo))).limit(1);
              item.replaces = Boolean(ex);
            }
          } else if (kind === "seats") {
            const r = seatFileSchema.safeParse(data);
            item.issues = issuesOf(r);
            const ind = Number(k.pattern.exec(d.name)![1]);
            if (r.success) {
              item.target = `Induction ${ind} · ${r.data.length} seat lines`;
              const [n] = await db.select({ n: count() }).from(inductionSeats).where(eq(inductionSeats.inductionId, ind));
              item.replaces = (n?.n ?? 0) > 0;
            }
          } else if (kind === "reference") {
            const ref = referenceKind(d.name)!;
            const r = DOCUMENT_KINDS[ref.kind].schema.safeParse(data);
            item.issues = issuesOf(r);
            // Reference documents are versioned: importing adds a new version, the old ones stay.
            if (r.success) item.target = `${DOCUMENT_KINDS[ref.kind].label}${ref.induction ? `, induction ${ref.induction}` : ""} · saved as a new version`;
          } else {
            const r = scoringPolicyFileSchema.safeParse(data);
            item.issues = issuesOf(r);
            if (r.success) {
              item.target = `${Object.keys(r.data.policies).length} policies, active "${r.data.active_policy}"`;
              const [a] = await db.select({ id: scoringPolicies.id }).from(scoringPolicies).where(eq(scoringPolicies.status, "active")).limit(1);
              item.replaces = Boolean(a);
            }
          }
        } catch (e) {
          item.issues.push(e instanceof UserFacingError ? e.message : "Could not read the file.");
        }
      }
      if (item.issues.length) item.canImport = false;
      items.push(item);
    }
  }
  return items.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());
}

async function moveToProcessed(root: string, kind: InboxKind, file: string, name: string, note: "imported" | "skipped") {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await rename(file, path.join(/* turbopackIgnore: true */ root, "processed", `${stamp}-${note}-${kind}-${name}`));
}

/**
 * Import one inbox file. New data applies at once; data that would be replaced is
 * staged for review. Either way the file moves to inbox/processed/.
 */
export async function importFromInbox(
  db: Database,
  session: Session | null,
  input: { kind: InboxKind; name: string; reason: string; calendarYear?: number },
  opts: { root?: string } = {},
): Promise<Proposal> {
  assertCan(session, "staff"); // the folder's own capability is checked below
  const k = INBOX_KINDS[input.kind];
  if (!k) throw new UserFacingError("Unknown inbox folder.");
  assertCan(session, k.capability);
  const reason = requireReason(input.reason, "imports");
  const root = inboxRoot(opts.root);
  const { file } = await safeFile(root, input.kind, input.name);
  const data = await readJson(file);
  const why = `${reason} (inbox: ${input.name})`;

  let result: Proposal;
  if (input.kind === "merit") {
    const roundNo = roundNoFromFilename(input.name);
    if (!roundNo) throw new UserFacingError("The round number is not in the file name.");
    result = await proposeMeritRound(db, session, { roundNo, file: data, reason: why });
  } else if (input.kind === "seats") {
    const induction = Number(k.pattern.exec(input.name)![1]);
    result = await proposeSeatFile(db, session, { induction, calendarYear: input.calendarYear, file: data, reason: why });
  } else if (input.kind === "reference") {
    const ref = referenceKind(input.name);
    if (!ref) throw new UserFacingError("The document type is not in the file name.");
    const saved = await saveReferenceDocument(db, session, { kind: ref.kind, induction: ref.induction, data, reason: why });
    result = { applied: true, message: `${DOCUMENT_KINDS[ref.kind].label} saved as version ${saved.version}: ${saved.summary}.` };
  } else {
    result = await proposePolicyFile(db, session, { file: data, reason: why });
  }
  await moveToProcessed(root, input.kind, file, input.name, "imported");
  return result;
}

/** Set a file aside without importing it (moves it to inbox/processed/). */
export async function skipInboxFile(db: Database, session: Session | null, input: { kind: InboxKind; name: string; reason: string }, opts: { root?: string } = {}) {
  assertCan(session, "staff"); // the folder's own capability is checked below
  const k = INBOX_KINDS[input.kind];
  if (!k) throw new UserFacingError("Unknown inbox folder.");
  assertCan(session, k.capability);
  const reason = requireReason(input.reason, "skipping a file");
  const root = inboxRoot(opts.root);
  const { file } = await safeFile(root, input.kind, input.name);
  await moveToProcessed(root, input.kind, file, input.name, "skipped");
  await writeAudit(db, session.email, { action: "inbox.skip", entityType: "inbox_file", entityId: `${k.folder}/${input.name}`, reason });
}

/**
 * Import every inbox file that is valid, new and allowed, in a safe order: the scoring
 * policy, reference documents, merit rounds (oldest induction and round first; they
 * create their inductions), then seat matrices. Files that would replace data stay in
 * the inbox for a one-by-one review; failures are reported and the rest go on.
 */
export async function importAllFromInbox(
  db: Database,
  session: Session | null,
  input: { reason: string },
  opts: { root?: string } = {},
): Promise<{ imported: string[]; failed: { name: string; message: string }[]; leftForReview: number }> {
  assertCan(session, "staff");
  requireReason(input.reason, "imports");
  const items = await listInbox(db, session, opts);
  const rank: Record<string, number> = { policy: 0, reference: 1, merit: 2, seats: 3 };
  const nums = (s: string) => (s.match(/\d+/g) ?? []).map(Number);
  const cmp = (a: string, b: string) => {
    const x = nums(a), y = nums(b);
    for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? -1) !== (y[i] ?? -1)) return (x[i] ?? -1) - (y[i] ?? -1);
    return a.localeCompare(b);
  };
  const todo = items
    .filter((i): i is InboxItem & { kind: InboxKind } => i.kind !== "unrecognised" && i.canImport && !i.replaces && i.issues.length === 0)
    .sort((a, b) => rank[a.kind]! - rank[b.kind]! || cmp(a.name, b.name));
  const imported: string[] = [];
  const failed: { name: string; message: string }[] = [];
  for (const it of todo) {
    try {
      await importFromInbox(db, session, { kind: it.kind, name: it.name, reason: input.reason }, opts);
      imported.push(`${it.folder}/${it.name}`);
    } catch (e) {
      failed.push({ name: `${it.folder}/${it.name}`, message: e instanceof UserFacingError ? e.message : "Import failed; see the server log." });
      if (!(e instanceof UserFacingError)) console.error("bulk import", it.name, e);
    }
  }
  const leftForReview = items.filter((i) => i.kind !== "unrecognised" && i.replaces).length;
  return { imported, failed, leftForReview };
}
