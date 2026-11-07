import "server-only";
import { desc, eq } from "drizzle-orm";
import { assertCan, can, type Session } from "@/lib/auth/roles";
import type { Database } from "@/lib/db/client";
import { discussionThreads, meritRounds, stagedChanges } from "@/lib/db/schema";

export type NewsItem = { at: Date; text: string; href: string };

/**
 * The newest events for the sidebar's "What's new": imported merit rounds and new
 * discussions for everyone; published changes for staff. Newest first.
 */
export async function whatsNew(db: Database, session: Session, limit = 3): Promise<NewsItem[]> {
  assertCan(session, "portal");
  const [rounds, threads, changes] = await Promise.all([
    db.select({ ind: meritRounds.inductionId, r: meritRounds.roundNo, at: meritRounds.importedAt }).from(meritRounds).orderBy(desc(meritRounds.importedAt)).limit(limit),
    db.select({ id: discussionThreads.id, title: discussionThreads.title, at: discussionThreads.createdAt }).from(discussionThreads).where(eq(discussionThreads.status, "visible")).orderBy(desc(discussionThreads.createdAt)).limit(limit),
    can(session, "staff")
      ? db.select({ id: stagedChanges.id, title: stagedChanges.title, at: stagedChanges.decidedAt }).from(stagedChanges).where(eq(stagedChanges.status, "published")).orderBy(desc(stagedChanges.decidedAt)).limit(limit)
      : Promise.resolve([]),
  ]);
  const items: NewsItem[] = [
    ...rounds.map((x) => ({ at: x.at, text: `Induction ${x.ind}, round ${x.r} merit list`, href: `/portal/history/${x.ind}/rounds/${x.r}` })),
    ...threads.map((x) => ({ at: x.at, text: `Discussion: ${x.title}`, href: `/portal/community/${x.id}` })),
    ...changes.filter((x) => x.at).map((x) => ({ at: x.at!, text: `Published: ${x.title}`, href: `/admin/changes/${x.id}` })),
  ];
  return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}
