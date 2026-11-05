import "server-only";
import { and, desc, eq, gt, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { assertCan, can, type Session } from "@/lib/auth/roles";
import type { Database } from "@/lib/db/client";
import {
  discussionPosts,
  discussionReports,
  discussionThreads,
  discussionVotes,
  hospitals,
  specialities,
  users,
  candidateLinks,
} from "@/lib/db/schema";
import {
  displayNameSchema,
  replyInputSchema,
  reportInputSchema,
  snippetSchema,
  storedSnippet,
  threadInputSchema,
  type Snippet,
  type ThreadFilter,
  topicSchema,
  type Topic,
  type TopicKind,
} from "@/lib/domain/community";
import { UserFacingError } from "@/lib/errors";
import { requireReason, writeAudit, type Db } from "./shared";
import { mayPost } from "./candidates";
import { autoFollow, isFollowing, notifyFollowers, notifyUser } from "./notifications";
import { assertSnippetExists, snippetFigures } from "./snippets";
import { ensureUser } from "./users";

/**
 * Community discussions. Any signed-in user reads and posts; admins moderate.
 * Members appear by display name only; emails never leave this module.
 */

const RATE = { perMinute: 5, perHour: 40 };

export async function getMyProfile(db: Database, session: Session | null) {
  assertCan(session, "portal");
  return ensureUser(db, session);
}

export async function setDisplayName(db: Database, session: Session | null, name: string) {
  assertCan(session, "portal");
  const displayName = displayNameSchema.parse(name);
  const me = await ensureUser(db, session);
  const [taken] = await db.select({ id: users.id }).from(users).where(and(sql`lower(${users.displayName}) = lower(${displayName})`, sql`${users.id} <> ${me.id}`)).limit(1);
  if (taken) throw new UserFacingError("That name is taken. Try another.");
  await db.update(users).set({ displayName }).where(eq(users.id, me.id));
  return displayName;
}

async function checkRate(db: Db, userId: string) {
  const since = (s: number) => new Date(Date.now() - s * 1000);
  const count = async (s: number) => {
    const [[t], [p]] = await Promise.all([
      db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(discussionThreads).where(and(eq(discussionThreads.authorId, userId), gt(discussionThreads.createdAt, since(s)))),
      db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(discussionPosts).where(and(eq(discussionPosts.authorId, userId), gt(discussionPosts.createdAt, since(s)))),
    ]);
    return (t?.n ?? 0) + (p?.n ?? 0);
  };
  if ((await count(60)) >= RATE.perMinute) throw new UserFacingError("You are posting quickly. Wait a minute and try again.");
  if ((await count(3600)) >= RATE.perHour) throw new UserFacingError("You have reached the hourly posting limit. Try again later.");
}

// ── Topics ─────────────────────────────────────────────────────────────────────

export type TopicInfo = { kind: TopicKind; key: string; label: string; href: string | null };

/** Human labels and links for topics, resolved in one pass. */
export async function describeTopics(db: Database, topics: Topic[]): Promise<Map<string, TopicInfo>> {
  const ids = (k: TopicKind) => [...new Set(topics.filter((t) => t.kind === k).map((t) => Number(t.key)))];
  const [specs, hosps] = await Promise.all([
    ids("speciality").length ? db.select({ id: specialities.id, name: specialities.name }).from(specialities).where(inArray(specialities.id, ids("speciality"))) : [],
    ids("hospital").length ? db.select({ id: hospitals.id, name: hospitals.name }).from(hospitals).where(inArray(hospitals.id, ids("hospital"))) : [],
  ]);
  const sName = new Map(specs.map((s) => [s.id, s.name])), hName = new Map(hosps.map((h) => [h.id, h.name]));
  const out = new Map<string, TopicInfo>();
  for (const t of topics) {
    const k = `${t.kind}:${t.key}`;
    if (out.has(k)) continue;
    let info: TopicInfo;
    switch (t.kind) {
      case "general": info = { ...t, label: "General", href: null }; break;
      case "induction": info = { ...t, label: `Induction ${t.key}`, href: `/portal/history/${t.key}` }; break;
      case "round": { const [i, r] = t.key.split(":"); info = { ...t, label: `Induction ${i} · round ${r}`, href: `/portal/history/${i}/rounds/${r}` }; break; }
      case "speciality": info = { ...t, label: sName.get(Number(t.key)) ?? "Unknown speciality", href: `/portal/explore/specialities/${t.key}` }; break;
      case "hospital": info = { ...t, label: hName.get(Number(t.key)) ?? "Unknown hospital", href: `/portal/explore/hospitals/${t.key}` }; break;
    }
    out.set(k, info);
  }
  return out;
}

// ── Reading ────────────────────────────────────────────────────────────────────

const voteCount = (kind: "thread" | "post", id: typeof discussionThreads.id | typeof discussionPosts.id) =>
  sql<number>`(select count(*) from ${discussionVotes} v where v.target_kind = ${kind} and v.target_id = ${id})`.mapWith(Number);

/** The author holds a verified candidate record (shown as a "Verified" badge). */
const authorVerified = sql<boolean>`exists (select 1 from ${candidateLinks} l where l.user_id = ${users.id} and l.status = 'verified')`;

const POSTING_LOCKED = "Posting opens once your account is linked to your merit record. Verify it on your profile; reading stays open to everyone.";

export async function listThreads(
  db: Database,
  session: Session | null,
  opts: { topic?: Topic; sort?: "active" | "helpful"; filter?: ThreadFilter; limit?: number } = {},
) {
  assertCan(session, "portal");
  const isAdmin = can(session, "community.moderate");
  const topic = opts.topic ? topicSchema.parse(opts.topic) : null;
  const helpful = voteCount("thread", discussionThreads.id);
  const rows = await db
    .select({
      id: discussionThreads.id,
      topicKind: discussionThreads.topicKind,
      topicKey: discussionThreads.topicKey,
      title: discussionThreads.title,
      excerpt: sql<string>`left(${discussionThreads.body}, 220)`,
      author: users.displayName,
      authorIsTeam: sql<boolean>`${users.role} <> 'candidate'`,
      authorVerified,
      status: discussionThreads.status,
      locked: discussionThreads.locked,
      pinned: discussionThreads.pinned,
      replies: discussionThreads.replyCount,
      helpful,
      answered: sql<boolean>`${discussionThreads.acceptedPostId} is not null`,
      duplicateOf: discussionThreads.duplicateOf,
      hasSnippet: sql<boolean>`${discussionThreads.snippet} is not null`,
      createdAt: discussionThreads.createdAt,
      lastActivityAt: discussionThreads.lastActivityAt,
    })
    .from(discussionThreads)
    .innerJoin(users, eq(users.id, discussionThreads.authorId))
    .where(and(
      isAdmin ? undefined : eq(discussionThreads.status, "visible"),
      topic ? and(eq(discussionThreads.topicKind, topic.kind), eq(discussionThreads.topicKey, topic.key)) : undefined,
      opts.filter === "answered" ? isNotNull(discussionThreads.acceptedPostId) : opts.filter === "unanswered" ? and(isNull(discussionThreads.acceptedPostId), isNull(discussionThreads.duplicateOf)) : undefined,
    ))
    // Pinned first, then answered questions (as decided), then the chosen order. Duplicates sink.
    .orderBy(
      desc(discussionThreads.pinned),
      sql`${discussionThreads.duplicateOf} is not null`,
      desc(sql`${discussionThreads.acceptedPostId} is not null`),
      opts.sort === "helpful" ? desc(helpful) : desc(discussionThreads.lastActivityAt),
      desc(discussionThreads.createdAt),
    )
    .limit(Math.min(opts.limit ?? 50, 100));
  const topics = await describeTopics(db, rows.map((r) => ({ kind: r.topicKind, key: r.topicKey })));
  return rows.map((r) => ({ ...r, topic: topics.get(`${r.topicKind}:${r.topicKey}`)! }));
}

export async function getThread(db: Database, session: Session | null, id: string) {
  assertCan(session, "portal");
  const isAdmin = can(session, "community.moderate");
  const me = await ensureUser(db, session);
  const [t] = await db
    .select({
      id: discussionThreads.id,
      topicKind: discussionThreads.topicKind,
      topicKey: discussionThreads.topicKey,
      title: discussionThreads.title,
      body: discussionThreads.body,
      author: users.displayName,
      authorIsTeam: sql<boolean>`${users.role} <> 'candidate'`,
      authorVerified,
      mine: sql<boolean>`${discussionThreads.authorId} = ${me.id}`,
      status: discussionThreads.status,
      locked: discussionThreads.locked,
      pinned: discussionThreads.pinned,
      acceptedPostId: discussionThreads.acceptedPostId,
      duplicateOf: discussionThreads.duplicateOf,
      snippet: discussionThreads.snippet,
      helpful: voteCount("thread", discussionThreads.id),
      voted: sql<boolean>`exists (select 1 from ${discussionVotes} v where v.target_kind = 'thread' and v.target_id = ${discussionThreads.id} and v.user_id = ${me.id})`,
      createdAt: discussionThreads.createdAt,
    })
    .from(discussionThreads)
    .innerJoin(users, eq(users.id, discussionThreads.authorId))
    .where(eq(discussionThreads.id, id))
    .limit(1);
  if (!t || (t.status === "hidden" && !isAdmin)) return null;
  const posts = await db
    .select({
      id: discussionPosts.id,
      body: discussionPosts.body,
      author: users.displayName,
      authorIsTeam: sql<boolean>`${users.role} <> 'candidate'`,
      authorVerified,
      mine: sql<boolean>`${discussionPosts.authorId} = ${me.id}`,
      status: discussionPosts.status,
      snippet: discussionPosts.snippet,
      helpful: voteCount("post", discussionPosts.id),
      voted: sql<boolean>`exists (select 1 from ${discussionVotes} v where v.target_kind = 'post' and v.target_id = ${discussionPosts.id} and v.user_id = ${me.id})`,
      createdAt: discussionPosts.createdAt,
    })
    .from(discussionPosts)
    .innerJoin(users, eq(users.id, discussionPosts.authorId))
    .where(and(eq(discussionPosts.threadId, id), isAdmin ? undefined : eq(discussionPosts.status, "visible")))
    .orderBy(discussionPosts.createdAt);
  const topic = (await describeTopics(db, [{ kind: t.topicKind, key: t.topicKey }])).get(`${t.topicKind}:${t.topicKey}`)!;
  // The accepted answer leads; the rest stay in order.
  const ordered = [...posts.filter((p) => p.id === t.acceptedPostId), ...posts.filter((p) => p.id !== t.acceptedPostId)];
  const [original] = t.duplicateOf
    ? await db.select({ id: discussionThreads.id, title: discussionThreads.title }).from(discussionThreads).where(eq(discussionThreads.id, t.duplicateOf)).limit(1)
    : [];
  const snippets = [storedSnippet(t.snippet), ...posts.map((p) => storedSnippet(p.snippet))].filter((x): x is Snippet => Boolean(x));
  return {
    thread: { ...t, snippet: storedSnippet(t.snippet) },
    posts: ordered.map((p) => ({ ...p, snippet: storedSnippet(p.snippet), accepted: p.id === t.acceptedPostId })),
    topic,
    original: original ?? null,
    figures: await snippetFigures(db, snippets),
    me: {
      displayName: me.displayName,
      mayPost: await mayPost(db, session),
      canAccept: t.mine || isAdmin,
      following: await isFollowing(db, session, { kind: "thread", key: t.id }),
    },
  };
}

// ── Writing ────────────────────────────────────────────────────────────────────

export async function createThread(db: Database, session: Session | null, input: { topic: Topic; title: string; body: string; snippet?: Snippet | null }) {
  assertCan(session, "portal");
  const v = threadInputSchema.parse(input);
  const snippet = input.snippet ? snippetSchema.parse(input.snippet) : null;
  return db.transaction(async (tx) => {
    const me = await ensureUser(tx, session);
    if (!(await mayPost(tx, session))) throw new UserFacingError(POSTING_LOCKED);
    await checkRate(tx, me.id);
    if (snippet) await assertSnippetExists(tx, snippet);
    const [row] = await tx
      .insert(discussionThreads)
      .values({ topicKind: v.topic.kind, topicKey: v.topic.key, title: v.title, body: v.body, authorId: me.id, snippet })
      .returning({ id: discussionThreads.id });
    await autoFollow(tx, me.id, { kind: "thread", key: row!.id });
    if (v.topic.kind !== "general") {
      await notifyFollowers(tx, [{ kind: v.topic.kind, key: v.topic.key }], { kind: "new_thread", title: `New question: ${v.title}`, href: `/portal/community/${row!.id}` }, me.id);
    }
    return row!;
  });
}

export async function replyToThread(db: Database, session: Session | null, input: { threadId: string; body: string; snippet?: Snippet | null }) {
  assertCan(session, "portal");
  const v = replyInputSchema.parse(input);
  const snippet = input.snippet ? snippetSchema.parse(input.snippet) : null;
  return db.transaction(async (tx) => {
    const me = await ensureUser(tx, session);
    if (!(await mayPost(tx, session))) throw new UserFacingError(POSTING_LOCKED);
    const [t] = await tx.select({ status: discussionThreads.status, locked: discussionThreads.locked, title: discussionThreads.title }).from(discussionThreads).where(eq(discussionThreads.id, input.threadId)).limit(1);
    if (!t || t.status === "hidden") throw new UserFacingError("This discussion is no longer available.");
    if (t.locked && !can(session, "community.moderate")) throw new UserFacingError("This discussion is locked; new replies are closed.");
    await checkRate(tx, me.id);
    if (snippet) await assertSnippetExists(tx, snippet);
    const [row] = await tx.insert(discussionPosts).values({ threadId: input.threadId, authorId: me.id, body: v.body, snippet }).returning({ id: discussionPosts.id });
    await notifyFollowers(tx, [{ kind: "thread", key: input.threadId }], { kind: "answer", title: `New answer: ${t.title}`, href: `/portal/community/${input.threadId}` }, me.id);
    await autoFollow(tx, me.id, { kind: "thread", key: input.threadId });
    await tx
      .update(discussionThreads)
      .set({ replyCount: sql`${discussionThreads.replyCount} + 1`, lastActivityAt: new Date() })
      .where(eq(discussionThreads.id, input.threadId));
    return row!;
  });
}

/**
 * Accept a reply as the answer (the asker or a moderator). Accepting the accepted
 * reply again clears it. Its author is told.
 */
export async function acceptAnswer(db: Database, session: Session | null, input: { threadId: string; postId: string }) {
  assertCan(session, "portal");
  const isMod = can(session, "community.moderate");
  return db.transaction(async (tx) => {
    const me = await ensureUser(tx, session);
    const [t] = await tx.select({ authorId: discussionThreads.authorId, accepted: discussionThreads.acceptedPostId, title: discussionThreads.title, status: discussionThreads.status })
      .from(discussionThreads).where(eq(discussionThreads.id, input.threadId)).for("update").limit(1);
    if (!t || (t.status === "hidden" && !isMod)) throw new UserFacingError("This discussion is no longer available.");
    if (t.authorId !== me.id && !isMod) throw new UserFacingError("Only the person who asked, or a moderator, can accept an answer.");
    const [p] = await tx.select({ authorId: discussionPosts.authorId, status: discussionPosts.status }).from(discussionPosts)
      .where(and(eq(discussionPosts.id, input.postId), eq(discussionPosts.threadId, input.threadId))).limit(1);
    if (!p || p.status !== "visible") throw new UserFacingError("That reply is not available.");
    const clearing = t.accepted === input.postId;
    await tx.update(discussionThreads)
      .set(clearing ? { acceptedPostId: null, answeredAt: null } : { acceptedPostId: input.postId, answeredAt: new Date() })
      .where(eq(discussionThreads.id, input.threadId));
    if (!clearing && p.authorId !== me.id) {
      await notifyUser(tx, p.authorId, { kind: "accepted", title: `Your answer was accepted: ${t.title}`, href: `/portal/community/${input.threadId}` });
    }
    if (t.authorId !== me.id) {
      await writeAudit(tx, session.email, { action: clearing ? "community.unaccept" : "community.accept", entityType: "discussion_thread", entityId: input.threadId, after: { postId: clearing ? null : input.postId }, reason: "Moderator chose the answer" });
    }
    return { accepted: !clearing };
  });
}

/** Close a question as a duplicate of another (moderators). Locks it and links the original. */
export async function markDuplicate(db: Database, session: Session | null, input: { threadId: string; originalId: string; reason: string }) {
  assertCan(session, "community.moderate");
  const reason = requireReason(input.reason, "moderation");
  if (input.threadId === input.originalId) throw new UserFacingError("A question cannot duplicate itself.");
  return db.transaction(async (tx) => {
    const [orig] = await tx.select({ id: discussionThreads.id, dup: discussionThreads.duplicateOf, status: discussionThreads.status }).from(discussionThreads).where(eq(discussionThreads.id, input.originalId)).limit(1);
    if (!orig || orig.status === "hidden") throw new UserFacingError("The original question was not found.");
    if (orig.dup) throw new UserFacingError("That question is itself a duplicate; link to its original instead.");
    const res = await tx.update(discussionThreads).set({ duplicateOf: input.originalId, locked: true }).where(eq(discussionThreads.id, input.threadId)).returning({ id: discussionThreads.id });
    if (!res.length) throw new UserFacingError("This discussion no longer exists.");
    await writeAudit(tx, session.email, { action: "community.duplicate", entityType: "discussion_thread", entityId: input.threadId, after: { duplicateOf: input.originalId }, reason });
  });
}

/** Questions whose title matches, for picking a duplicate's original. */
export async function searchThreads(db: Database, session: Session | null, q: string, excludeId?: string) {
  assertCan(session, "portal");
  const term = q.trim().slice(0, 80);
  if (term.length < 3) return [];
  return db.select({ id: discussionThreads.id, title: discussionThreads.title })
    .from(discussionThreads)
    .where(and(eq(discussionThreads.status, "visible"), isNull(discussionThreads.duplicateOf), sql`${discussionThreads.title} ilike ${"%" + term.replace(/[%_\\]/g, "\\$&") + "%"}`, excludeId ? sql`${discussionThreads.id} <> ${excludeId}` : undefined))
    .orderBy(desc(discussionThreads.lastActivityAt))
    .limit(8);
}

/** Toggle a "helpful" vote. You cannot vote for your own post. */
export async function toggleHelpful(db: Database, session: Session | null, input: { kind: "thread" | "post"; id: string }) {
  assertCan(session, "portal");
  return db.transaction(async (tx) => {
    const me = await ensureUser(tx, session);
    const table = input.kind === "thread" ? discussionThreads : discussionPosts;
    const [target] = await tx.select({ authorId: table.authorId }).from(table).where(eq(table.id, input.id)).limit(1);
    if (!target) throw new UserFacingError("That post no longer exists.");
    if (target.authorId === me.id) throw new UserFacingError("You cannot mark your own post as helpful.");
    const where = and(eq(discussionVotes.targetKind, input.kind), eq(discussionVotes.targetId, input.id), eq(discussionVotes.userId, me.id));
    const removed = await tx.delete(discussionVotes).where(where).returning({ u: discussionVotes.userId });
    if (removed.length) return { voted: false };
    await tx.insert(discussionVotes).values({ targetKind: input.kind, targetId: input.id, userId: me.id });
    return { voted: true };
  });
}

export async function reportContent(db: Database, session: Session | null, input: { kind: "thread" | "post"; id: string; reason: string }) {
  assertCan(session, "portal");
  const { reason } = reportInputSchema.parse({ reason: input.reason });
  return db.transaction(async (tx) => {
    const me = await ensureUser(tx, session);
    await tx
      .insert(discussionReports)
      .values({ targetKind: input.kind, targetId: input.id, reporterId: me.id, reason })
      .onConflictDoNothing();
  });
}

// ── Moderation (admin) ─────────────────────────────────────────────────────────

export type ModerationAction = "hide" | "show" | "lock" | "unlock" | "pin" | "unpin";

export async function moderate(
  db: Database,
  session: Session | null,
  input: { kind: "thread" | "post"; id: string; action: ModerationAction; reason: string },
) {
  assertCan(session, "community.moderate");
  const reason = requireReason(input.reason, "moderation");
  if (input.kind === "post" && !["hide", "show"].includes(input.action)) throw new UserFacingError("Replies can only be hidden or shown.");
  return db.transaction(async (tx) => {
    const set =
      input.action === "hide" ? { status: "hidden" as const } :
      input.action === "show" ? { status: "visible" as const } :
      input.action === "lock" ? { locked: true } :
      input.action === "unlock" ? { locked: false } :
      input.action === "pin" ? { pinned: true } : { pinned: false };
    const table = input.kind === "thread" ? discussionThreads : discussionPosts;
    const res = await tx.update(table).set(set as never).where(eq(table.id, input.id)).returning({ id: table.id });
    if (!res.length) throw new UserFacingError("That post no longer exists.");
    if (input.action === "hide") {
      await tx
        .update(discussionReports)
        .set({ status: "resolved", resolvedBy: session.email })
        .where(and(eq(discussionReports.targetKind, input.kind), eq(discussionReports.targetId, input.id), eq(discussionReports.status, "open")));
    }
    await writeAudit(tx, session.email, { action: `community.${input.action}`, entityType: `discussion_${input.kind}`, entityId: input.id, after: set, reason });
  });
}

export async function listOpenReports(db: Database, session: Session | null) {
  assertCan(session, "community.moderate");
  const rows = (await db.execute(sql`
    select r.target_kind, r.target_id, count(*)::int as reports, min(r.created_at) as first_at,
           array_agg(r.reason order by r.created_at) as reasons,
           coalesce(t.title, pt.title) as thread_title,
           coalesce(t.id, p.thread_id) as thread_id,
           left(coalesce(t.body, p.body), 280) as excerpt,
           coalesce(t.status, p.status)::text as status
    from discussion_reports r
    left join discussion_threads t on r.target_kind = 'thread' and t.id = r.target_id
    left join discussion_posts p on r.target_kind = 'post' and p.id = r.target_id
    left join discussion_threads pt on pt.id = p.thread_id
    where r.status = 'open'
    group by r.target_kind, r.target_id, t.title, pt.title, t.id, p.thread_id, t.body, p.body, t.status, p.status
    order by count(*) desc, min(r.created_at)`)) as unknown as {
    target_kind: "thread" | "post"; target_id: string; reports: number; first_at: string; reasons: string[]; thread_title: string | null; thread_id: string | null; excerpt: string | null; status: string | null;
  }[];
  return rows;
}

export async function dismissReports(db: Database, session: Session | null, input: { kind: "thread" | "post"; id: string; reason: string }) {
  assertCan(session, "community.moderate");
  const reason = requireReason(input.reason, "moderation");
  return db.transaction(async (tx) => {
    await tx
      .update(discussionReports)
      .set({ status: "dismissed", resolvedBy: session.email })
      .where(and(eq(discussionReports.targetKind, input.kind), eq(discussionReports.targetId, input.id), eq(discussionReports.status, "open")));
    await writeAudit(tx, session.email, { action: "community.dismiss_reports", entityType: `discussion_${input.kind}`, entityId: input.id, reason });
  });
}

export async function communityStats(db: Database, session: Session | null) {
  assertCan(session, "portal");
  const [[t], [p], [r]] = await Promise.all([
    db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(discussionThreads).where(eq(discussionThreads.status, "visible")),
    db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(discussionPosts).where(eq(discussionPosts.status, "visible")),
    db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(discussionReports).where(eq(discussionReports.status, "open")),
  ]);
  return { threads: t?.n ?? 0, replies: p?.n ?? 0, openReports: r?.n ?? 0 };
}
