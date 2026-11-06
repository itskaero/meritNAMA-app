/**
 * Per-preference merit marks, ported from the legacy simulator (`js/sim-core.js`,
 * public repo itskaero/meritnama @ f686206).
 *
 * A candidate's mark for one preference = base marks + a programme bonus. The bonus
 * comes from the certificate that matches the preference's discipline (portal marks,
 * else computerised marks, else the preference's own programme marks), falling back
 * to the candidate's legacy `programMarks[program]`.
 *
 * Pure: no I/O, no globals. Behaviour (including quirks) matches the legacy code and
 * is pinned by the golden tests in tests/engine-golden.test.ts.
 */

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
  /** Parent-institute bonus in the legacy files; also a programme-marks fallback. */
  marks?: number | string | null;
};

export type EngineCandidate = {
  applicantId: string | number;
  /** Marks before any programme bonus (legacy `marksTotal` under the official formula). */
  baseMarks: number;
  /** Legacy per-programme bonus: { FCPS: 5, MS: 3, … }. */
  programMarks?: Record<string, number | string | null | undefined> | null;
  /** Legacy `applied_in`: explicit per-programme application flags. */
  appliedIn?: Record<string, boolean | null | undefined> | null;
  certificates?: Certificate[] | null;
  /** Preferences per programme name, in any order. */
  preferences: Record<string, Preference[] | undefined>;
};

/** Shape of data/induction<n>_specialty_groups.json (only the part used here). */
export type SpecialtyGroups = {
  programs?: Record<string, { groups?: Record<string, { labels?: string[]; specialties?: string[] }> }>;
};

/** Shape of data/induction<n>_certificate_policy.json (only the part used here). */
export type CertificatePolicy = {
  fallback?: { useProgramMarksWhenNoCertificateMatch?: boolean };
};

export type MarksContext = {
  /** normalised programme → normalised speciality label → group id */
  groupIndex: Map<string, Map<string, string>>;
  useProgramMarksWhenNoCertificateMatch: boolean;
};

export function marksContext(opts: { specialtyGroups?: SpecialtyGroups | null; certificatePolicy?: CertificatePolicy | null } = {}): MarksContext {
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
  return {
    groupIndex,
    useProgramMarksWhenNoCertificateMatch: opts.certificatePolicy?.fallback?.useProgramMarksWhenNoCertificateMatch !== false,
  };
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

/** Legacy `programMarks[program]` (any alias); 0 when absent or not a number. */
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

function legacyCertificateStringMatch(ctx: MarksContext, cert: Certificate, program: string, pref: Preference): boolean {
  if (!programMatches(cert.program, program)) return false;
  const prefSpecialty = pref.specialityName || "";
  if (!prefSpecialty) return false;
  const prefGroup = specialtyGroupFor(ctx, program, prefSpecialty);
  const certGroup = specialtyGroupFor(ctx, program, cert.specialty);
  if (prefGroup && certGroup && prefGroup === certGroup) return true;
  return normalizedLookupText(prefSpecialty) === normalizedLookupText(cert.specialty);
}

/** The certificate that earns the bonus for a preference: by discipline id, else by name. */
export function certForPreference(ctx: MarksContext, pref: Preference, certs: Certificate[]): Certificate | null {
  if (!certs.length) return null;
  const disciplineIds = pref.disciplineIds ?? [];
  if (disciplineIds.length) {
    return (
      certs.find(
        (c) =>
          c.disciplineId != null &&
          disciplineIds.includes(c.disciplineId) &&
          (pref.typeId == null || c.typeId == null || c.typeId === pref.typeId),
      ) ?? null
    );
  }
  const prog = pref.typeName ?? "";
  return (
    // Legacy quirk kept: the name match reads `cert.program` only, so a certificate
    // that names its programme in `typeName` alone never matches by name.
    certs.find((c) => programMatches(c.program || c.typeName, prog) && legacyCertificateStringMatch(ctx, c, prog, pref)) ?? null
  );
}

function float(v: unknown): number {
  return Number.parseFloat(String(v));
}

export type BonusSource = "certificateMarks" | "computerizedMarks" | "programMarks" | "legacy" | "zero";

export function programBonus(
  ctx: MarksContext,
  c: EngineCandidate,
  pref: Preference,
  program: string,
): { bonus: number; source: BonusSource; certificate?: Certificate } {
  const legacy = legacyProgramBonus(c, program);
  const legacyResult = { bonus: legacy || 0, source: (legacy ? "legacy" : "zero") as BonusSource };
  if (!program) return legacyResult;
  if (!pref.specialityName && !pref.disciplineIds?.length) return legacyResult;
  const certs = Array.isArray(c.certificates) ? c.certificates : [];
  if (!certs.length) return legacyResult;

  const cert = certForPreference(ctx, pref, certs);
  if (!cert) {
    const use = ctx.useProgramMarksWhenNoCertificateMatch;
    return { bonus: use ? legacy || 0 : 0, source: use && legacy ? "legacy" : "zero" };
  }
  const portal = float(cert.certificateMarks);
  if (Number.isFinite(portal) && portal > 0) return { bonus: portal, source: "certificateMarks", certificate: cert };
  const comp = float(cert.computerizedMarks);
  if (Number.isFinite(comp) && comp > 0) return { bonus: comp, source: "computerizedMarks", certificate: cert };
  const pm = float(pref.programMarks || pref.marks);
  if (Number.isFinite(pm) && pm > 0) return { bonus: pm, source: "programMarks", certificate: cert };
  return legacyResult;
}

/**
 * A candidate's mark in `program`, for one preference when given.
 * `null` when the candidate explicitly did not apply to the programme, or has neither
 * an application flag nor preferences for it.
 */
export function effectiveMark(ctx: MarksContext, c: EngineCandidate, program: string, pref?: Preference): number | null {
  const appliedIn = c.appliedIn ?? {};
  const explicit = hasOwn(appliedIn, program);
  const hasPrefs = (c.preferences[program] ?? []).length > 0;
  const applied = programAliases(program).some((a) => appliedIn[a]);
  if (!applied && (explicit || !hasPrefs)) return null;
  const bonus = pref ? programBonus(ctx, c, pref, program).bonus : legacyProgramBonus(c, program);
  return c.baseMarks + bonus;
}
