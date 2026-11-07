import { z } from "zod";

/**
 * Restricted simulation inputs for one induction. The split format (what the
 * operator's backend writes; field names as on the official portal):
 *
 *   marks.json           [ { applicantId, marksTotal, programMarks?, applied_in?, profileStatus? } ]
 *   preferences.json     [ { applicantId, typeName, typeId?, preferenceNo, quotaName, specialityId, hospitalName,
 *                            disciplineIds?, programMarks?, marks? } ]                 (marks = parent-institute bonus)
 *   certificates.json    { "<applicantId>": [ { disciplineId, typeId, status, certificateMarks, computerizedMarks } ] }
 *                        or [ { applicantId, disciplineId, … } ]                      (optional)
 *
 * marks.json and preferences.json may also be objects keyed by applicant id. The legacy
 * combined export is still accepted instead of marks.json + preferences.json:
 *
 *   candidates.json      { "<applicantId>": { applicantId, marksTotal, applied_in, preferences[], …personal fields } }
 *
 * Optional overrides in either format:
 *   components.json      { "<applicantId>": { marksTotal, programMarks, … } }        (corrected marks)
 *   profile_status.json  { statusTypes, entries: [ { applicantId, statusId, statusTypeId } ] } (ProfileStatus.json;
 *                        wins over a marks row's profileStatus)
 *
 * Only what the simulation engine needs is kept. Names, PMDC numbers, emails, phone
 * numbers, CNICs and remarks are never read into the result, so they cannot be stored.
 */

const num = z.union([z.number(), z.string()]).transform((v) => Number(v)).pipe(z.number().finite());
const optNum = z.union([z.number(), z.string(), z.null()]).optional().transform((v) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
});

const preferenceSchema = z.looseObject({
  specialityId: z.number().int(),
  typeName: z.string().min(1),
  typeId: z.number().int().nullish(),
  hospitalName: z.string().min(1),
  preferenceNo: z.number().int().positive(),
  quotaName: z.string().min(1),
  programMarks: optNum,
  marks: optNum,
  disciplineIds: z.array(z.number().int()).nullish(),
});

const candidateSchema = z.looseObject({
  applicantId: z.union([z.number().int(), z.string().regex(/^\d+$/)]),
  marksTotal: num,
  applied_in: z.record(z.string(), z.boolean().nullish()).nullish(),
  programMarks: z.record(z.string(), z.union([z.number(), z.string(), z.null()])).nullish(),
  preferences: z.array(preferenceSchema),
});

export const candidatesFileSchema = z.union([
  z.record(z.string(), candidateSchema),
  z.array(candidateSchema),
  z.looseObject({ candidates: z.array(candidateSchema) }),
]);

const applicantId = z.union([z.number().int(), z.string().regex(/^\d+$/)]).transform(String);
const programMarksRecord = z.record(z.string(), z.union([z.number(), z.string(), z.null()])).nullish();

const marksRowSchema = z.looseObject({
  applicantId: applicantId.optional(),
  marksTotal: num,
  programMarks: programMarksRecord,
  applied_in: z.record(z.string(), z.boolean().nullish()).nullish(),
  appliedIn: z.record(z.string(), z.boolean().nullish()).nullish(),
  profileStatus: z.number().int().nullish(),
});
/** marks.json: rows, or an object keyed by applicant id. */
export const marksFileSchema = z.union([z.array(marksRowSchema.extend({ applicantId })), z.record(z.string(), marksRowSchema)]);

/** preferences.json: rows with applicantId, or { "<applicantId>": [preference…] }. */
export const preferencesFileSchema = z.union([z.array(preferenceSchema.extend({ applicantId })), z.record(z.string(), z.array(preferenceSchema))]);

export const componentsFileSchema = z.record(
  z.string(),
  z.looseObject({ marksTotal: optNum, programMarks: z.record(z.string(), z.union([z.number(), z.string(), z.null()])).nullish() }),
);

const certificateSchema = z.looseObject({
  disciplineId: z.number().int().nullish(),
  typeId: z.number().int().nullish(),
  typeName: z.string().nullish(),
  program: z.string().nullish(),
  specialty: z.string().nullish(),
  status: z.string().nullish(),
  certificateMarks: optNum,
  computerizedMarks: optNum,
});
export const certificatesFileSchema = z.union([z.record(z.string(), z.array(certificateSchema)), z.array(certificateSchema.extend({ applicantId }))]);

