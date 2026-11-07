import { z } from "zod";
import { formulaVariables } from "@/lib/engine/formula";

/**
 * Staff corrections to a candidate's simulation inputs. Pure: the data layer stores
 * them (candidate_corrections) and the engine loader applies the active ones on top
 * of the imported dataset, so a re-import keeps them.
 */

export const CORRECTION_FIELDS = ["base_marks", "program_marks", "profile_status", "parameter"] as const;
export type CorrectionField = (typeof CORRECTION_FIELDS)[number];

export const CORRECTION_LABELS: Record<CorrectionField, string> = {
  base_marks: "Base marks",
  program_marks: "Programme marks",
  profile_status: "Profile status",
  parameter: "Parameter",
};

/** Profile verification statuses as the portal numbers them. */
export const PROFILE_STATUS: Record<number, string> = { 1: "Accepted", 2: "Rejected", 11: "Pending" };
export const profileStatusLabel = (v: number | null | undefined) => (v == null ? "Unknown" : (PROFILE_STATUS[v] ?? `Status ${v}`));

export const correctionSchema = z
  .object({
    applicantId: z.string().trim().regex(/^\d+$/, "Applicant IDs are digits"),
    field: z.enum(CORRECTION_FIELDS),
    program: z.string().trim().min(1).nullable().default(null),
    value: z.number().finite(),
  })
  .superRefine((c, ctx) => {
    if (c.field === "program_marks" && !c.program) ctx.addIssue({ code: "custom", message: "Programme marks need a programme", path: ["program"] });
    if (c.field === "parameter" && !c.program) ctx.addIssue({ code: "custom", message: "A parameter correction needs the parameter's name in the program column", path: ["program"] });
    if (c.field !== "program_marks" && c.field !== "parameter" && c.program) ctx.addIssue({ code: "custom", message: "Only programme marks and parameters take a name", path: ["program"] });
    if (c.field === "profile_status" && !(c.value in PROFILE_STATUS)) ctx.addIssue({ code: "custom", message: "Profile status is 1 (Accepted), 2 (Rejected) or 11 (Pending)", path: ["value"] });
    if (c.field !== "profile_status" && (c.value < 0 || c.value > 1000)) ctx.addIssue({ code: "custom", message: "Marks must be between 0 and 1000", path: ["value"] });
  });
export type Correction = z.output<typeof correctionSchema>;

export const correctionKey = (c: Pick<Correction, "applicantId" | "field" | "program">) => `${c.applicantId}|${c.field}|${c.program ?? ""}`;

type Correctable = { applicantId: string; baseMarks: number; programMarks: Record<string, number>; profileStatus: number | null; params?: Record<string, number> };

/** The value a correction targets, as it stands on a candidate. */
export function currentValue(c: Correctable, field: CorrectionField, program: string | null): number | null {
  if (field === "base_marks") return c.baseMarks;
  if (field === "profile_status") return c.profileStatus;
  if (field === "parameter") return c.params?.[program ?? ""] ?? null;
  const v = c.programMarks[program ?? ""];
  return v == null ? null : Number(v);
}

/**
 * Apply corrections (oldest first; a later one for the same value wins). Returns new
 * objects for corrected candidates and the same objects for the rest.
 */
export function applyCorrections<T extends Correctable>(rows: readonly T[], corrections: readonly Correction[]): T[] {
  if (!corrections.length) return [...rows];
  const byId = new Map<string, Correction[]>();
  for (const c of corrections) (byId.get(c.applicantId) ?? byId.set(c.applicantId, []).get(c.applicantId)!).push(c);
  return rows.map((r) => {
    const mine = byId.get(r.applicantId);
    if (!mine) return r;
    const out: T = { ...r, programMarks: { ...r.programMarks }, ...(r.params ? { params: { ...r.params } } : {}) };
    for (const c of mine) {
      if (c.field === "base_marks") out.baseMarks = c.value;
      else if (c.field === "profile_status") out.profileStatus = c.value;
      else if (c.field === "parameter") out.params = { ...out.params, [c.program!]: c.value };
      else out.programMarks[c.program!] = c.value;
    }
    return out;
  });
}

