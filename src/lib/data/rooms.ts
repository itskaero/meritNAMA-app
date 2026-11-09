import "server-only";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { assertCan, can, type Session } from "@/lib/auth/roles";
import type { Database } from "@/lib/db/client";
import { candidateLinks, meritRounds, roundRoomMessages, users } from "@/lib/db/schema";
import { meritBand, reputationLevel, ROOM_PAGE, ROOM_RATE, roomKeySchema, roomMessageSchema, roundDayText, type RoundDaySummary } from "@/lib/domain/social";
import { UserFacingError } from "@/lib/errors";
import { mayPost } from "./candidates";
import { assertFeature } from "./settings";
import type { Db } from "./shared";
import { reputationSql } from "./social";
import { ensureUser } from "./users";

/*
 * Round rooms: a one-line chat on each published merit round. Reading is open to
 * every signed-in member (people planning ahead read old rooms like an archive);
 * posting needs a verified record or a staff role, like the rest of the community.
 * When a round is imported, its figures arrive as a system message.
 */

export type RoomKey = { induction: number; roundNo: number };

export type RoomMessage = {
  id: string;
  seq: number;
  kind: "message" | "system";
  body: string;
  hidden: boolean;
  author: string | null;
  team: boolean;
  verified: boolean;
  level: string | null;
  band: string | null;
  mine: boolean;
  at: string;
};

async function roomExists(db: Db, k: RoomKey) {
  const [r] = await db.select({ id: meritRounds.id }).from(meritRounds).where(and(eq(meritRounds.inductionId, k.induction), eq(meritRounds.roundNo, k.roundNo))).limit(1);
  return Boolean(r);
}

/** The author's latest allocation (programme and marks), only for people who opted in to show a band. */
const bandSource = sql<string | null>`case when "users"."show_band" then (
  select m.program || '|' || m.marks from candidate_links l
    join merit_allocations m on m.applicant_id = l.applicant_id
    join merit_rounds r on r.id = m.round_id
  where l.user_id = "users"."id" and l.status = 'verified'
  order by r.induction_id desc, r.round_no desc limit 1) end`;

async function readMessages(db: Db, session: Session, k: RoomKey, opts: { after?: number; limit?: number }) {
  const me = await ensureUser(db, session);
  const isMod = can(session, "community.moderate");
  const rows = await db
    .select({
      id: roundRoomMessages.id,
      seq: roundRoomMessages.seq,
      kind: roundRoomMessages.kind,
      body: roundRoomMessages.body,
      status: roundRoomMessages.status,
      createdAt: roundRoomMessages.createdAt,
      authorId: roundRoomMessages.authorId,
      author: users.displayName,
      role: users.role,
      verified: sql<boolean>`exists (select 1 from ${candidateLinks} cl where cl.user_id = "users"."id" and cl.status = 'verified')`,
      points: reputationSql(),
      band: bandSource,
    })
    .from(roundRoomMessages)
    .leftJoin(users, eq(users.id, roundRoomMessages.authorId))
    .where(and(
      eq(roundRoomMessages.induction, k.induction),
      eq(roundRoomMessages.roundNo, k.roundNo),
      opts.after != null ? gt(roundRoomMessages.seq, opts.after) : undefined,
      isMod ? undefined : eq(roundRoomMessages.status, "visible"),
    ))
    .orderBy(desc(roundRoomMessages.seq))
    .limit(Math.min(opts.limit ?? ROOM_PAGE, ROOM_PAGE));
  return rows.reverse().map((r): RoomMessage => {
    const [program, marks] = r.band ? r.band.split("|") : [null, null];
    const system = r.kind === "system" || !r.authorId;
    return {
      id: r.id,
      seq: r.seq,
      kind: system ? "system" : "message",
      body: r.body,
      hidden: r.status === "hidden",
      author: system ? null : r.author,
      team: !system && r.role != null && r.role !== "candidate",
      verified: !system && r.verified,
      level: system ? null : reputationLevel(r.points ?? 0).label,
      band: system ? null : meritBand(program ?? null, marks == null ? null : Number(marks)),
      mine: r.authorId === me.id,
      at: r.createdAt.toISOString(),
    };
  });
}

/** A room's latest messages, or the ones after `after` (for polling). */
export async function listRoom(db: Database, session: Session | null, key: RoomKey, opts: { after?: number } = {}) {
  assertCan(session, "portal");
  const k = roomKeySchema.parse(key);
  if (!(await roomExists(db, k))) return null;
  const messages = await readMessages(db, session, k, opts);
  return { messages, mayPost: await mayPost(db, session), moderator: can(session, "community.moderate") };
}

async function checkRoomRate(db: Db, userId: string) {
  const count = async (seconds: number) => {
    const [r] = await db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(roundRoomMessages)
      .where(and(eq(roundRoomMessages.authorId, userId), gt(roundRoomMessages.createdAt, new Date(Date.now() - seconds * 1000))));
    return r?.n ?? 0;
  };
  if ((await count(10)) >= ROOM_RATE.perTenSeconds) throw new UserFacingError("One message every ten seconds. Try again in a moment.");
  if ((await count(3600)) >= ROOM_RATE.perHour) throw new UserFacingError("You have reached the hourly limit for this room. Try again later.");
}

