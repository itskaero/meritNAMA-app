import "server-only";
import { and, asc, desc, eq, gt, inArray, ne, or, sql } from "drizzle-orm";
import { assertCan, can, type Session } from "@/lib/auth/roles";
import type { Database } from "@/lib/db/client";
import { chatBlocks, chatMembers, chatMessages, chatReactions, chatReports, chatRooms, users } from "@/lib/db/schema";
import {
  CHAT_GROUPS_PER_DAY,
  CHAT_MEMBERS_MAX,
  CHAT_PAGE,
  CHAT_RATE,
  CHAT_REPORT_HIDE_AT,
  CHAT_REPORT_REASONS,
  chatMessageSchema,
  chatNameSchema,
  dmKey,
  dmRefusal,
  dmVerdict,
  isChatReaction,
  tallyReactions,
} from "@/lib/domain/chats";
import { UserFacingError } from "@/lib/errors";
import { mayPost } from "./candidates";
import { assertFeature } from "./settings";
import { writeAudit, type Db } from "./shared";
import { ensureUser } from "./users";

/*
 * Chats: group rooms and one-to-one messages. Reading a chat needs membership (a group
 * is joined from its page; a direct chat has exactly its two people). Writing, starting
 * a chat and joining need a verified record or a staff role, like the rest of the
 * community. A blocked person is never told so: the other side just stops receiving.
 */

export type ChatMessage = {
  id: string;
  seq: number;
  kind: "message" | "system";
  body: string;
  hidden: boolean;
  authorId: string | null;
  author: string | null;
  team: boolean;
  mine: boolean;
  at: string;
  reactions: { emoji: string; count: number; mine: boolean }[];
};

export type ChatSummary = {
  id: string;
  kind: "group" | "dm";
  title: string;
  members: number;
  unread: number;
  muted: boolean;
  lastBody: string | null;
  lastAt: string | null;
};

const fail = (m: string): never => {
  throw new UserFacingError(m);
};

async function me(db: Db, session: Session | null) {
  assertCan(session, "portal");
  return ensureUser(db, session!);
}

async function membership(db: Db, roomId: string, userId: string) {
  const [m] = await db.select({ role: chatMembers.role, lastReadSeq: chatMembers.lastReadSeq, muted: chatMembers.muted }).from(chatMembers).where(and(eq(chatMembers.roomId, roomId), eq(chatMembers.userId, userId))).limit(1);
  return m ?? null;
}

async function isBlockedEitherWay(db: Db, a: string, b: string) {
  const rows = await db
    .select({ blockerId: chatBlocks.blockerId })
    .from(chatBlocks)
    .where(or(and(eq(chatBlocks.blockerId, a), eq(chatBlocks.blockedId, b)), and(eq(chatBlocks.blockerId, b), eq(chatBlocks.blockedId, a))));
  return { iBlocked: rows.some((r) => r.blockerId === a), blockedMe: rows.some((r) => r.blockerId === b) };
}

/** The other person in a direct chat. */
async function otherInDm(db: Db, roomId: string, userId: string) {
  const [o] = await db
    .select({ id: users.id, name: users.displayName, dmOpen: users.dmOpen })
    .from(chatMembers)
    .innerJoin(users, eq(users.id, chatMembers.userId))
    .where(and(eq(chatMembers.roomId, roomId), ne(chatMembers.userId, userId)))
    .limit(1);
  return o ?? null;
}

// ── Reading ────────────────────────────────────────────────────────────────────

