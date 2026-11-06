/**
 * Per-preference merit marks, shared by the first-round placement and the cascade.
 * First ported from the legacy simulator (`js/sim-core.js`, `js/sim-cascade.js`,
 * public repo itskaero/meritnama @ f686206); now driven by allocation rules.
 *
 * A candidate's mark for one preference =
 *     base marks
 *   + certificate bonus (when the scoring policy counts it): the matching certificate's
 *     value, best or first per the rules, else the candidate's per-programme marks,
 *     capped at the component's max marks
 *   + parent-institute bonus (when counted), capped likewise.
 *
 * Pure: no I/O, no globals. Parity with the legacy code under the LEGACY_* presets
 * is pinned by tests/engine-golden.test.ts.
 */
import type { ResolvedRules } from "./rules";

export type Certificate = {
  disciplineId?: number | null;
  typeId?: number | null;
  /** Programme name; the legacy files use `typeName`, older ones `program`. */
  program?: string | null;
  typeName?: string | null;
  specialty?: string | null;
  status?: string | null;
  certificateMarks?: number | string | null;
  computerizedMarks?: number | string | null;
};

export type Preference = {
  preferenceNo: number;
  quotaName: string;
  specialityName: string;
  hospitalName: string;
  typeName?: string | null;
  typeId?: number | null;
  disciplineIds?: number[] | null;
  programMarks?: number | string | null;
  /** Parent-institute bonus for this preference (legacy field name). */
  marks?: number | string | null;
};

export type EngineCandidate = {
  applicantId: string | number;
  /** Marks before any preference-level bonus (legacy `marksTotal` under the official formula). */
  baseMarks: number;
  /** Per-programme marks from the file: { FCPS: 5, MS: 3, … }. The certificate fallback. */
  programMarks?: Record<string, number | string | null | undefined> | null;
  /** Legacy `applied_in`: explicit per-programme application flags. */
  appliedIn?: Record<string, boolean | null | undefined> | null;
  certificates?: readonly Certificate[] | null;
  /** Profile verification status (1 Accepted, 2 Rejected, 11 Pending); null or absent when unknown. */
  profileStatus?: number | null;
  /** Preferences per programme name, in any order. */
  preferences: Record<string, Preference[] | undefined>;
};

/** Shape of data/induction<n>_specialty_groups.json (only the part used here). */
export type SpecialtyGroups = {
  programs?: Record<string, { groups?: Record<string, { labels?: string[]; specialties?: string[] }> }>;
};

/** Reference data the marks need: speciality groups for matching certificates by name. */
export type MarksContext = {
  /** normalised programme → normalised speciality label → group id */
  groupIndex: Map<string, Map<string, string>>;
};

export function marksContext(opts: { specialtyGroups?: SpecialtyGroups | null } = {}): MarksContext {
  const groupIndex = new Map<string, Map<string, string>>();
  for (const [program, cfg] of Object.entries(opts.specialtyGroups?.programs ?? {})) {
    const labels = new Map<string, string>();
    for (const [groupId, group] of Object.entries(cfg.groups ?? {})) {
      // A label in several groups belongs to the last one, as in the legacy index.
      for (const value of [...(group.labels ?? []), ...(group.specialties ?? [])]) {
        const key = normalizedLookupText(value);
        if (key) labels.set(key, groupId);
      }
    }
    groupIndex.set(normalizeProgramName(program), labels);
  }
  return { groupIndex };
}

export function normalizeProgramName(program: unknown): string {
  return String(program ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

/** "FCPSD" and "FCPS Dentistry" are the same programme. */
export function programAliases(program: unknown): string[] {
  const p = String(program ?? "").trim();
  const n = normalizeProgramName(p);
  if (n === "FCPSD" || n === "FCPS DENTISTRY") return ["FCPS Dentistry", "FCPSD"];
  return p ? [p] : [];
}

export function programMatches(a: unknown, b: unknown): boolean {
  const aa = new Set(programAliases(a).map(normalizeProgramName));
  return programAliases(b).some((alias) => aa.has(normalizeProgramName(alias)));
}

export function normalizedLookupText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\./g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bgynaecology\b/g, "gynecology")
    .replace(/\borthopaedics\b/g, "orthopedic surgery")
    .replace(/\s+/g, " ")
    .trim();
}

function specialtyGroupFor(ctx: MarksContext, program: string, specialty: unknown): string | null {
  const key = normalizedLookupText(specialty);
  if (!key) return null;
  for (const alias of programAliases(program)) {
    const group = ctx.groupIndex.get(normalizeProgramName(alias))?.get(key);
    if (group) return group;
  }
  return key;
}

function hasOwn(o: object, k: string) {
  return Object.prototype.hasOwnProperty.call(o, k);
}

/** Per-programme marks from the file (any alias); 0 when absent or not a number. */
export function legacyProgramBonus(c: EngineCandidate, program: string): number {
  for (const alias of programAliases(program)) {
    const val = c.programMarks?.[alias];
    if (val != null && val !== "") {
      const n = Number(val);
      return Number.isFinite(n) ? n : 0;
    }
  }
  return 0;
}

