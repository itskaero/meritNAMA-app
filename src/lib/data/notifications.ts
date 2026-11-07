import "server-only";
import { and, count, desc, eq, inArray, isNull, lt, sql, type SQL } from "drizzle-orm";
import { assertCan, type Session } from "@/lib/auth/roles";
import type { Database } from "@/lib/db/client";
import { discussionThreads, follows, notifications, users } from "@/lib/db/schema";
import { topicSchema } from "@/lib/domain/community";
import { isUuid } from "@/lib/format";
import { UserFacingError } from "@/lib/errors";
import type { Db } from "./shared";
import { ensureUser } from "./users";

/**
 * Follows and the in-app inbox. Members follow an induction, a round, a speciality,
 * a hospital or a thread; replies, accepted answers, new questions and new rounds
 * then land in their inbox (no email). Every read and write is scoped to the
 * signed-in user's own rows.
 */

export const FOLLOW_KINDS = ["induction", "round", "speciality", "hospital", "thread"] as const;
export type FollowKind = (typeof FOLLOW_KINDS)[number];
export type FollowTarget = { kind: FollowKind; key: string };
type NotificationKind = (typeof notifications.kind.enumValues)[number];

export function parseFollowTarget(kind: unknown, key: unknown): FollowTarget {
  if (kind === "thread") {
    if (!isUuid(key)) throw new UserFacingError("That discussion no longer exists.");
    return { kind, key };
  }
  const t = topicSchema.safeParse({ kind, key });
  if (!t.success || t.data.kind === "general") throw new UserFacingError("That cannot be followed.");
  return { kind: t.data.kind, key: t.data.key };
}

export async function isFollowing(db: Db, session: Session | null, target: FollowTarget) {
  assertCan(session, "portal");
  const me = await ensureUser(db, session);
  const [row] = await db.select({ k: follows.key }).from(follows)
    .where(and(eq(follows.userId, me.id), eq(follows.kind, target.kind), eq(follows.key, target.key))).limit(1);
  return Boolean(row);
}

/** Follow or unfollow; returns the new state. */
export async function setFollow(db: Db, session: Session | null, target: FollowTarget, on: boolean) {
  assertCan(session, "portal");
  const me = await ensureUser(db, session);
  if (on) await db.insert(follows).values({ userId: me.id, ...target }).onConflictDoNothing();
  else await db.delete(follows).where(and(eq(follows.userId, me.id), eq(follows.kind, target.kind), eq(follows.key, target.key)));
  return on;
}

/** Follow on someone's behalf (asking or replying follows the thread). */
export async function autoFollow(db: Db, userId: string, target: FollowTarget) {
  await db.insert(follows).values({ userId, ...target }).onConflictDoNothing();
}

const keyList = (keys: string[]) => sql.join(keys.map((k) => sql`${k}`), sql`, `);

/**
 * One notification per follower of any of the targets (deduplicated), except
 * `exceptUserId`. A single insert … select, inside the caller's transaction.
 */
export async function notifyFollowers(
  db: Db,
  targets: FollowTarget[],
  note: { kind: NotificationKind; title: string; href: string },
  exceptUserId?: string | null,
) {
  const byKind = new Map<FollowKind, string[]>();
  for (const t of targets) byKind.set(t.kind, [...(byKind.get(t.kind) ?? []), t.key]);
  if (byKind.size === 0) return;
  const match: SQL[] = [...byKind].map(([kind, keys]) => sql`(f.kind = ${kind} and f.key in (${keyList(keys)}))`);
  await db.execute(sql`
    insert into notifications (user_id, kind, title, href)
    select distinct f.user_id, ${note.kind}::notification_kind, ${note.title.slice(0, 200)}, ${note.href}
    from follows f
    where (${sql.join(match, sql` or `)})
      ${exceptUserId ? sql`and f.user_id <> ${exceptUserId}` : sql``}`);
}

/** A notification for one user (e.g. "your answer was accepted"). */
export async function notifyUser(db: Db, userId: string, note: { kind: NotificationKind; title: string; href: string }) {
  await db.insert(notifications).values({ userId, kind: note.kind, title: note.title.slice(0, 200), href: note.href });
}

export async function unreadCount(db: Db, session: Session | null) {
  assertCan(session, "portal");
  const me = await ensureUser(db, session);
  const [r] = await db.select({ n: count() }).from(notifications).where(and(eq(notifications.userId, me.id), isNull(notifications.readAt)));
  return r?.n ?? 0;
}

