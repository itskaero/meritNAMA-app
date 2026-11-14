import { z } from "zod";

/**
 * The notification bar: at most three short notices at the top of every page. Team posts
 * come first, then automatic ones (the next PHF deadline, a new official round, a new
 * estimate). Pure rules; src/lib/data/announcements.ts reads and writes.
 */

export type NoticeTone = "info" | "warning" | "highlight";
export type Notice = { id: string; text: string; href: string | null; tone: NoticeTone; auto: boolean };

export const MAX_NOTICES = 3;
const DAY = 86_400_000;
/** A PHF step shows when it closes within this many days. */
export const DEADLINE_DAYS = 7;
export const NEW_ROUND_HOURS = 72;
export const NEW_ESTIMATE_HOURS = 48;

const pkDay = (d: Date) => d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Karachi" });

/** The PHF step that closes soonest, among those open now and closing within a week. */
export function deadlineNotice(induction: number, steps: { stepId: number; title: string; startsAt: Date | null; endsAt: Date | null }[], now: Date): Notice | null {
  const open = steps
    .filter((s) => s.endsAt && s.endsAt.getTime() >= now.getTime() && s.endsAt.getTime() - now.getTime() <= DEADLINE_DAYS * DAY && (!s.startsAt || s.startsAt.getTime() <= now.getTime()))
    .sort((a, b) => a.endsAt!.getTime() - b.endsAt!.getTime());
  const s = open[0];
  if (!s) return null;
  const sameDay = pkDay(s.endsAt!) === pkDay(now);
  return { id: `deadline:${induction}:${s.stepId}`, text: `${s.title.replace(/\s*-\s*/g, " · ")} closes ${sameDay ? "today" : pkDay(s.endsAt!)}.`, href: "/portal/calendar", tone: "warning", auto: true };
}

export function roundNotice(r: { induction: number; roundNo: number; importedAt: Date } | null, now: Date): Notice | null {
  if (!r || now.getTime() - r.importedAt.getTime() > NEW_ROUND_HOURS * 3_600_000) return null;
  return { id: `round:${r.induction}:${r.roundNo}`, text: `Round ${r.roundNo} merit list is out (induction ${r.induction}).`, href: `/portal/history/${r.induction}/rounds/${r.roundNo}`, tone: "highlight", auto: true };
}

export function estimateNotice(e: { id: string; roundNo: number; publishedAt: Date; official: boolean } | null, now: Date): Notice | null {
  if (!e || e.official || now.getTime() - e.publishedAt.getTime() > NEW_ESTIMATE_HOURS * 3_600_000) return null;
  return { id: `estimate:${e.id}`, text: `Estimated round ${e.roundNo} is out. Not official: see where you might move.`, href: `/portal/estimates?run=${e.id}`, tone: "highlight", auto: true };
}

/** Team posts first, then the automatic ones, three at most. */
export function pickNotices(team: Notice[], auto: (Notice | null)[]): Notice[] {
  return [...team, ...auto.filter((n): n is Notice => n !== null)].slice(0, MAX_NOTICES);
}

export const noticeInputSchema = z.object({
  text: z.string().trim().min(4, "Write the notice.").max(160, "Keep it to one line (160 characters)."),
  href: z.string().trim().max(300).optional().transform((v) => v || null)
    .refine((v) => v == null || /^\/[A-Za-z0-9/_?=&.%#-]*$/.test(v) || /^https:\/\//.test(v), "A link starts with / (a page here) or https://."),
  tone: z.enum(["info", "warning", "highlight"]).default("info"),
  audience: z.enum(["all", "members"]).default("all"),
  days: z.number().int().min(1, "Show it for at least a day.").max(60, "60 days at most."),
});
