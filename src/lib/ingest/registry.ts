import type { Classified, DataKind, FileKind } from "./kind";
import { consentKind } from "./kinds/consent";
import { meritKind } from "./kinds/merit";
import { policyKind } from "./kinds/policy";
import { referenceKind } from "./kinds/reference";
import { seatsKind } from "./kinds/seats";
import { simInputKind } from "./kinds/sim-input";
import { joiningKind } from "./kinds/joining";
import { revisionsKind } from "./kinds/revisions";
import { scheduleKind } from "./kinds/schedule";
import { backupKind, derivedKind } from "./kinds/skipped";
import { pathInfo } from "./paths";

/**
 * Every kind of data file, in the order a path is tried against them (the first match
 * wins). Adding a kind = a module in ./kinds/ and one line here.
 */
export const FILE_KINDS: readonly FileKind[] = [
  backupKind,
  derivedKind,
  scheduleKind,
  joiningKind,
  revisionsKind,
  policyKind,
  referenceKind,
  consentKind,
  simInputKind,
  seatsKind,
  meritKind,
];

const BY_KIND = new Map<DataKind, FileKind>(FILE_KINDS.map((k) => [k.kind, k]));

export function fileKind(kind: string): FileKind | null {
  return BY_KIND.get(kind as DataKind) ?? null;
}

export const DATA_KIND_LABELS = Object.fromEntries(FILE_KINDS.map((k) => [k.kind, k.label])) as Record<DataKind, string>;

/**
 * Classify by path alone. Returns null when the name says nothing (the caller may then
 * look at the contents). Folder names count: merit/, consent/, gazette/ under an
 * induction folder.
 */
export function classifyByPath(rel: string): Classified | null {
  const p = pathInfo(rel);
  for (const k of FILE_KINDS) {
    const m = k.fromPath?.(p);
    if (m === "stop") return null;
    if (m) return m;
  }
  return null;
}

const BY_CONTENTS = FILE_KINDS.filter((k) => k.fromContents).sort((a, b) => a.fromContents!.rank - b.fromContents!.rank);

/** What a JSON document is, judged by its shape: for files whose names say nothing. */
export function classifyByContents(data: unknown): Classified | null {
  if (data === null || typeof data !== "object") return null;
  for (const k of BY_CONTENTS) {
    const m = k.fromContents!.match(data);
    if (m) return m;
  }
  return null;
}

/** What is still missing before a classified file can be applied, or null. */
export function missingDetail(c: Classified): string | null {
  return fileKind(c.kind)?.missing?.(c) ?? null;
}

/** A readable one-line description of a classified file. */
export function describeClassified(c: Classified): string {
  const bits: string[] = [DATA_KIND_LABELS[c.kind]];
  if (c.induction != null) bits.push(`induction ${c.induction}`);
  if (c.round != null) bits.push(`round ${c.round}`);
  if (c.role) bits.push(c.role === "profileStatus" ? "profile status" : c.role);
  return bits.join(" · ");
}
