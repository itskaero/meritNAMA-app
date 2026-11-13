import { createHash } from "node:crypto";
import { classifyByPath } from "@/lib/ingest/registry";
import { cleanRelPath } from "@/lib/ingest/paths";

/**
 * The data folder: one place for every dataset file, laid out like the old public
 * repository (inductions/<n>/merit/round_<r>.json …). What each kind of file is, and how
 * it is applied, lives in one module per kind under src/lib/ingest/kinds/; this module
 * keeps the names other code already imports, plus the repository-sync helpers.
 *
 *   inductions/<n>/merit/round_<r>.json        merit round        (also induction<n>_merit_round<r>.json)
 *   inductions/<n>/consent/round_<r>.json      consent replies    (also induction<n>_consent_round<r>.json)
 *   inductions/<n>/gazette/gazette_<n>.json    gazette
 *   inductions/<n>/seats.json                  seat matrix        (also induction<n>_seats.json)
 *   scoring_policy.json                        scoring policy
 *   disciplineFullData.json, cpsp_accreditation.json, induction<n>_specialty_groups.json   reference documents
 *   marks, preferences, candidates, components, certificates, profile status   estimate inputs
 *   *_bk.json, *_old.json, *_copy.json         backups, skipped
 */

export type { Classified, DataKind } from "@/lib/ingest/kind";
export { cleanRelPath } from "@/lib/ingest/paths";
export { classifyByContents, classifyByPath, DATA_KIND_LABELS, describeClassified, missingDetail } from "@/lib/ingest/registry";
export { SIM_ROLE_PATTERNS, simulationTarget, type SimRole } from "@/lib/ingest/sim-roles";

// ── Sync from a Git repository ─────────────────────────────────────────────────

export type TreeEntry = { path: string; type: string; size?: number; sha: string };

/**
 * Which files of a repository tree to pull into the data folder: JSON files whose
 * names we recognise as datasets, within the size limit. Derived and unsupported
 * files, and everything else (package.json, assets), are counted and left out.
 */
export function selectSyncFiles(tree: TreeEntry[], maxBytes: number, maxFiles: number): { take: (TreeEntry & { rel: string })[]; skipped: number; tooMany: boolean } {
  const take: (TreeEntry & { rel: string })[] = [];
  let skipped = 0;
  for (const e of tree) {
    if (e.type !== "blob" || !/\.json$/i.test(e.path)) continue;
    const rel = cleanRelPath(e.path);
    const cls = rel ? classifyByPath(rel) : null;
    if (!rel || !cls || cls.kind === "derived" || cls.kind === "later" || cls.kind === "backup" || (e.size ?? 0) > maxBytes) { skipped++; continue; }
    take.push({ ...e, rel });
  }
  return { take: take.slice(0, maxFiles), skipped, tooMany: take.length > maxFiles };
}

/** The SHA-1 Git gives a file ("blob <size>\0<bytes>"), to tell whether a local copy already matches. */
export function gitBlobSha(bytes: Uint8Array): string {
  return createHash("sha1").update(`blob ${bytes.byteLength}\0`).update(bytes).digest("hex");
}
