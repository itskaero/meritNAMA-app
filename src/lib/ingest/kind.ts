import type { Session } from "@/lib/auth/roles";
import type { Proposal } from "@/lib/data/changes";
import type { Database } from "@/lib/db/client";
import type { DocumentKind } from "@/lib/domain/reference-data";
import type { PathInfo } from "./paths";
import type { SimRole } from "./sim-roles";

/**
 * One kind of data file (merit round, consent replies, gazette, seats, scoring policy …).
 * Each kind lives in its own module under ./kinds/ and says, in one place:
 *   - how it is recognised (from the path, or from the contents when the name says nothing),
 *   - what is still missing before it can be applied,
 *   - how it is checked when the folder is scanned (status, one-line summary),
 *   - how it is applied (live at once, staged for review, or kept for estimates),
 *   - which workflow stage it feeds and whether it is official.
 * The registry (./registry.ts) lists them; the data folder (src/lib/data/datastore.ts) only
 * calls into them, so a new kind is a new module plus one line in the registry.
 */

export type DataKind = "merit" | "consent" | "seats" | "policy" | "reference" | "sim_input" | "schedule" | "joining" | "revisions" | "derived" | "backup";
export type DataStatus = "new" | "replaces" | "live" | "held" | "problem" | "ignored" | "missing";

/** The induction workflow: unofficial list → verification → amendment → gazette → estimate → rounds → joining. */
export type Stage = "unofficial" | "verification" | "amendment" | "gazette" | "estimate" | "rounds" | "joining";

export type Classified = {
  kind: DataKind;
  /** Induction number when the path says it (merit files also carry it inside). */
  induction: number | null;
  round: number | null;
  role?: SimRole;
  refKind?: DocumentKind;
};

/** What a scan made of a file. */
export type Inspection = { cls: Classified | null; status: DataStatus; summary: string | null; message: string | null };

export type CheckCtx = {
  db: Database;
  cls: Classified;
  size: number;
  /** The file's JSON, parsed once and shared. Throws a UserFacingError for broken JSON. */
  json: () => Promise<unknown>;
};

export type ApplyCtx = {
  db: Database;
  session: Session;
  cls: Classified;
  rel: string;
  /** Audit reason, e.g. "Data folder: inductions/21/merit/round_8.json". */
  reason: string;
  json: () => Promise<unknown>;
  /** Copy the file into storage/simulation/ for the estimate importer. */
  keepForEstimates: () => Promise<string>;
};

/** "fail" stops recognition: the name says it is this kind but something is wrong (e.g. no round number). */
export type PathMatch = Classified | "stop" | null;

export type FileKind = {
  kind: DataKind;
  /** Shown in the Files list and the File kinds panel. */
  label: string;
  /** Apply order when several new files are published together (lower first). */
  order: number;
  /** Published by PHF (true) or worked out / unofficial (false). */
  official: boolean;
  /** The workflow stage this file feeds, if any. */
  stage?: (c: Classified) => Stage | null;
  /** Recognised but never imported: the message shown on the file. */
  ignore?: string;
  fromPath?: (p: PathInfo) => PathMatch;
  /** For files whose names say nothing. Lower rank is tried first. */
  fromContents?: { rank: number; match: (data: unknown) => Classified | null };
  missing?: (c: Classified) => string | null;
  /** Largest file this kind accepts. */
  maxBytes: number;
  check?: (ctx: CheckCtx) => Promise<Omit<Inspection, "cls"> & { cls?: Classified }>;
  /** Applied: "live" (or "held" for estimate inputs); otherwise staged with a change to review. */
  apply?: (ctx: ApplyCtx) => Promise<{ result: Proposal; status: "live" | "held" }>;
};

export const MB = 1024 * 1024;
/** Kinds parsed and validated at scan time must be small. */
export const PARSED_MAX_BYTES = 25 * MB;
export const DATA_FILE_MAX_BYTES = 200 * MB;

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