export async function listInbox(db: Database, session: Session | null, limit = 50) {
  assertCan(session, "portal");
  const me = await ensureUser(db, session);
  // Housekeeping: read notifications older than 90 days go.
  await db.delete(notifications).where(and(eq(notifications.userId, me.id), lt(notifications.createdAt, new Date(Date.now() - 90 * 86_400_000)), sql`${notifications.readAt} is not null`));
  const [items, followed] = await Promise.all([
    db.select({ id: notifications.id, kind: notifications.kind, title: notifications.title, href: notifications.href, readAt: notifications.readAt, createdAt: notifications.createdAt })
      .from(notifications).where(eq(notifications.userId, me.id)).orderBy(desc(notifications.createdAt)).limit(Math.min(limit, 200)),
    db.select({ kind: follows.kind, key: follows.key, createdAt: follows.createdAt }).from(follows).where(eq(follows.userId, me.id)).orderBy(desc(follows.createdAt)),
  ]);
  const threadIds = followed.filter((f) => f.kind === "thread").map((f) => f.key);
  const titles = threadIds.length
    ? await db.select({ id: discussionThreads.id, title: discussionThreads.title }).from(discussionThreads).where(inArray(discussionThreads.id, threadIds))
    : [];
  return { items, followed, threadTitles: new Map(titles.map((t) => [t.id, t.title])) };
}

/** Mark the user's own notifications read: some ids, or all. */
export async function markRead(db: Db, session: Session | null, ids: number[] | "all") {
  assertCan(session, "portal");
  const me = await ensureUser(db, session);
  const mine = and(eq(notifications.userId, me.id), isNull(notifications.readAt));
  await db.update(notifications).set({ readAt: new Date() }).where(ids === "all" ? mine : and(mine, inArray(notifications.id, ids.length ? ids : [-1])));
}

/** Open one notification: marks it read and returns where it points (own rows only). */
export async function openNotification(db: Db, session: Session | null, id: number): Promise<string | null> {
  assertCan(session, "portal");
  const me = await ensureUser(db, session);
  const [row] = await db.update(notifications).set({ readAt: sql`coalesce(${notifications.readAt}, now())` })
    .where(and(eq(notifications.id, id), eq(notifications.userId, me.id))).returning({ href: notifications.href });
  // Only internal paths are stored, but check anyway before redirecting.
  return row && /^\/(?!\/)/.test(row.href) ? row.href : null;
}

/**
 * After a merit round is imported: one inbox note per person whose shortlist has seats
 * in it, with each seat's closing merit and its change from the previous round. Only
 * people who keep shortlist alerts on. Inside the import's transaction.
 */
export async function notifyShortlists(db: Db, input: { induction: number; roundNo: number; roundId: number }) {
  const rows = (await db.execute(sql`
    with now as (
      select trim(program) as program, trim(quota) as quota, trim(speciality) as speciality, trim(hospital) as hospital, min(marks) as closing
      from merit_allocations where round_id = ${input.roundId}
      group by 1, 2, 3, 4
    ),
    before as (
      select trim(a.program) as program, trim(a.quota) as quota, trim(a.speciality) as speciality, trim(a.hospital) as hospital, min(a.marks) as closing
      from merit_allocations a join merit_rounds r on r.id = a.round_id
      where r.induction_id = ${input.induction} and r.round_no = ${input.roundNo - 1}
      group by 1, 2, 3, 4
    )
    select s.user_id, s.speciality, s.hospital, now.closing, before.closing as previous
    from shortlist_items s
    join users u on u.id = s.user_id and u.shortlist_alerts
    join now on now.program = s.program and now.quota = s.quota and now.speciality = s.speciality and now.hospital = s.hospital
    left join before on before.program = s.program and before.quota = s.quota and before.speciality = s.speciality and before.hospital = s.hospital
    order by s.user_id, s.created_at`)) as unknown as { user_id: string; speciality: string; hospital: string; closing: number; previous: number | null }[];
  const byUser = new Map<string, typeof rows>();
  for (const r of rows) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r]);
  const fmt = (n: number) => Number(n).toFixed(2);
  for (const [userId, seats] of byUser) {
    const parts = seats.slice(0, 3).map((s) => {
      const d = s.previous == null ? null : Number(s.closing) - Number(s.previous);
      return `${s.speciality} · ${s.hospital.split(",")[0]} ${fmt(s.closing)}${d == null || Math.abs(d) < 0.005 ? "" : ` (${d > 0 ? "+" : "−"}${fmt(Math.abs(d))})`}`;
    });
    const more = seats.length > 3 ? ` and ${seats.length - 3} more` : "";
    await notifyUser(db, userId, {
      kind: "shortlist",
      title: `Round ${input.roundNo}, your shortlist: ${parts.join("; ")}${more}`,
      href: `/portal/workspace`,
    });
  }
  return byUser.size;
}

/** Whether the signed-in person gets shortlist alerts. */
export async function shortlistAlerts(db: Db, session: Session | null) {
  assertCan(session, "portal");
  const [u] = await db.select({ on: users.shortlistAlerts }).from(users).where(eq(users.email, session.email)).limit(1);
  return u?.on ?? true;
}

export async function setShortlistAlerts(db: Db, session: Session | null, on: boolean) {
  assertCan(session, "portal");
  const me = await ensureUser(db, session);
  await db.update(users).set({ shortlistAlerts: on }).where(eq(users.id, me.id));
}
