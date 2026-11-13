import { z } from "zod";

/**
 * Data contract for a PHF merit-round export (inductions/<n>/merit/round_<r>.json).
 * `Table[0]` describes the cycle; `Table5` holds one row per allocation. Of the personal
 * fields PHF publishes, only the name and PMDC number are kept (they are on the public
 * merit list and let people find each other). Relation, email, phone, CNIC and
 * employment are never imported; the schema lets them pass unread.
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
  name: z.string().nullish(),
  pmdcNo: z.union([z.string(), z.number()]).nullish().transform((v) => (v == null ? v : String(v))),
});

/** Name as published, tidied: trimmed, inner spaces collapsed; empty becomes null. */
export function cleanName(v: string | null | undefined): string | null {
  const s = (v ?? "").replace(/\s+/g, " ").trim();
  return s ? s.slice(0, 120) : null;
}

/** PMDC number as published, upper case without spaces ("97937-P"); empty becomes null. */
export function cleanPmdc(v: string | null | undefined): string | null {
  const s = (v ?? "").replace(/\s+/g, "").toUpperCase();
  return s ? s.slice(0, 20) : null;
}

/** What a search box holds: an applicant id (digits), a PMDC number (digits and a letter, e.g. 97937-P) or a name. */
export function classifyQuery(q: string): { kind: "id" | "pmdc" | "name"; value: string } | null {
  const s = q.trim();
  if (!s) return null;
  if (/^\d{1,8}$/.test(s)) return { kind: "id", value: s };
  if (/^\d{3,7}\s*-?\s*[A-Za-z]{1,2}$/.test(s)) return { kind: "pmdc", value: cleanPmdc(s.replace(/^(\d+)\s*-?\s*/, "$1-"))! };
  if (s.length >= 2) return { kind: "name", value: s.replace(/\s+/g, " ").slice(0, 60) };
  return null;
}
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
