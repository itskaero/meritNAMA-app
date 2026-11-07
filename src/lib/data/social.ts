import "server-only";
import { eq, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { assertCan, type Session } from "@/lib/auth/roles";
import type { Database } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { meritBand, nextLevel, PEER_MIN, PEER_WINDOW, REPUTATION, reputationLevel } from "@/lib/domain/social";
import type { Db } from "./shared";
import { ensureUser } from "./users";

/*
 * Reputation and peer counts. Both are computed from what is already stored
 * (votes, accepted answers, shortlists, preference lists); nothing new is kept.
 * Peer figures are counts only, never below PEER_MIN, and never name anyone.
 */

// ── Reputation ─────────────────────────────────────────────────────────────────

/**
 * A user's reputation points, as a column expression for any query that has the
 * user's id (e.g. `reputationSql()` in a select joined to users).
 * Votes count only from verified members or staff, at most REPUTATION.perVoterCap
 * from each voter; accepted answers count only on someone else's question.
 */
export const reputationSql = () => {
  // Always correlated to the outer query's "users" row: drizzle drops the table name
  // from columns in single-table selects, which would make "id" ambiguous here.
  const u = sql.raw(`"users"."id"`);
  return sql<number>`(
  ${REPUTATION.accepted} * (
    select count(*) from discussion_threads rt join discussion_posts rp on rp.id = rt.accepted_post_id
    where rp.author_id = ${u} and rt.author_id <> ${u} and rt.status = 'visible' and rp.status = 'visible')
  + ${REPUTATION.helpful} * (
    select coalesce(sum(least(x.n, ${REPUTATION.perVoterCap})), 0) from (
      select v.user_id, count(*) as n
      from discussion_votes v
      join (
        select 'thread' as k, id from discussion_threads where author_id = ${u} and status = 'visible'
        union all select 'post', id from discussion_posts where author_id = ${u} and status = 'visible'
        union all select 'review', id from hospital_reviews where author_id = ${u} and status = 'visible'
      ) c on c.k = v.target_kind and c.id = v.target_id
      where v.user_id <> ${u}
        and exists (
          select 1 from users vu where vu.id = v.user_id
          and (vu.role <> 'candidate' or exists (select 1 from candidate_links vl where vl.user_id = vu.id and vl.status = 'verified')))
      group by v.user_id) x)
)`.mapWith(Number);
};

export async function myReputation(db: Database, session: Session | null) {
  assertCan(session, "portal");
  const me = await ensureUser(db, session);
  const [row] = await db
    .select({
      points: reputationSql(),
      accepted: sql<number>`(select count(*) from discussion_threads rt join discussion_posts rp on rp.id = rt.accepted_post_id
        where rp.author_id = "users"."id" and rt.author_id <> "users"."id" and rt.status = 'visible' and rp.status = 'visible')`.mapWith(Number),
    })
    .from(users)
    .where(eq(users.id, me.id))
    .limit(1);
  const points = row?.points ?? 0;
  return { points, accepted: row?.accepted ?? 0, level: reputationLevel(points), next: nextLevel(points) };
}

// ── Preferences ────────────────────────────────────────────────────────────────

export async function socialPrefs(db: Database, session: Session | null) {
  assertCan(session, "portal");
  const me = await ensureUser(db, session);
  const [row] = await db.select({ showBand: users.showBand, peerCounted: users.peerCounted }).from(users).where(eq(users.id, me.id)).limit(1);
  return row ?? { showBand: false, peerCounted: true };
}

export async function setSocialPrefs(db: Database, session: Session | null, input: { showBand?: boolean; peerCounted?: boolean }) {
  assertCan(session, "portal");
  const me = await ensureUser(db, session);
  const set: { showBand?: boolean; peerCounted?: boolean } = {};
  if (typeof input.showBand === "boolean") set.showBand = input.showBand;
  if (typeof input.peerCounted === "boolean") set.peerCounted = input.peerCounted;
  if (Object.keys(set).length) await db.update(users).set(set).where(eq(users.id, me.id));
}

// ── Peers ──────────────────────────────────────────────────────────────────────

/**
 * The marks someone is compared on: their verified record's latest allocation,
 * otherwise the marks on their most recently edited preference list (planners
 * who have no record yet).
 */
const referenceMarks = (u: AnyColumn | SQL) => sql`coalesce(
  (select m.marks from candidate_links l
     join merit_allocations m on m.applicant_id = l.applicant_id
     join merit_rounds r on r.id = m.round_id
   where l.user_id = ${u} and l.status = 'verified'
   order by r.induction_id desc, r.round_no desc limit 1),
  (select pl.marks from preference_lists pl where pl.user_id = ${u} and pl.marks is not null order by pl.updated_at desc limit 1)
)`;

export type PeerSeat = { program: string; quota: string; speciality: string; hospital: string; peers: number };
export type PeerInterest = {
  /** The marks used, and where they came from. Null when the person has neither. */
  marks: number | null;
  source: "record" | "plan" | null;
  /** People near those marks who are counted (null when fewer than PEER_MIN). */
  near: number | null;
  /** Seats that at least PEER_MIN of them have shortlisted or put on a preference list. */
  seats: PeerSeat[];
};

/**
 * What people near your marks are looking at. Counts only: who they are, and
 * their exact marks, never leave the database. People who turned counting off
 * are left out, and so is the viewer.
 */
export async function peerInterest(db: Db, session: Session | null, opts: { limit?: number } = {}): Promise<PeerInterest> {
  assertCan(session, "portal");
  const me = await ensureUser(db, session);
  const [ref] = (await db.execute(sql`
    select (select m.marks from candidate_links l
              join merit_allocations m on m.applicant_id = l.applicant_id
              join merit_rounds r on r.id = m.round_id
            where l.user_id = ${me.id} and l.status = 'verified'
            order by r.induction_id desc, r.round_no desc limit 1) as record,
           (select pl.marks from preference_lists pl where pl.user_id = ${me.id} and pl.marks is not null order by pl.updated_at desc limit 1) as plan`)) as unknown as { record: number | null; plan: number | null }[];
  const source = ref?.record != null ? "record" : ref?.plan != null ? "plan" : null;
  const marks = source === "record" ? Number(ref!.record) : source === "plan" ? Number(ref!.plan) : null;
  if (marks == null) return { marks: null, source: null, near: null, seats: [] };
  const lo = marks - PEER_WINDOW, hi = marks + PEER_WINDOW;
  const rows = (await db.execute(sql`
    with peers as (
      select u.id as user_id from users u
      where u.peer_counted and u.id <> ${me.id}
        and ${referenceMarks(sql`u.id`)} between ${lo} and ${hi}
    ),
    picks as (
      select user_id, trim(program) as program, trim(quota) as quota, trim(speciality) as speciality, trim(hospital) as hospital from shortlist_items
      union
      select pl.user_id, trim(pl.program), trim(pl.quota), trim(pi.speciality), trim(pi.hospital)
      from preference_items pi join preference_lists pl on pl.id = pi.list_id
    )
    select null as program, null as quota, null as speciality, null as hospital, (select count(*) from peers)::int as peers
    union all
    (select s.program, s.quota, s.speciality, s.hospital, count(distinct s.user_id)::int as peers
     from picks s join peers p on p.user_id = s.user_id
     group by 1, 2, 3, 4
     having count(distinct s.user_id) >= ${PEER_MIN}
     order by 5 desc, 3, 4
     limit ${Math.min(opts.limit ?? 50, 200)})`)) as unknown as { program: string | null; quota: string | null; speciality: string | null; hospital: string | null; peers: number }[];
  const [total, ...seats] = rows;
  const near = total && total.peers >= PEER_MIN ? total.peers : null;
  return {
    marks,
    source,
    near,
    seats: seats.map((s) => ({ program: s.program!, quota: s.quota!, speciality: s.speciality!, hospital: s.hospital!, peers: s.peers })),
  };
}

export const peerKey = (s: { program: string; quota: string; speciality: string; hospital: string }) =>
  `${s.program.trim()}|${s.quota.trim()}|${s.speciality.trim()}|${s.hospital.trim()}`;

/** The band the signed-in person would show in rooms (programme and a one-mark range), or null. */
export async function myBand(db: Database, session: Session | null): Promise<string | null> {
  assertCan(session, "portal");
  const me = await ensureUser(db, session);
  const [r] = (await db.execute(sql`
    select m.program, m.marks from candidate_links l
      join merit_allocations m on m.applicant_id = l.applicant_id
      join merit_rounds r on r.id = m.round_id
    where l.user_id = ${me.id} and l.status = 'verified'
    order by r.induction_id desc, r.round_no desc limit 1`)) as unknown as { program: string; marks: number }[];
  return r ? meritBand(r.program, Number(r.marks)) : null;
}
