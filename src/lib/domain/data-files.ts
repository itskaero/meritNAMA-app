import { createHash } from "node:crypto";
import { consentRoundFromName, consentFileSchema } from "./sim-dataset";
import { meritRoundFileSchema, roundNoFromFilename } from "./merit-round";
import { DOCUMENT_KINDS, seatFileSchema, type DocumentKind } from "./reference-data";
import { scoringPolicyFileSchema } from "./scoring-policy";

/**
 * The data folder: one place for every dataset file, laid out like the old public
 * repository (inductions/<n>/merit/round_<r>.json …). This module decides, from a
 * file's path (and, when the name says nothing, its contents), what a file is. It is
 * pure: no disk, no database.
 *
 *   inductions/<n>/merit/round_<r>.json        merit round        (also induction<n>_merit_round<r>.json)
 *   inductions/<n>/consent/round_<r>.json      consent replies    (also induction<n>_consent_round<r>.json)
 *   inductions/<n>/gazette/gazette_<n>.json    gazette
 *   inductions/<n>/seats.json                  seat matrix        (also induction<n>_seats.json)
 *   scoring_policy.json                        scoring policy
 *   disciplineFullData.json, cpsp_accreditation.json, induction<n>_specialty_groups.json   reference documents
 *   marks, preferences, candidates, components, certificates, profile status   estimate inputs
 */

export const SIM_ROLE_PATTERNS = {
  marks: /^(?:induction\d{1,3}_)?(?:candidate_?)?marks\.json$/i,
  preferences: /^(?:induction\d{1,3}_)?preferences\.json$/i,
  candidates: /^(?:induction\d{1,3}_)?candidates\.json$/i,
  gazette: /^(?:induction\d{1,3}_)?gazette(?:_\d{1,3})?\.json$/i,
  components: /^(?:induction\d{1,3}_)?components\.json$/i,
  certificates: /^(?:induction\d{1,3}_)?certificates\.json$/i,
  profileStatus: /^(?:(?:induction\d{1,3}_)?profile_?status|ProfileStatus)\.json$/i,
} as const;
export type SimRole = keyof typeof SIM_ROLE_PATTERNS;

export type DataKind = "merit" | "consent" | "seats" | "policy" | "reference" | "sim_input" | "later" | "derived";

export const DATA_KIND_LABELS: Record<DataKind, string> = {
  merit: "Merit round",
  consent: "Consent replies",
  seats: "Seat matrix",
  policy: "Scoring policy",
  reference: "Reference document",
  sim_input: "Estimate input",
  later: "Not supported yet",
  derived: "Worked out by meritNAMA",
};

export type Classified = {
  kind: DataKind;
  /** Induction number when the path says it (merit files also carry it inside). */
  induction: number | null;
  round: number | null;
  role?: SimRole;
  refKind?: DocumentKind;
};

const DERIVED = /^(?:induction\d{1,3}_)?(?:closing_merit|trends|flat_lookup|normalized_merit|specialty_ranking|policy_impact|sim_merit_cascade\w*|cascade\w*)\.json$/i;
const LATER = /^(?:induction\d{1,3}_)?(?:schedule|joining_status)\.json$/i;

/** Clean a path from a browser, a zip or a Git tree: forward slashes, no empty, "." or ".." parts. */
export function cleanRelPath(input: string): string | null {
  if (input.startsWith("/") || input.startsWith(String.fromCharCode(92)) || /^[A-Za-z]:/.test(input)) return null; // absolute paths and drive letters
  const parts = input.replace(/\\/g, "/").split("/").filter((p) => p !== "" && p !== ".");
  if (!parts.length || parts.length > 6) return null;
  if (parts.some((p) => p === ".." || p.length > 120 || !/^[A-Za-z0-9][A-Za-z0-9._ \-()]*$/.test(p))) return null;
  if (!/\.json$/i.test(parts[parts.length - 1]!)) return null;
  return parts.join("/");
}

/** Which induction a path names: an inductions/<n>/ folder, or induction<n>_ / i<n>_ in the file name. */
function inductionOf(parts: string[]): number | null {
  const at = parts.findIndex((p) => p.toLowerCase() === "inductions");
  const folder = at >= 0 ? /^(?:induction)?(\d{1,3})$/i.exec(parts[at + 1] ?? "") : null;
  if (folder) return Number(folder[1]);
  const name = parts[parts.length - 1]!;
  const m = /^(?:induction|i)(\d{1,3})[_-]/i.exec(name);
  return m ? Number(m[1]) : null;
}

/**
 * Classify by path alone. Returns null when the name says nothing (the caller may then
 * look at the contents). Folder names count: merit/, consent/, gazette/ under an
 * induction folder.
 */