export const profileStatusFileSchema = z.looseObject({
  entries: z.array(z.looseObject({ applicantId: z.union([z.number().int(), z.string().regex(/^\d+$/)]), statusId: z.number().int(), statusTypeId: z.number().int() })),
});

export type SimCertificate = {
  disciplineId: number | null;
  typeId: number | null;
  typeName: string | null;
  program: string | null;
  specialty: string | null;
  status: string | null;
  certificateMarks: number | null;
  computerizedMarks: number | null;
};

export type SimPreference = {
  program: string;
  preferenceNo: number;
  quota: string;
  specialityId: number;
  hospital: string;
  typeId: number | null;
  disciplineIds: number[];
  programMarks: number | null;
  /** Parent-institute bonus. */
  parentMarks: number | null;
};

/**
 * Numeric parameters for base-marks formulas (degree, houseJob, mdcat, …), taken from
 * a marks or components row. Kept: plain numbers between -1000 and 1000 under a name
 * that is not an id, a total or a personal field. Phone numbers, CNICs and PMDC numbers
 * fail both tests, so they cannot be kept even under an unexpected name.
 */
const PERSONAL = /(cnic|phone|mobile|contact|whats|pmdc|email|name|address|father|birth|dob|^age$|^number$|^id$|id$|^applicant)/i;
const NOT_PARAMETERS = new Set(["marksTotal", "programMarks", "profileStatus", "applied_in", "appliedIn", "preferences", "marksTotalBackup"]);
export function numericParameters(row: Record<string, unknown> | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(row ?? {})) {
    if (NOT_PARAMETERS.has(k) || PERSONAL.test(k) || !/^[A-Za-z_][A-Za-z0-9_]{0,40}$/.test(k)) continue;
    if (typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 1000) out[k] = v;
  }
  return out;
}

export type SimCandidate = {
  applicantId: string;
  baseMarks: number;
  /** Numeric parameters for base-marks formulas (see numericParameters). */
  params: Record<string, number>;
  programMarks: Record<string, number>;
  appliedIn: Record<string, boolean>;
  certificates: SimCertificate[];
  profileStatus: number | null;
  preferences: SimPreference[];
};

export type SimDatasetSummary = {
  candidates: number;
  preferences: number;
  withCertificates: number;
  withStatus: number;
  eligible: number;
  correctedMarks: number;
  /** Parameter names available to base-marks formulas, with how many candidates have each. */
  parameters?: Record<string, number>;
  /** Preferences of applicants with no row in the marks file (split format; left out). */
  preferencesWithoutMarks: number;
  /** "split" (marks + preferences files) or "combined" (legacy candidates file). */
  format: "split" | "combined";
};

const programMarksOf = (o: Record<string, unknown> | null | undefined) => {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(o ?? {})) {
    if (v == null || v === "") continue;
    const n = Number(v);
    if (Number.isFinite(n)) out[k] = n;
  }
  return out;
};

/**
 * Effective profile status per applicant: a later status type (e.g. 132 "Amendment
 * Process") overrides an earlier one (131 "Verification : Round 01"), as on the
 * legacy site.
 */
export function effectiveProfileStatus(file: z.infer<typeof profileStatusFileSchema>): Map<string, number> {
  const best = new Map<string, { type: number; status: number }>();
  for (const e of file.entries) {
    const id = String(e.applicantId);
    const seen = best.get(id);
    if (!seen || e.statusTypeId > seen.type) best.set(id, { type: e.statusTypeId, status: e.statusId });
  }
  return new Map([...best].map(([id, v]) => [id, v.status]));
}

type RawCandidate = {
  id: string;
  params: Record<string, number>;
  marksTotal: number;
  programMarks: Record<string, unknown> | null | undefined;
  appliedIn: Record<string, boolean | null | undefined> | null | undefined;
  profileStatus: number | null;
  preferences: z.infer<typeof preferenceSchema>[];
};

const duplicate = (id: string, file: string) => new z.ZodError([{ code: "custom", path: [file, id], message: "applicant appears twice", input: undefined }]);