// ── CSV ─────────────────────────────────────────────────────────────────────────

/** Split one CSV line (RFC 4180 quoting; no embedded newlines). */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export const CORRECTIONS_CSV_HEADER = "applicant_id,field,program,value";
export const MAX_CSV_CORRECTIONS = 2000;

/**
 * Parse a corrections file: a header row `applicant_id,field,program,value` (any
 * column order), then one correction per line. Every line is checked; errors name
 * the line. A later line for the same value replaces an earlier one.
 */
export function parseCorrectionsCsv(text: string): { corrections: Correction[]; errors: string[] } {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const errors: string[] = [];
  const header = splitCsvLine(lines[0] ?? "").map((h) => h.toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const [ia, ifield, iprog, ival] = [col("applicant_id"), col("field"), col("program"), col("value")];
  if (ia < 0 || ifield < 0 || ival < 0) return { corrections: [], errors: [`The first line must be the header: ${CORRECTIONS_CSV_HEADER}`] };
  const byKey = new Map<string, Correction>();
  for (let n = 1; n < lines.length; n++) {
    const line = lines[n]!;
    if (!line.trim()) continue;
    const cells = splitCsvLine(line);
    const raw = cells[ival] ?? "";
    const parsed = correctionSchema.safeParse({
      applicantId: cells[ia] ?? "",
      field: (cells[ifield] ?? "").toLowerCase(),
      program: iprog >= 0 && cells[iprog] ? cells[iprog] : null,
      value: raw === "" ? Number.NaN : Number(raw),
    });
    if (!parsed.success) {
      errors.push(`Line ${n + 1}: ${parsed.error.issues.map((i) => (i.path[0] === "value" && i.code !== "custom" ? "the value is not a number" : i.message)).join("; ")}`);
      continue;
    }
    byKey.set(correctionKey(parsed.data), parsed.data);
  }
  const corrections = [...byKey.values()];
  if (corrections.length > MAX_CSV_CORRECTIONS) errors.push(`At most ${MAX_CSV_CORRECTIONS} corrections per file`);
  if (!corrections.length && !errors.length) errors.push("The file has no corrections");
  return { corrections, errors };
}

/**
 * Rows to CSV. Text cells that a spreadsheet would read as a formula (=, +, -, @,
 * tab, CR) are prefixed with an apostrophe.
 */
export function toCsv(rows: readonly (readonly (string | number | null | undefined)[])[]): string {
  const cell = (v: string | number | null | undefined) => {
    if (v == null) return "";
    if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
    const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

// ── Base marks under the rules, with corrections ───────────────────────────────

type Prepared = Correctable & { certificates?: readonly { status?: string | null; certificateMarks?: number | string | null; computerizedMarks?: number | string | null }[] | null };

/**
 * The inputs a run uses: corrected parameters first, then the base-marks formula (when
 * the rules set one), then corrections to marks and status, which win over the formula.
 * `formula` is the compiled formula or null (base marks as imported).
 */
export function effectiveCandidates<T extends Prepared>(
  rows: readonly T[],
  corrections: readonly Correction[],
  formula: { evaluate: (vars: Record<string, number>) => number | null; onMissing: "imported" | "zero" } | null,
): T[] {
  const params = corrections.filter((c) => c.field === "parameter");
  const rest = corrections.filter((c) => c.field !== "parameter");
  const withParams = applyCorrections(rows, params);
  const based = formula
    ? withParams.map((r) => {
        const v = formula.evaluate(formulaVariables(r));
        const baseMarks = v ?? (formula.onMissing === "zero" ? 0 : r.baseMarks);
        return baseMarks === r.baseMarks ? r : { ...r, baseMarks: Math.round(baseMarks * 1e6) / 1e6 };
      })
    : withParams;
  return applyCorrections(based, rest);
}