export function classifyByPath(rel: string): Classified | null {
  const parts = rel.replace(/\\/g, "/").split("/").filter(Boolean);
  const name = parts[parts.length - 1] ?? "";
  const dirs = parts.slice(0, -1).map((d) => d.toLowerCase());
  const induction = inductionOf(parts);
  const lower = name.toLowerCase();

  if (DERIVED.test(name)) return { kind: "derived", induction, round: null };
  if (LATER.test(name)) return { kind: "later", induction, round: null };

  if (/^scoring_policy\.json$/i.test(name)) return { kind: "policy", induction: null, round: null };
  if (/^disciplinefulldata\.json$/i.test(name)) return { kind: "reference", induction: null, round: null, refKind: "disciplines" };
  if (/^cpsp_accreditation\.json$/i.test(name)) return { kind: "reference", induction: null, round: null, refKind: "cpsp_accreditation" };
  const groups = /^induction(\d{1,3})_specialty_groups\.json$/i.exec(name);
  if (groups) return { kind: "reference", induction: Number(groups[1]), round: null, refKind: "specialty_groups" };

  // consent: consent_round3.json, induction21_consent_round3.json, or round_3.json inside consent/
  const consentRound = consentRoundFromName(name);
  if (consentRound != null) return { kind: "consent", induction, round: consentRound };
  if (dirs.includes("consent") || /consent/.test(lower)) {
    const r = roundNoFromFilename(name);
    return r ? { kind: "consent", induction, round: r } : null;
  }

  // gazette and the other estimate inputs
  for (const role of Object.keys(SIM_ROLE_PATTERNS) as SimRole[]) {
    if (SIM_ROLE_PATTERNS[role].test(name)) return { kind: "sim_input", induction, round: null, role };
  }
  if (dirs.includes("gazette")) return { kind: "sim_input", induction, round: null, role: "gazette" };

  if (/^(?:induction\d{1,3}_)?seats\.json$/i.test(name)) return { kind: "seats", induction, round: null };

  // merit: round_8.json (inside merit/ or not), induction21_merit_round8.json, i20_round_6.json
  const round = roundNoFromFilename(name);
  if (round != null && /^(?:(?:induction|i)\d{1,3}[_-])?(?:merit[_-])?round[_ -]?\d{1,2}\.json$/i.test(name)) return { kind: "merit", induction, round };
  return null;
}

/** What a JSON document is, judged by its shape: for files whose names say nothing. */
export function classifyByContents(data: unknown): Classified | null {
  if (data === null || typeof data !== "object") return null;
  if (meritRoundFileSchema.safeParse(data).success) {
    const ind = (data as { Table: { inductionId: number }[] }).Table[0]!.inductionId;
    return { kind: "merit", induction: ind, round: null };
  }
  if (Array.isArray(data) && seatFileSchema.safeParse(data).success) return { kind: "seats", induction: null, round: null };
  if (scoringPolicyFileSchema.safeParse(data).success) return { kind: "policy", induction: null, round: null };
  for (const [k, def] of Object.entries(DOCUMENT_KINDS) as [DocumentKind, (typeof DOCUMENT_KINDS)[DocumentKind]][]) {
    if (def.schema.safeParse(data).success) return { kind: "reference", induction: null, round: null, refKind: k };
  }
  // A consent file is checked last: its schema is loose.
  if (!Array.isArray(data) && "Table5" in (data as object) && consentFileSchema.safeParse(data).success) return { kind: "consent", induction: null, round: null };
  return null;
}

/** What is still missing before a classified file can be applied, or null. */
export function missingDetail(c: Classified): string | null {
  if (c.kind === "merit" && c.round == null) return "The round number is not in the file name (use round_<n>.json).";
  if (c.kind === "seats" && c.induction == null) return "The induction is not in the name: use induction<n>_seats.json or put it in inductions/<n>/.";
  if (c.kind === "consent" && (c.induction == null || c.round == null)) return "Consent files need the induction and round in the name, e.g. induction21_consent_round3.json.";
  if (c.kind === "sim_input" && c.induction == null) return "The induction is not in the name or folder: use inductions/<n>/ or induction<n>_ in the name.";
  return null;
}

/** Where an estimate input or consent file is placed for the simulation importer (storage/simulation/…). */
export function simulationTarget(c: Classified, basename: string): string | null {
  if (c.induction == null) return null;
  if (c.kind === "consent" && c.round != null) return `induction${c.induction}/consent_round${c.round}.json`;
  if (c.kind === "sim_input" && c.role) {
    // Keep the name the importer expects; a gazette keeps its own name.
    const clean = c.role === "gazette" ? `gazette_${c.induction}.json` : basename.replace(/^induction\d{1,3}_/i, "");
    return `induction${c.induction}/${clean}`;
  }
  return null;
}

/** A readable one-line description of a classified file. */
export function describeClassified(c: Classified): string {
  const bits: string[] = [DATA_KIND_LABELS[c.kind]];
  if (c.induction != null) bits.push(`induction ${c.induction}`);
  if (c.round != null) bits.push(`round ${c.round}`);
  if (c.role) bits.push(c.role === "profileStatus" ? "profile status" : c.role);
  return bits.join(" · ");
}

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
    if (!rel || !cls || cls.kind === "derived" || cls.kind === "later" || (e.size ?? 0) > maxBytes) { skipped++; continue; }
    take.push({ ...e, rel });
  }
  return { take: take.slice(0, maxFiles), skipped, tooMany: take.length > maxFiles };
}

/** The SHA-1 Git gives a file ("blob <size>\0<bytes>"), to tell whether a local copy already matches. */
export function gitBlobSha(bytes: Uint8Array): string {
  return createHash("sha1").update(`blob ${bytes.byteLength}\0`).update(bytes).digest("hex");
}