/** My chats, most recent first, with unread counts. */
export async function listChats(db: Database, session: Session | null): Promise<ChatSummary[]> {
  const u = await me(db, session);
  const rows = (await db.execute(sql`
    select r.id, r.kind, r.name, m.muted,
      (select count(*) from chat_members x where x.room_id = r.id)::int as members,
      (select u2.display_name from chat_members x join users u2 on u2.id = x.user_id where x.room_id = r.id and x.user_id <> ${u.id} limit 1) as other_name,
      (select count(*) from chat_messages c where c.room_id = r.id and c.seq > m.last_read_seq and c.status = 'visible' and c.author_id is distinct from ${u.id}
         and not exists (select 1 from chat_blocks b where b.blocker_id = ${u.id} and b.blocked_id = c.author_id))::int as unread,
      last.body as last_body, last.created_at as last_at
    from chat_members m
      join chat_rooms r on r.id = m.room_id
      left join lateral (
        select c.body, c.created_at from chat_messages c
        where c.room_id = r.id and c.status = 'visible'
          and not exists (select 1 from chat_blocks b where b.blocker_id = ${u.id} and b.blocked_id = c.author_id)
        order by c.seq desc limit 1) last on true
    where m.user_id = ${u.id}
    order by coalesce(last.created_at, r.created_at) desc
    limit 100`)) as unknown as { id: string; kind: "group" | "dm"; name: string | null; muted: boolean; members: number; other_name: string | null; unread: number; last_body: string | null; last_at: string | null }[];
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.kind === "dm" ? r.other_name ?? "Member" : r.name ?? "Chat",
    members: r.members,
    unread: r.unread,
    muted: r.muted,
    lastBody: r.last_body,
    lastAt: r.last_at ? new Date(r.last_at).toISOString() : null,
  }));
}

/** Total unread across my chats, for the badge. */
export async function unreadChats(db: Database, session: Session | null): Promise<number> {
  const list = await listChats(db, session);
  return list.filter((c) => !c.muted).reduce((n, c) => n + c.unread, 0);
}

/** Open group chats I could join, newest activity first. */
export async function discoverGroups(db: Database, session: Session | null) {
  const u = await me(db, session);
  const rows = (await db.execute(sql`
    select r.id, r.name, (select count(*) from chat_members x where x.room_id = r.id)::int as members
    from chat_rooms r
    where r.kind = 'group' and not exists (select 1 from chat_members m where m.room_id = r.id and m.user_id = ${u.id})
    order by (select max(c.created_at) from chat_messages c where c.room_id = r.id) desc nulls last, r.created_at desc
    limit 20`)) as unknown as { id: string; name: string; members: number }[];
  return rows;
}

/** A chat's header, or null when I am not in it (a group page then offers to join). */
export async function getChat(db: Database, session: Session | null, roomId: string) {
  const u = await me(db, session);
  const [room] = await db.select().from(chatRooms).where(eq(chatRooms.id, roomId)).limit(1);
  if (!room) return null;
  const mem = await membership(db, room.id, u.id);
  const [{ n } = { n: 0 }] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(chatMembers).where(eq(chatMembers.roomId, room.id));
  const other = room.kind === "dm" && mem ? await otherInDm(db, room.id, u.id) : null;
  const blocks = other ? await isBlockedEitherWay(db, u.id, other.id) : null;
  return {
    id: room.id,
    kind: room.kind as "group" | "dm",
    title: room.kind === "dm" ? other?.name ?? "Member" : room.name ?? "Chat",
    members: n,
    isMember: Boolean(mem),
    muted: mem?.muted ?? false,
    owner: mem?.role === "owner",
    otherId: other?.id ?? null,
    iBlocked: blocks?.iBlocked ?? false,
    mayPost: Boolean(mem) && (await mayPost(db, session)) && !(blocks && (blocks.iBlocked || blocks.blockedMe)),
    moderator: can(session, "community.moderate"),
  };
}

/** A chat's latest messages, or the ones after `after`. Members only. */
export async function listMessages(db: Database, session: Session | null, roomId: string, opts: { after?: number } = {}): Promise<ChatMessage[]> {
  const u = await me(db, session);
  if (!(await membership(db, roomId, u.id))) return [];
  const isMod = can(session, "community.moderate");
  const rows = await db
    .select({
      id: chatMessages.id,
      seq: chatMessages.seq,
      kind: chatMessages.kind,
      body: chatMessages.body,
      status: chatMessages.status,
      createdAt: chatMessages.createdAt,
      authorId: chatMessages.authorId,
      author: users.displayName,
      role: users.role,
    })
    .from(chatMessages)
    .leftJoin(users, eq(users.id, chatMessages.authorId))
    .where(and(
      eq(chatMessages.roomId, roomId),
      opts.after != null ? gt(chatMessages.seq, opts.after) : undefined,
      isMod ? undefined : eq(chatMessages.status, "visible"),
      // A person I blocked is silent for me.
      sql`(${chatMessages.authorId} is null or not exists (select 1 from chat_blocks b where b.blocker_id = ${u.id} and b.blocked_id = ${chatMessages.authorId}))`,
    ))
    .orderBy(desc(chatMessages.seq))
    .limit(CHAT_PAGE);
  const ids = rows.map((r) => r.id);
  const reacts = ids.length ? await db.select().from(chatReactions).where(inArray(chatReactions.messageId, ids)) : [];
  return rows.reverse().map((r): ChatMessage => {
    const system = r.kind === "system" || !r.authorId;
    return {
      id: r.id,
      seq: r.seq,
      kind: system ? "system" : "message",
      body: r.body,
      hidden: r.status === "hidden",
      authorId: system ? null : r.authorId,
      author: system ? null : r.author,
      team: !system && r.role != null && r.role !== "candidate",
      mine: r.authorId === u.id,
      at: r.createdAt.toISOString(),
      reactions: tallyReactions(reacts.filter((x) => x.messageId === r.id).map((x) => ({ emoji: x.emoji, mine: x.userId === u.id }))),
    };
  });
}

