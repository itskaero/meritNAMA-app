import { z } from "zod";

/*
 * Chats: group rooms and one-to-one messages. Round rooms stay as they are
 * (src/lib/domain/social.ts) and appear in the chat list beside these. Pure helpers;
 * the data layer (src/lib/data/chats.ts) does the reading and writing.
 */

export const CHAT_MESSAGE_MAX = 600;
export const CHAT_NAME_MAX = 60;
/** Messages a chat shows at first, and the most one request returns. */
export const CHAT_PAGE = 60;
/** Posting limits per person, on top of any room's own rules. */
export const CHAT_RATE = { perTenSeconds: 5, perHour: 200 };
/** Most group chats one person may start in a day. */
export const CHAT_GROUPS_PER_DAY = 3;
/** This many different people reporting a message hides it until a moderator looks. */
export const CHAT_REPORT_HIDE_AT = 3;
export const CHAT_MEMBERS_MAX = 200;

/** Reactions are a short fixed set, so they stay friendly and cannot carry text. */
export const CHAT_REACTIONS = ["👍", "❤️", "😂", "🙏", "😮", "✅"] as const;
export type ChatReaction = (typeof CHAT_REACTIONS)[number];
export const isChatReaction = (s: string): s is ChatReaction => (CHAT_REACTIONS as readonly string[]).includes(s);

export const CHAT_REPORT_REASONS = ["Spam or advertising", "Rude or abusive", "Shares someone's personal details", "Misleading figures"] as const;

export const chatMessageSchema = z
  .string()
  .transform((s) => s.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n").trim())
  .pipe(z.string().min(1, "Write a message first.").max(CHAT_MESSAGE_MAX, `Keep it under ${CHAT_MESSAGE_MAX} characters.`));

export const chatNameSchema = z
  .string()
  .transform((s) => s.replace(/\s+/g, " ").trim())
  .pipe(z.string().min(3, "Give the chat a name of at least 3 characters.").max(CHAT_NAME_MAX, `Keep the name under ${CHAT_NAME_MAX} characters.`));

/** One key for a pair of people, the same whichever of them starts the chat. */
export function dmKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export type DmVerdict = { ok: true } | { ok: false; reason: "self" | "blocked" | "blocked_by" | "dm_off" };

/**
 * Whether `me` may start or continue a one-to-one chat with `them`. Staff may always
 * write to a member (a moderator has to be able to reach someone) unless blocked.
 */
export function dmVerdict(input: { me: string; them: string; iBlocked: boolean; blockedMe: boolean; themDmOpen: boolean; meIsStaff: boolean }): DmVerdict {
  if (input.me === input.them) return { ok: false, reason: "self" };
  if (input.iBlocked) return { ok: false, reason: "blocked" };
  if (input.blockedMe) return { ok: false, reason: "blocked_by" };
  if (!input.themDmOpen && !input.meIsStaff) return { ok: false, reason: "dm_off" };
  return { ok: true };
}

/** Plain words for a refused chat. A blocked person is never told they were blocked. */
export function dmRefusal(reason: Exclude<DmVerdict, { ok: true }>["reason"]): string {
  switch (reason) {
    case "self": return "You cannot message yourself.";
    case "blocked": return "You blocked this person. Unblock them to write again.";
    case "blocked_by":
    case "dm_off": return "This person is not taking messages right now.";
  }
}

/** How many unread messages to show on a badge. */
export const unreadLabel = (n: number) => (n <= 0 ? "" : n > 99 ? "99+" : String(n));

/** Group the reactions on a message: counts per emoji in the fixed order, and which are mine. */
export function tallyReactions(rows: { emoji: string; mine: boolean }[]): { emoji: ChatReaction; count: number; mine: boolean }[] {
  const out: { emoji: ChatReaction; count: number; mine: boolean }[] = [];
  for (const e of CHAT_REACTIONS) {
    const hit = rows.filter((r) => r.emoji === e);
    if (hit.length) out.push({ emoji: e, count: hit.length, mine: hit.some((r) => r.mine) });
  }
  return out;
}