/** The legacy combined file → raw candidates. */
function fromCombined(file: unknown): RawCandidate[] {
  const parsed = candidatesFileSchema.parse(file);
  const list = Array.isArray(parsed) ? parsed : "candidates" in parsed && Array.isArray(parsed.candidates) ? parsed.candidates : Object.values(parsed as Record<string, z.infer<typeof candidateSchema>>);
  return list.map((c) => ({ id: String(c.applicantId), params: numericParameters(c), marksTotal: c.marksTotal, programMarks: c.programMarks, appliedIn: c.applied_in, profileStatus: null, preferences: c.preferences }));
}

/** marks.json + preferences.json → raw candidates (in the marks file's order). */
function fromSplit(marksFile: unknown, preferencesFile: unknown): { list: RawCandidate[]; orphans: number } {
  const marks = marksFileSchema.parse(marksFile);
  const rows = Array.isArray(marks) ? marks.map((r) => [r.applicantId, r] as const) : Object.entries(marks).map(([k, r]) => [r.applicantId ?? k, r] as const);
  const byId = new Map<string, RawCandidate>();
  for (const [id, r] of rows) {
    if (byId.has(id)) throw duplicate(id, "marks");
    byId.set(id, { id, params: numericParameters(r), marksTotal: r.marksTotal, programMarks: r.programMarks, appliedIn: r.applied_in ?? r.appliedIn, profileStatus: r.profileStatus ?? null, preferences: [] });
  }
  const prefs = preferencesFileSchema.parse(preferencesFile);
  const pairs = Array.isArray(prefs) ? prefs.map((p) => [p.applicantId, p] as const) : Object.entries(prefs).flatMap(([k, ps]) => ps.map((p) => [k, p] as const));
  let orphans = 0;
  for (const [id, p] of pairs) {
    const c = byId.get(id);
    if (c) c.preferences.push(p);
    else orphans++;
  }
  return { list: [...byId.values()], orphans };
}

/**
 * Validate the files and reduce them to what the engine needs. Give either `marks` +
 * `preferences` (split format) or `candidates` (legacy combined). Throws a ZodError
 * (or Error) on bad input.
 */
export function sanitizeSimDataset(files: {
  candidates?: unknown;
  marks?: unknown;
  preferences?: unknown;
  components?: unknown;
  certificates?: unknown;
  profileStatus?: unknown;
}): {
  candidates: SimCandidate[];
  summary: SimDatasetSummary;
} {
  const split = files.marks != null || files.preferences != null;
  if (split && files.candidates != null) throw new Error("Use either marks.json + preferences.json or candidates.json, not both.");
  if (split && (files.marks == null || files.preferences == null)) throw new Error("The split format needs both marks.json and preferences.json.");
  if (!split && files.candidates == null) throw new Error("No marks.json + preferences.json (or legacy candidates.json) to import.");
  const { list, orphans } = split ? fromSplit(files.marks, files.preferences) : { list: fromCombined(files.candidates), orphans: 0 };
  const components = files.components == null ? {} : componentsFileSchema.parse(files.components);
  const certParsed = files.certificates == null ? {} : certificatesFileSchema.parse(files.certificates);
  const certificates: Record<string, z.infer<typeof certificateSchema>[]> = {};
  if (Array.isArray(certParsed)) for (const c of certParsed) (certificates[c.applicantId] ??= []).push(c);
  else Object.assign(certificates, certParsed);
  const status = files.profileStatus == null ? new Map<string, number>() : effectiveProfileStatus(profileStatusFileSchema.parse(files.profileStatus));

  const seen = new Set<string>();
  const out: SimCandidate[] = [];
  let correctedMarks = 0;
  for (const c of list) {
    const id = c.id;
    if (seen.has(id)) throw duplicate(id, "candidates");
    seen.add(id);
    const comp = components[id];
    // Corrected marks from the components file win, as on the legacy site.
    const baseMarks = comp?.marksTotal ?? c.marksTotal;
    if (comp?.marksTotal != null && comp.marksTotal !== c.marksTotal) correctedMarks++;
    // Per-programme marks: the candidate's, with non-zero component values filling gaps.
    const programMarks = programMarksOf(c.programMarks);
    for (const [k, v] of Object.entries(programMarksOf(comp?.programMarks))) if (v !== 0 && !programMarks[k]) programMarks[k] = v;
    const appliedIn: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(c.appliedIn ?? {})) if (v != null) appliedIn[k] = v;
    out.push({
      applicantId: id,
      baseMarks,
      // The components file's values win over the marks file's.
      params: { ...c.params, ...numericParameters(comp) },
      programMarks,
      appliedIn,
      certificates: (certificates[id] ?? []).map((x) => ({
        disciplineId: x.disciplineId ?? null,
        typeId: x.typeId ?? null,
        typeName: x.typeName ?? null,
        program: x.program ?? null,
        specialty: x.specialty ?? null,
        status: x.status ?? null,
        certificateMarks: x.certificateMarks,
        computerizedMarks: x.computerizedMarks,
      })),
      profileStatus: status.get(id) ?? c.profileStatus,
      preferences: c.preferences.slice().sort((a, b) => a.preferenceNo - b.preferenceNo || a.typeName.localeCompare(b.typeName)).map((p) => ({
        program: p.typeName,
        preferenceNo: p.preferenceNo,
        quota: p.quotaName,
        specialityId: p.specialityId,
        hospital: p.hospitalName,
        typeId: p.typeId ?? null,
        disciplineIds: p.disciplineIds ?? [],
        programMarks: p.programMarks,
        parentMarks: p.marks,
      })),
    });
  }
  return {
    candidates: out,
    summary: {
      candidates: out.length,
      preferences: out.reduce((n, c) => n + c.preferences.length, 0),
      withCertificates: out.filter((c) => c.certificates.length).length,
      withStatus: out.filter((c) => c.profileStatus != null).length,
      eligible: out.filter((c) => c.profileStatus === 1).length,
      correctedMarks,
      parameters: out.reduce<Record<string, number>>((acc, c) => {
        for (const k of Object.keys(c.params)) acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      }, {}),
      preferencesWithoutMarks: orphans,
      format: split ? "split" : "combined",
    },
  };
}