// ── Writing ────────────────────────────────────────────────────────────────────

async function checkRate(db: Db, userId: string) {
  const count = async (seconds: number) => {
    const [r] = await db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(chatMessages)
      .where(and(eq(chatMessages.authorId, userId), gt(chatMessages.createdAt, new Date(Date.now() - seconds * 1000))));
    return r?.n ?? 0;
  };
  if ((await count(10)) >= CHAT_RATE.perTenSeconds) throw new UserFacingError("Slow down a little. Try again in a few seconds.");
  if ((await count(3600)) >= CHAT_RATE.perHour) throw new UserFacingError("You have reached the hourly message limit. Try again later.");
}

export async function postMessage(db: Database, session: Session | null, input: { roomId: string; body: string }) {
  await assertFeature(db, session, "community");
  const body = chatMessageSchema.parse(input.body);
  return db.transaction(async (tx) => {
    const u = await me(tx, session);
    if (!(await mayPost(tx, session))) fail("Writing opens once your account is linked to your merit record.");
    const mem = await membership(tx, input.roomId, u.id);
    if (!mem) fail("Join this chat first.");
    const [room] = await tx.select({ kind: chatRooms.kind }).from(chatRooms).where(eq(chatRooms.id, input.roomId)).limit(1);
    if (room?.kind === "dm") {
      const other = await otherInDm(tx, input.roomId, u.id);
      if (!other) fail("This chat has no one else in it.");
      const v = dmVerdict({ me: u.id, them: other!.id, ...(await isBlockedEitherWay(tx, u.id, other!.id)), themDmOpen: true, meIsStaff: false });
      // An existing chat continues even if the other person later closed new messages; only blocks stop it.
      if (!v.ok) fail(dmRefusal(v.reason));
    }
    await checkRate(tx, u.id);
    const [row] = await tx.insert(chatMessages).values({ roomId: input.roomId, authorId: u.id, kind: "message", body }).returning({ id: chatMessages.id, seq: chatMessages.seq });
    // Your own message counts as read.
    await tx.update(chatMembers).set({ lastReadSeq: row!.seq }).where(and(eq(chatMembers.roomId, input.roomId), eq(chatMembers.userId, u.id)));
    return row!;
  });
}

/** Start (or reopen) a one-to-one chat. Blocks and a closed inbox stop it, in plain words. */
export async function startDirectChat(db: Database, session: Session | null, input: { userId: string }) {
  await assertFeature(db, session, "community");
  return db.transaction(async (tx) => {
    const u = await me(tx, session);
    if (!(await mayPost(tx, session))) fail("Messaging opens once your account is linked to your merit record.");
    const [them] = await tx.select({ id: users.id, dmOpen: users.dmOpen }).from(users).where(eq(users.id, input.userId)).limit(1);
    if (!them) return fail("That person could not be found.");
    const verdict = dmVerdict({ me: u.id, them: them.id, ...(await isBlockedEitherWay(tx, u.id, them.id)), themDmOpen: them.dmOpen, meIsStaff: can(session, "staff") });
    if (!verdict.ok) fail(dmRefusal(verdict.reason));
    const key = dmKey(u.id, them.id);
    const [existing] = await tx.select({ id: chatRooms.id }).from(chatRooms).where(eq(chatRooms.dmKey, key)).limit(1);
    if (existing) return { id: existing.id };
    const [room] = await tx.insert(chatRooms).values({ kind: "dm", dmKey: key, createdBy: u.id }).onConflictDoNothing().returning({ id: chatRooms.id });
    const roomId = room?.id ?? (await tx.select({ id: chatRooms.id }).from(chatRooms).where(eq(chatRooms.dmKey, key)).limit(1))[0]!.id;
    await tx.insert(chatMembers).values([{ roomId, userId: u.id, role: "member" }, { roomId, userId: them!.id, role: "member" }]).onConflictDoNothing();
    return { id: roomId };
  });
}

