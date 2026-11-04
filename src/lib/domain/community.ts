import { z } from "zod";

/**
 * Rules for community posts. Discussions are visible to every signed-in user, so
 * posts must not carry personal data: text that looks like a CNIC, a Pakistani
 * phone number or an email address is refused with a message saying why.
 */

export const TOPIC_KINDS = ["general", "induction", "round", "speciality", "hospital"] as const;
export type TopicKind = (typeof TOPIC_KINDS)[number];

/** topic_key format per kind: "" | "20" | "20:6" | lookup id. */
const KEY_PATTERN: Record<TopicKind, RegExp> = {
  general: /^$/,
  induction: /^\d{1,3}$/,
  round: /^\d{1,3}:\d{1,2}$/,
  speciality: /^\d{1,6}$/,
  hospital: /^\d{1,6}$/,
};

export const topicSchema = z
  .object({ kind: z.enum(TOPIC_KINDS), key: z.string().default("") })
  .refine((t) => KEY_PATTERN[t.kind].test(t.key), { message: "Unknown discussion topic" });
export type Topic = z.infer<typeof topicSchema>;

const PERSONAL_DATA: [RegExp, string][] = [
  [/\b\d{5}-?\d{7}-?\d\b/, "a CNIC number"],
  [/(?:\+?92[\s-]?|\b0)3\d{2}[\s-]?\d{7}\b/, "a phone number"],
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, "an email address"],
];

/** The kind of personal data found in a text, or null. */
export function findPersonalData(text: string): string | null {
  for (const [re, what] of PERSONAL_DATA) if (re.test(text)) return what;
  return null;
}

const noPersonalData = (v: string, ctx: z.RefinementCtx) => {
  const found = findPersonalData(v);
  if (found) ctx.addIssue({ code: "custom", message: `Remove ${found}: discussions are visible to every member. Share contact details privately.` });
};

const text = (min: number, max: number, what: string) =>
  z
    .string()
    .transform((v) => v.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim())
    .pipe(z.string().min(min, `${what} needs at least ${min} characters`).max(max, `${what} can be at most ${max} characters`))
    .superRefine(noPersonalData);

export const threadInputSchema = z.object({
  topic: topicSchema,
  title: text(8, 140, "The title"),
  body: text(10, 5000, "The message"),
});

export const replyInputSchema = z.object({ body: text(2, 5000, "The reply") });
export const reportInputSchema = z.object({ reason: text(4, 500, "The reason") });

/** Default display name: not derived from the email, so posting does not reveal identity. */
export function defaultDisplayName(seed: string): string {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return `member-${(h >>> 0).toString(16).padStart(8, "0").slice(0, 6)}`;
}

export const displayNameSchema = z
  .string()
  .trim()
  .min(3, "At least 3 characters")
  .max(32, "At most 32 characters")
  .regex(/^[\p{L}\p{N} ._-]+$/u, "Letters, numbers, spaces, dots, dashes and underscores only")
  .superRefine(noPersonalData);