// ── Consent replies (one file per round, fetched from the portal) ──────────────

const consentRowSchema = z.looseObject({
  applicantId,
  status: z.string().min(1),
  program: z.string().min(1),
  quota: z.string().min(1),
  preferenceNo: z.number().int().min(0),
  infoTitle: z.string().nullish(),
});
/** consent_round<r>.json: rows (name and marks fields are ignored), or { rows: [...] }-style wrappers with one array. */
export const consentFileSchema = z.union([z.array(consentRowSchema), z.looseObject({ Table5: z.array(consentRowSchema) })]);

export type SimConsentRow = {
  applicantId: string;
  status: string;
  program: string;
  quota: string;
  preferenceNo: number;
  speciality: string | null;
  hospital: string | null;
};

/** "Programme - Quota - Speciality - … - Hospital" → speciality and hospital; null when it has fewer than 4 parts. */
export function seatFromConsentTitle(title: string | null | undefined): { speciality: string; hospital: string } | null {
  const parts = String(title ?? "").split(" - ").map((p) => p.trim());
  if (parts.length < 4) return null;
  return { speciality: parts[2]!, hospital: parts[parts.length - 1]! };
}

export function sanitizeConsent(file: unknown): { rows: SimConsentRow[]; counts: Record<string, number> } {
  const parsed = consentFileSchema.parse(file);
  const list = Array.isArray(parsed) ? parsed : parsed.Table5;
  const counts: Record<string, number> = {};
  const rows = list.map((r) => {
    const status = r.status.trim();
    counts[status] = (counts[status] ?? 0) + 1;
    const seat = seatFromConsentTitle(r.infoTitle);
    return { applicantId: r.applicantId, status, program: r.program.trim(), quota: r.quota.trim(), preferenceNo: r.preferenceNo, speciality: seat?.speciality ?? null, hospital: seat?.hospital ?? null };
  });
  return { rows, counts };
}

/** consent_round<r>.json (also induction21_consent_round3.json) → r, else null. */
export function consentRoundFromName(name: string): number | null {
  const m = /^(?:induction\d{1,3}_)?consent_?round_?(\d{1,2})\.json$/i.exec(name);
  return m ? Number(m[1]) : null;
}