export async function createGroup(db: Database, session: Session | null, input: { name: string }) {
  await assertFeature(db, session, "community");
  const name = chatNameSchema.parse(input.name);
  return db.transaction(async (tx) => {
    const u = await me(tx, session);
    if (!(await mayPost(tx, session))) fail("Starting a chat opens once your account is linked to your merit record.");
    const [{ n } = { n: 0 }] = await tx
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(chatRooms)
      .where(and(eq(chatRooms.createdBy, u.id), eq(chatRooms.kind, "group"), gt(chatRooms.createdAt, new Date(Date.now() - 86_400_000))));
    if (n >= CHAT_GROUPS_PER_DAY) fail(`You can start ${CHAT_GROUPS_PER_DAY} group chats a day. Try again tomorrow.`);
    const [room] = await tx.insert(chatRooms).values({ kind: "group", name, createdBy: u.id }).returning({ id: chatRooms.id });
    await tx.insert(chatMembers).values({ roomId: room!.id, userId: u.id, role: "owner" });
    return { id: room!.id };
  });
}

export async function joinGroup(db: Database, session: Session | null, input: { roomId: string }) {
  await assertFeature(db, session, "community");
  return db.transaction(async (tx) => {
    const u = await me(tx, session);
    if (!(await mayPost(tx, session))) fail("Joining opens once your account is linked to your merit record.");
    const [room] = await tx.select({ kind: chatRooms.kind }).from(chatRooms).where(eq(chatRooms.id, input.roomId)).limit(1);
    if (!room || room.kind !== "group") return fail("That chat could not be found.");
    const [{ n } = { n: 0 }] = await tx.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(chatMembers).where(eq(chatMembers.roomId, input.roomId));
    if (n >= CHAT_MEMBERS_MAX) fail("This chat is full.");
    const [last] = await tx.select({ seq: chatMessages.seq }).from(chatMessages).where(eq(chatMessages.roomId, input.roomId)).orderBy(desc(chatMessages.seq)).limit(1);
    // Joining does not make the old backlog "unread".
    await tx.insert(chatMembers).values({ roomId: input.roomId, userId: u.id, role: "member", lastReadSeq: last?.seq ?? 0 }).onConflictDoNothing();
    return { id: input.roomId };
  });
}

export async function leaveChat(db: Database, session: Session | null, input: { roomId: string }) {
  const u = await me(db, session);
  await db.delete(chatMembers).where(and(eq(chatMembers.roomId, input.roomId), eq(chatMembers.userId, u.id)));
}

/** Mark everything up to `seq` as read. */
export async function markRead(db: Database, session: Session | null, input: { roomId: string; seq: number }) {
  const u = await me(db, session);
  if (!Number.isSafeInteger(input.seq) || input.seq < 0) return;
  await db
    .update(chatMembers)
    .set({ lastReadSeq: sql`greatest(${chatMembers.lastReadSeq}, ${input.seq})` })
    .where(and(eq(chatMembers.roomId, input.roomId), eq(chatMembers.userId, u.id)));
}

export async function setMuted(db: Database, session: Session | null, input: { roomId: string; muted: boolean }) {
  const u = await me(db, session);
  await db.update(chatMembers).set({ muted: input.muted }).where(and(eq(chatMembers.roomId, input.roomId), eq(chatMembers.userId, u.id)));
}

