import { z } from "zod";

/**
 * Data contracts for the public reference data in itskaero/meritnama/data/:
 * the seat matrix, disciplines, specialty groups and CPSP accreditation.
 * Shapes are taken from the real files (tests/fixtures/). Objects are strict so a
 * typo in an admin edit is caught; extend the schema if the public files gain a field.
 */

const id = z.number().int().min(0);
const name = z.string();

// ── Seat matrix: data/induction<n>_seats.json ──────────────────────────────────

export const seatRowSchema = z.strictObject({
  typeId: id,
  typeName: name.min(1),
  quotaId: id,
  quotaName: name.min(1),
  specialityId: id,
  specialityName: name.min(1),
  /** 0 with an empty name means "no institute" in the PHF export. */
  instituteId: id,
  instituteName: name,
  hospitalId: id,
  hospitalName: name.min(1),
  seats: z.number().int().min(0),
});

export type SeatRow = z.infer<typeof seatRowSchema>;

/** The five ids that identify a seat line within an induction. */
export const SEAT_KEY = ["typeId", "quotaId", "specialityId", "instituteId", "hospitalId"] as const;
export const seatKey = (r: Pick<SeatRow, (typeof SEAT_KEY)[number]>) => SEAT_KEY.map((k) => r[k]).join("-");

/** Lookups carried in a seat row: [id field, name field, lookup table]. */
export const SEAT_LOOKUPS = [
  ["typeId", "typeName", "programs"],
  ["quotaId", "quotaName", "quotas"],
  ["specialityId", "specialityName", "specialities"],
  ["instituteId", "instituteName", "institutes"],
  ["hospitalId", "hospitalName", "hospitals"],
] as const;

export type LookupKind = (typeof SEAT_LOOKUPS)[number][2];
export const LOOKUP_KINDS = SEAT_LOOKUPS.map((l) => l[2]) as LookupKind[];

export const seatFileSchema = z.array(seatRowSchema).min(1).superRefine((rows, ctx) => {
  const seen = new Map<string, number>();
  rows.forEach((r, i) => {
    const k = seatKey(r);
    if (seen.has(k)) ctx.addIssue({ code: "custom", path: [i], message: `duplicate seat line (same ids as row ${seen.get(k)})` });
    else seen.set(k, i);
  });
  for (const [idField, nameField] of SEAT_LOOKUPS) {
    const names = new Map<number, string>();
    rows.forEach((r, i) => {
      const prev = names.get(r[idField]);
      if (prev !== undefined && prev !== r[nameField]) {
        ctx.addIssue({ code: "custom", path: [i, nameField], message: `${idField} ${r[idField]} is "${prev}" elsewhere in the file` });
      } else names.set(r[idField], r[nameField]);
    });
  }
});

// ── Disciplines: data/disciplineFullData.json ─────────────────────────────────

export const disciplinesFileSchema = z
  .array(
    z.strictObject({
      programs: z.array(z.strictObject({ name: name.min(1), typeId: id })),
      name: name.min(1),
      disciplineId: id,
      specialities: z.array(z.strictObject({ specialityName: name.min(1), specialityId: id })),
    }),
  )
  .min(1)
  .superRefine((rows, ctx) => {
    const ids = rows.map((r) => r.disciplineId);
    ids.forEach((d, i) => {
      if (ids.indexOf(d) !== i) ctx.addIssue({ code: "custom", path: [i, "disciplineId"], message: `duplicate disciplineId ${d}` });
    });
  });

// ── Specialty groups: data/induction<n>_specialty_groups.json ─────────────────

const groupSchema = z.strictObject({
  disciplineId: id,
  labels: z.array(name.min(1)),
  specialties: z.array(name.min(1)),
  specialtyIds: z.array(id),
});

export const specialtyGroupsFileSchema = z
  .strictObject({
    version: name.min(1),
    disciplineIndex: z.record(
      z.string().regex(/^\d+$/),
      z.strictObject({ program: name.min(1), group: name.min(1), labels: z.array(name.min(1)), programs: z.array(name.min(1)).optional() }),
    ),
    programs: z.record(name.min(1), z.strictObject({ groups: z.record(name.min(1), groupSchema) })),
    specialtyAliases: z.record(name.min(1), name.min(1)),
  })
  .superRefine((f, ctx) => {
    for (const [program, { groups }] of Object.entries(f.programs)) {
      for (const [slug, g] of Object.entries(groups)) {
        if (!(String(g.disciplineId) in f.disciplineIndex)) {
          ctx.addIssue({
            code: "custom",
            path: ["programs", program, "groups", slug, "disciplineId"],
            message: `discipline ${g.disciplineId} is not in disciplineIndex`,
          });
        }
      }
    }
  });

// ── CPSP accreditation: data/cpsp_accreditation.json ──────────────────────────

export const cpspAccreditationFileSchema = z
  .array(
    z.strictObject({
      hospital: name.min(1),
      city: name,
      programs: z.array(
        z.strictObject({
          speciality: name.min(1),
          unit: name,
          type: name.min(1),
          /** dd-mm-yyyy as published by CPSP. */
          since: z.string().regex(/^\d{2}-\d{2}-\d{4}$/, "date like 22-05-2017"),
        }),
      ),
    }),
  )
  .min(1);

// ── Registry of document datasets ─────────────────────────────────────────────

export const DOCUMENT_KINDS = {
  disciplines: {
    label: "Disciplines",
    file: "disciplineFullData.json",
    perInduction: false,
    schema: disciplinesFileSchema,
    description: "Discipline → programmes and specialities, as the public site's preference filters use them.",
  },
  specialty_groups: {
    label: "Specialty groups",
    file: "induction<n>_specialty_groups.json",
    perInduction: true,
    schema: specialtyGroupsFileSchema,
    description: "Programme groups, discipline index and specialty name aliases for one induction.",
  },
  cpsp_accreditation: {
    label: "CPSP accreditation",
    file: "cpsp_accreditation.json",
    perInduction: false,
    schema: cpspAccreditationFileSchema,
    description: "Accredited programmes per hospital, as published by CPSP. Hospitals are matched by name only.",
  },
} as const;

export type DocumentKind = keyof typeof DOCUMENT_KINDS;
export const documentKindSchema = z.enum(Object.keys(DOCUMENT_KINDS) as [DocumentKind, ...DocumentKind[]]);

/** Short human summary of a document, for status cards. */
export function summarizeDocument(kind: DocumentKind, data: unknown): string {
  switch (kind) {
    case "disciplines": {
      const d = data as z.infer<typeof disciplinesFileSchema>;
      return `${d.length} disciplines, ${d.reduce((s, x) => s + x.specialities.length, 0)} specialities`;
    }
    case "specialty_groups": {
      const g = data as z.infer<typeof specialtyGroupsFileSchema>;
      const groups = Object.values(g.programs).reduce((s, p) => s + Object.keys(p.groups).length, 0);
      return `${Object.keys(g.programs).length} programmes, ${groups} groups, ${Object.keys(g.specialtyAliases).length} aliases`;
    }
    case "cpsp_accreditation": {
      const c = data as z.infer<typeof cpspAccreditationFileSchema>;
      return `${c.length} hospitals, ${c.reduce((s, h) => s + h.programs.length, 0)} accredited programmes`;
    }
  }
}
