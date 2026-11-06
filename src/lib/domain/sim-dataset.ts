import { z } from "zod";

/**
 * Restricted simulation inputs for one induction, as exported by the legacy site:
 *
 *   candidates.json      { "<applicantId>": { applicantId, marksTotal, applied_in, preferences[], …personal fields } }
 *   components.json      { "<applicantId>": { marksTotal, programMarks, … } }        (optional; corrected marks)
 *   certificates.json    { "<applicantId>": [ { disciplineId, typeId, status, certificateMarks, computerizedMarks, … } ] } (optional)
 *   profile_status.json  { statusTypes, entries: [ { applicantId, statusId, statusTypeId } ] } (optional; ProfileStatus.json)
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
export const certificatesFileSchema = z.record(z.string(), z.array(certificateSchema));

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

export type SimCandidate = {
  applicantId: string;
  baseMarks: number;
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

/** Validate the files and reduce them to what the engine needs. Throws a ZodError on bad input. */
export function sanitizeSimDataset(files: { candidates: unknown; components?: unknown; certificates?: unknown; profileStatus?: unknown }): {
  candidates: SimCandidate[];
  summary: SimDatasetSummary;
} {
  const parsed = candidatesFileSchema.parse(files.candidates);
  const list = Array.isArray(parsed) ? parsed : "candidates" in parsed && Array.isArray(parsed.candidates) ? parsed.candidates : Object.values(parsed as Record<string, z.infer<typeof candidateSchema>>);
  const components = files.components == null ? {} : componentsFileSchema.parse(files.components);
  const certificates = files.certificates == null ? {} : certificatesFileSchema.parse(files.certificates);
  const status = files.profileStatus == null ? new Map<string, number>() : effectiveProfileStatus(profileStatusFileSchema.parse(files.profileStatus));

  const seen = new Set<string>();
  const out: SimCandidate[] = [];
  let correctedMarks = 0;
  for (const c of list) {
    const id = String(c.applicantId);
    if (seen.has(id)) throw new z.ZodError([{ code: "custom", path: [id], message: "applicant appears twice", input: undefined }]);
    seen.add(id);
    const comp = components[id];
    // Corrected marks from the components file win, as on the legacy site.
    const baseMarks = comp?.marksTotal ?? c.marksTotal;
    if (comp?.marksTotal != null && comp.marksTotal !== c.marksTotal) correctedMarks++;
    // Per-programme marks: the candidate's, with non-zero component values filling gaps.
    const programMarks = programMarksOf(c.programMarks);
    for (const [k, v] of Object.entries(programMarksOf(comp?.programMarks))) if (v !== 0 && !programMarks[k]) programMarks[k] = v;
    const appliedIn: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(c.applied_in ?? {})) if (v != null) appliedIn[k] = v;
    out.push({
      applicantId: id,
      baseMarks,
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
      profileStatus: status.get(id) ?? null,
      preferences: c.preferences.map((p) => ({
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
    },
  };
}