/** Toggle one reaction on a message in a chat I belong to. */
export async function toggleReaction(db: Database, session: Session | null, input: { messageId: string; emoji: string }) {
  const u = await me(db, session);
  if (!isChatReaction(input.emoji)) fail("That reaction is not available.");
  const [msg] = await db.select({ roomId: chatMessages.roomId }).from(chatMessages).where(eq(chatMessages.id, input.messageId)).limit(1);
  if (!msg || !(await membership(db, msg.roomId, u.id))) return fail("That message is no longer here.");
  const where = and(eq(chatReactions.messageId, input.messageId), eq(chatReactions.userId, u.id), eq(chatReactions.emoji, input.emoji));
  const removed = await db.delete(chatReactions).where(where).returning({ e: chatReactions.emoji });
  if (!removed.length) await db.insert(chatReactions).values({ messageId: input.messageId, userId: u.id, emoji: input.emoji }).onConflictDoNothing();
}

// ── Safety ─────────────────────────────────────────────────────────────────────

export async function blockUser(db: Database, session: Session | null, input: { userId: string }) {
  const u = await me(db, session);
  if (input.userId === u.id) fail("You cannot block yourself.");
  const [them] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, input.userId)).limit(1);
  if (!them) return fail("That person could not be found.");
  // The team must stay reachable for reports and corrections.
  if (them!.role !== "candidate") fail("Team members cannot be blocked. Use Report instead.");
  await db.insert(chatBlocks).values({ blockerId: u.id, blockedId: input.userId }).onConflictDoNothing();
}

export async function unblockUser(db: Database, session: Session | null, input: { userId: string }) {
  const u = await me(db, session);
  await db.delete(chatBlocks).where(and(eq(chatBlocks.blockerId, u.id), eq(chatBlocks.blockedId, input.userId)));
}

export async function listBlocked(db: Database, session: Session | null) {
  const u = await me(db, session);
  return db
    .select({ id: users.id, name: users.displayName })
    .from(chatBlocks)
    .innerJoin(users, eq(users.id, chatBlocks.blockedId))
    .where(eq(chatBlocks.blockerId, u.id))
    .orderBy(asc(users.displayName));
}

/** Allow or refuse new one-to-one chats from other members. */
export async function setDmOpen(db: Database, session: Session | null, input: { open: boolean }) {
  const u = await me(db, session);
  await db.update(users).set({ dmOpen: input.open }).where(eq(users.id, u.id));
}

export async function getDmOpen(db: Database, session: Session | null) {
  const u = await me(db, session);
  const [r] = await db.select({ dmOpen: users.dmOpen }).from(users).where(eq(users.id, u.id)).limit(1);
  return r?.dmOpen ?? true;
}

/** Report a message in a chat I belong to. Enough different reporters hide it for a moderator. */
export async function reportChatMessage(db: Database, session: Session | null, input: { messageId: string; reason: string }) {
  const u = await me(db, session);
  if (!(CHAT_REPORT_REASONS as readonly string[]).includes(input.reason)) fail("Pick a reason.");
  const [msg] = await db.select({ roomId: chatMessages.roomId, authorId: chatMessages.authorId }).from(chatMessages).where(eq(chatMessages.id, input.messageId)).limit(1);
  if (!msg || !(await membership(db, msg.roomId, u.id))) return fail("That message is no longer here.");
  if (msg!.authorId === u.id) fail("You cannot report your own message.");
  await db.transaction(async (tx) => {
    await tx.insert(chatReports).values({ messageId: input.messageId, reporterId: u.id, reason: input.reason }).onConflictDoNothing();
    const [{ n } = { n: 0 }] = await tx.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(chatReports).where(eq(chatReports.messageId, input.messageId));
    if (n >= CHAT_REPORT_HIDE_AT) await tx.update(chatMessages).set({ status: "hidden" }).where(eq(chatMessages.id, input.messageId));
    await writeAudit(tx, session!.email, { action: "chat.report", entityType: "chat_message", entityId: input.messageId, after: { reports: n }, reason: input.reason });
  });
}

/** Moderators: hide or show a message in any chat. */
export async function moderateChatMessage(db: Database, session: Session | null, input: { messageId: string; hide: boolean }) {
  assertCan(session, "community.moderate");
  await db.transaction(async (tx) => {
    await tx.update(chatMessages).set({ status: input.hide ? "hidden" : "visible" }).where(eq(chatMessages.id, input.messageId));
    await writeAudit(tx, session!.email, { action: input.hide ? "chat.hide" : "chat.show", entityType: "chat_message", entityId: input.messageId, reason: input.hide ? "Hidden by a moderator" : "Shown again by a moderator" });
  });
}