function nameMatch(ctx: MarksContext, cert: Certificate, program: string, pref: Preference): boolean {
  // Legacy detail kept: the name match reads `cert.program` only.
  if (!programMatches(cert.program, program)) return false;
  const prefSpecialty = pref.specialityName || "";
  if (!prefSpecialty) return false;
  const prefGroup = specialtyGroupFor(ctx, program, prefSpecialty);
  const certGroup = specialtyGroupFor(ctx, program, cert.specialty);
  if (prefGroup && certGroup && prefGroup === certGroup) return true;
  return normalizedLookupText(prefSpecialty) === normalizedLookupText(cert.specialty);
}

/** Certificates that can earn the bonus for a preference, in file order. */
export function matchingCertificates(rules: ResolvedRules, ctx: MarksContext, pref: Preference, certs: readonly Certificate[]): Certificate[] {
  const r = rules.certificateBonus;
  const pass = (c: Certificate) => !r.requirePass || normalizedLookupText(c.status) === "pass";
  const disciplineIds = pref.disciplineIds ?? [];
  if (disciplineIds.length) {
    return certs.filter((c) => {
      if (!pass(c) || c.disciplineId == null || !disciplineIds.includes(c.disciplineId)) return false;
      return r.typeMatch === "strict" ? String(c.typeId) === String(pref.typeId) : pref.typeId == null || c.typeId == null || c.typeId === pref.typeId;
    });
  }
  if (!r.matchByName) return [];
  const prog = pref.typeName ?? "";
  return certs.filter((c) => pass(c) && programMatches(c.program || c.typeName, prog) && nameMatch(ctx, c, prog, pref));
}

function float(v: unknown): number {
  return Number.parseFloat(String(v));
}

export type BonusSource = "certificateMarks" | "computerizedMarks" | "programMarks" | "legacy" | "zero" | "off";

/** A certificate's value: the first positive source the rules list. */
function certificateValue(rules: ResolvedRules, cert: Certificate, pref: Preference): { value: number; source: BonusSource } | null {
  for (const s of rules.certificateBonus.sources) {
    // Legacy detail kept: a preference's programme marks fall back to its `marks` field.
    const raw = s === "certificateMarks" ? cert.certificateMarks : s === "computerizedMarks" ? cert.computerizedMarks : pref.programMarks || pref.marks;
    const v = float(raw);
    if (Number.isFinite(v) && v > 0) return { value: v, source: s === "preferenceProgramMarks" ? "programMarks" : s };
  }
  return null;
}

const capAt = (v: number, cap: number | null) => (cap == null ? v : Math.min(v, cap));

/** The certificate bonus for one preference, and where it came from. */
export function programBonus(
  rules: ResolvedRules,
  ctx: MarksContext,
  c: EngineCandidate,
  pref: Preference,
  program: string,
): { bonus: number; source: BonusSource; certificate?: Certificate } {
  if (!rules.certificate.on) return { bonus: 0, source: "off" };
  const cap = rules.certificate.cap;
  const legacy = rules.certificateBonus.fallback === "programMarks" ? legacyProgramBonus(c, program) : 0;
  const fallback = { bonus: capAt(legacy || 0, cap), source: (legacy ? "legacy" : "zero") as BonusSource };
  if (!program) return fallback;
  if (!pref.specialityName && !pref.disciplineIds?.length) return fallback;
  const certs = Array.isArray(c.certificates) ? c.certificates : [];
  if (!certs.length) return fallback;

  const matches = matchingCertificates(rules, ctx, pref, certs);
  const candidates = rules.certificateBonus.combine === "first" ? matches.slice(0, 1) : matches;
  let best: { value: number; source: BonusSource; certificate: Certificate } | null = null;
  for (const cert of candidates) {
    const v = certificateValue(rules, cert, pref);
    if (v && (!best || v.value > best.value)) best = { ...v, certificate: cert };
  }
  if (!best) return fallback;
  return { bonus: capAt(best.value, cap), source: best.source, certificate: best.certificate };
}

/** The parent-institute bonus for one preference. */
export function parentBonus(rules: ResolvedRules, pref: Preference): number {
  if (!rules.parent.on) return 0;
  return capAt(Number(pref.marks) || 0, rules.parent.cap);
}

/** Base + bonuses for one preference, without the "did they apply" check. */
export function preferenceMark(rules: ResolvedRules, ctx: MarksContext, c: EngineCandidate, program: string, pref: Preference): number {
  return c.baseMarks + programBonus(rules, ctx, c, pref, program).bonus + parentBonus(rules, pref);
}

/**
 * A candidate's mark in `program`, for one preference when given. Without a
 * preference: base + per-programme marks (when the certificate bonus counts).
 * `null` when the candidate explicitly did not apply to the programme, or has neither
 * an application flag nor preferences for it.
 */
export function effectiveMark(rules: ResolvedRules, ctx: MarksContext, c: EngineCandidate, program: string, pref?: Preference): number | null {
  const appliedIn = c.appliedIn ?? {};
  const explicit = hasOwn(appliedIn, program);
  const hasPrefs = (c.preferences[program] ?? []).length > 0;
  const applied = programAliases(program).some((a) => appliedIn[a]);
  if (!applied && (explicit || !hasPrefs)) return null;
  if (pref) return preferenceMark(rules, ctx, c, program, pref);
  const fallback = rules.certificate.on && rules.certificateBonus.fallback === "programMarks" ? legacyProgramBonus(c, program) : 0;
  return c.baseMarks + capAt(fallback, rules.certificate.cap);
}