export async function postToRoom(db: Database, session: Session | null, input: RoomKey & { body: string }) {
  assertCan(session, "portal");
  await assertFeature(db, session, "community");
  const k = roomKeySchema.parse({ induction: input.induction, roundNo: input.roundNo });
  const body = roomMessageSchema.parse(input.body);
  return db.transaction(async (tx) => {
    const me = await ensureUser(tx, session);
    if (!(await mayPost(tx, session))) throw new UserFacingError("Posting opens once your account is linked to your merit record. Reading stays open to everyone.");
    if (!(await roomExists(tx, k))) throw new UserFacingError("This round has no room yet.");
    await checkRoomRate(tx, me.id);
    const [row] = await tx.insert(roundRoomMessages).values({ ...k, authorId: me.id, kind: "message", body }).returning({ id: roundRoomMessages.id, seq: roundRoomMessages.seq });
    return row!;
  });
}

/**
 * Internal (called by the merit-round import, inside its transaction): post the
 * round's own figures into its room. Group closing merit is the lowest allocated
 * marks per programme, quota and speciality, as everywhere else.
 */
export async function postRoundDay(db: Db, input: { induction: number; roundNo: number; roundId: number; alerted: number; updated: boolean }) {
  const [s] = (await db.execute(sql`
    with now as (
      select program, quota, speciality, min(marks) as closing from merit_allocations where round_id = ${input.roundId} group by 1, 2, 3),
    before as (
      select a.program, a.quota, a.speciality, min(a.marks) as closing
      from merit_allocations a join merit_rounds r on r.id = a.round_id
      where r.induction_id = ${input.induction} and r.round_no = ${input.roundNo - 1}
      group by 1, 2, 3),
    fall as (
      select now.program, now.speciality, before.closing as from_, now.closing as to_
      from now join before using (program, quota, speciality)
      order by before.closing - now.closing desc limit 1)
    select (select count(*) from merit_allocations where round_id = ${input.roundId})::int as allocations,
      (select percentile_cont(0.5) within group (order by closing) from now) as median,
      (select percentile_cont(0.5) within group (order by closing) from before) as previous,
      (select row_to_json(fall) from fall) as fall`)) as unknown as {
    allocations: number; median: number | null; previous: number | null; fall: { program: string; speciality: string; from_: number; to_: number } | null;
  }[];
  const summary: RoundDaySummary = {
    induction: input.induction,
    roundNo: input.roundNo,
    allocations: s?.allocations ?? 0,
    median: s?.median == null ? null : Number(s.median),
    previousMedian: s?.previous == null ? null : Number(s.previous),
    biggestFall: s?.fall ? { program: s.fall.program.trim(), speciality: s.fall.speciality.trim(), from: Number(s.fall.from_), to: Number(s.fall.to_) } : null,
    alerted: input.alerted,
    updated: input.updated,
  };
  await db.insert(roundRoomMessages).values({ induction: input.induction, roundNo: input.roundNo, authorId: null, kind: "system", body: roundDayText(summary) });
  return summary;
}

/**
 * Rooms with recent activity, newest round first, for the dashboard and the
 * community page: the latest round always appears (it is where round day happens).
 */
export async function roomPulse(db: Database, session: Session | null, opts: { limit?: number } = {}) {
  assertCan(session, "portal");
  const rows = (await db.execute(sql`
    with latest as (select induction_id, max(round_no) as round_no from merit_rounds group by 1 order by 1 desc limit 1),
    rooms as (
      select r.induction_id as induction, r.round_no,
        (select count(*) from round_room_messages m where m.induction = r.induction_id and m.round_no = r.round_no and m.status = 'visible' and m.kind = 'message')::int as messages,
        (select count(*) from round_room_messages m where m.induction = r.induction_id and m.round_no = r.round_no and m.status = 'visible' and m.kind = 'message' and m.created_at > now() - interval '24 hours')::int as today,
        (select max(m.created_at) from round_room_messages m where m.induction = r.induction_id and m.round_no = r.round_no and m.status = 'visible') as last_at,
        exists (select 1 from latest l where l.induction_id = r.induction_id and l.round_no = r.round_no) as latest
      from merit_rounds r)
    select * from rooms where latest or messages > 0
    order by latest desc, last_at desc nulls last
    limit ${Math.min(opts.limit ?? 4, 20)}`)) as unknown as { induction: number; round_no: number; messages: number; today: number; last_at: string | null; latest: boolean }[];
  const first = rows[0];
  const preview = first ? await readMessages(db, session, { induction: first.induction, roundNo: first.round_no }, { limit: 3 }) : [];
  return {
    rooms: rows.map((r) => ({ induction: r.induction, roundNo: r.round_no, messages: r.messages, today: r.today, lastAt: r.last_at ? new Date(r.last_at).toISOString() : null, latest: r.latest })),
    preview,
  };
}
