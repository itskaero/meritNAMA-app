import "server-only";
import { desc, eq, and } from "drizzle-orm";
import { assertCan, type Session } from "@/lib/auth/roles";
import type { Database } from "@/lib/db/client";
import { roundRoomMessages } from "@/lib/db/schema";
import { listThreads } from "./community";

/*
 * The feed: what happened lately, newest first. It reads the community (questions and
 * answers) and the round-day posts the importer writes into each round's room. Nothing
 * is stored for the feed itself, so it can never disagree with the pages it links to.
 */

export type FeedItem =
  | { type: "round_day"; id: string; at: string; induction: number; roundNo: number; body: string; href: string }
  | { type: "question" | "answered"; id: string; at: string; title: string; excerpt: string; author: string | null; team: boolean; replies: number; helpful: number; topic: string; href: string };

export const FEED_FILTERS = ["all", "rounds", "questions"] as const;
export type FeedFilter = (typeof FEED_FILTERS)[number];

export async function listFeed(db: Database, session: Session | null, opts: { filter?: FeedFilter; limit?: number } = {}): Promise<FeedItem[]> {
  assertCan(session, "portal");
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 60);
  const filter = opts.filter ?? "all";

  const [threads, days] = await Promise.all([
    filter === "rounds" ? Promise.resolve([]) : listThreads(db, session, { limit }),
    filter === "questions"
      ? Promise.resolve([])
      : db
          .select({ id: roundRoomMessages.id, induction: roundRoomMessages.induction, roundNo: roundRoomMessages.roundNo, body: roundRoomMessages.body, createdAt: roundRoomMessages.createdAt })
          .from(roundRoomMessages)
          .where(and(eq(roundRoomMessages.kind, "system"), eq(roundRoomMessages.status, "visible")))
          .orderBy(desc(roundRoomMessages.seq))
          .limit(limit),
  ]);

  const items: FeedItem[] = [
    ...threads
      .filter((t) => t.status === "visible" && !t.duplicateOf)
      .map((t): FeedItem => ({
        type: t.answered ? "answered" : "question",
        id: t.id,
        at: t.lastActivityAt.toISOString(),
        title: t.title,
        excerpt: t.excerpt,
        author: t.author,
        team: t.authorIsTeam,
        replies: t.replies,
        helpful: t.helpful,
        topic: t.topic.label,
        href: `/portal/community/${t.id}`,
      })),
    ...days.map((d): FeedItem => ({
      type: "round_day",
      id: d.id,
      at: d.createdAt.toISOString(),
      induction: d.induction,
      roundNo: d.roundNo,
      body: d.body,
      href: `/portal/history/${d.induction}/rounds/${d.roundNo}`,
    })),
  ];
  return items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, limit);
}
