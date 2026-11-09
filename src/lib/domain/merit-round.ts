import { z } from "zod";

/**
 * Data contract for a PHF merit-round export (inductions/<n>/merit/round_<r>.json).
 * `Table[0]` describes the cycle; `Table5` holds one row per allocation. Rows carry
 * personal fields (name, relation, PMDC number, email, employment) that this app
 * does not import; the schema only requires what browsing needs and lets the rest
 * pass unread. CNIC and phone are already stripped at the public repo's HEAD.
 */

const cycleSchema = z.looseObject({
  inductionId: z.number().int().min(1).max(999),
  name: z.string().min(1),
  displayName: z.string().min(1),
  startDate: z.string().nullish(),
  endDate: z.string().nullish(),
});

export const meritRowSchema = z.looseObject({
  rowNo: z.number().int().min(1),
  type: z.string().min(1),
  quota: z.string().min(1),
  specialityJobId: z.number().int(),
  speciality: z.string().min(1),
  hospital: z.string().min(1),
  institute: z.string(),
  seats: z.number().int().min(0),
  marks: z.number().min(0),
  applicantId: z.union([z.string().min(1), z.number()]).transform(String),
  preferenceNo: z.number().int().min(0),
  consent: z.string(),
});
export type MeritRow = z.infer<typeof meritRowSchema>;

export const meritRoundFileSchema = z
  .looseObject({
    Table: z.array(cycleSchema).min(1),
    Table5: z.array(meritRowSchema).min(1, "the round has no allocations"),
  })
  .superRefine((f, ctx) => {
    const seen = new Set<number>();
    f.Table5.forEach((r, i) => {
      if (seen.has(r.rowNo)) ctx.addIssue({ code: "custom", path: ["Table5", i, "rowNo"], message: `duplicate rowNo ${r.rowNo}` });
      seen.add(r.rowNo);
    });
  });
export type MeritRoundFile = z.infer<typeof meritRoundFileSchema>;

/** Round number from a file name such as "round_3.json" or "round-12.json". */
export function roundNoFromFilename(filename: string): number | null {
  const m = /round[_ -]?(\d{1,2})\b/i.exec(filename);
  return m ? Number(m[1]) : null;
}

/**
 * Key used to match published names to lookups: lower case, accents and punctuation
 * removed, spaces collapsed. "Family Medicine " and "family-medicine" match.
 */
export function nameKey(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** "2025-10-01T00:00:00" → "2025-10-01" (date only), or null. */
export function isoDay(value: string | null | undefined): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(value ?? "");
  return m ? m[1]! : null;
}

export const CONSENT_STATES = ["Accepted", "Rejected", "Not Avail"] as const;
