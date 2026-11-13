import type { FileKind } from "../kind";
import { MB } from "../kind";

/**
 * Files that are recognised and deliberately not imported: backup copies, files the old
 * site worked out from the others, and kinds not supported yet.
 */

const BACKUP = /[_-](?:bk|backup|old|copy)\d*\.json$/i;
const DERIVED = /^(?:induction\d{1,3}_)?(?:closing_merit|trends|flat_lookup|normalized_merit|specialty_ranking|policy_impact|sim_merit_cascade\w*|cascade\w*)\.json$/i;
const LATER = /^(?:induction\d{1,3}_)?(?:schedule|joining_status)\.json$/i;

export const backupKind: FileKind = {
  kind: "backup",
  label: "Backup copy",
  order: 99,
  official: false,
  ignore: "A backup copy (_bk, _old, _copy); skipped. Keep only the file you mean to use.",
  fromPath: (p) => (BACKUP.test(p.name) ? { kind: "backup", induction: p.induction, round: null } : null),
  maxBytes: 0,
};

export const derivedKind: FileKind = {
  kind: "derived",
  label: "Worked out by meritNAMA",
  order: 99,
  official: false,
  ignore: "Worked out by meritNAMA from the other files; not imported.",
  fromPath: (p) => (DERIVED.test(p.name) ? { kind: "derived", induction: p.induction, round: null } : null),
  maxBytes: 0,
};

export const laterKind: FileKind = {
  kind: "later",
  label: "Not supported yet",
  order: 99,
  official: true,
  ignore: "Recognised, but this kind of file is not imported yet.",
  fromPath: (p) => (LATER.test(p.name) ? { kind: "later", induction: p.induction, round: null } : null),
  maxBytes: 25 * MB,
};
