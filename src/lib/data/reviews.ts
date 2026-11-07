import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { assertCan, can, type Session } from "@/lib/auth/roles";
import type { Database } from "@/lib/db/client";
import { candidateLinks, discussionVotes, hospitalReviews, hospitals, meritAllocations, specialities, users } from "@/lib/db/schema";
import { REVIEW_DIMENSIONS, reviewInputSchema, type ReviewDimension, type ReviewInput } from "@/lib/domain/community";
import { UserFacingError } from "@/lib/errors";
import { mayPost } from "./candidates";
import { voteCount } from "./community";
import { notifyFollowers } from "./notifications";
import { assertFeature } from "./settings";
import { ensureUser } from "./users";

/**
 * Structured hospital reviews: four 1–5 ratings and a short text, one per author
 * per hospital + speciality. Written by verified candidates (or staff); read by
 * everyone signed in. "Allocated here" says the reviewer's verified record has an
 * allocation at that hospital; it is worked out in SQL and only the yes/no leaves.
 */

export type Ratings = Record<ReviewDimension, number>;
const KEYS = REVIEW_DIMENSIONS.map((d) => d.key);

const authorVerified = sql<boolean>`exists (select 1 from ${candidateLinks} l where l.user_id = ${users.id} and l.status = 'verified')`;
const allocatedHere = sql<boolean>`exists (
  select 1 from ${candidateLinks} l join ${meritAllocations} m on m.applicant_id = l.applicant_id
  where l.user_id = ${hospitalReviews.authorId} and l.status = 'verified' and m.hospital_id = ${hospitalReviews.hospitalId})`;

/** Write or update your review of a hospital (optionally one speciality there). */
export async function saveReview(db: Database, session: Session | null, input: ReviewInput) {
  assertCan(session, "portal");
  await assertFeature(db, session, "community");
  const v = reviewInputSchema.parse(input);
  const specialityId = v.specialityId ?? null;
  return db.transaction(async (tx) => {
    const me = await ensureUser(tx, session);
    if (!(await mayPost(tx, session))) throw new UserFacingError("Reviews come from candidates whose account is linked to their merit record. Verify it on your profile.");
    const [h] = await tx.select({ id: hospitals.id, name: hospitals.name }).from(hospitals).where(eq(hospitals.id, v.hospitalId)).limit(1);
    if (!h) throw new UserFacingError("That hospital is not in the list.");
    if (specialityId !== null) {
      const [seen] = await tx.select({ n: sql<number>`1` }).from(meritAllocations)
        .where(and(eq(meritAllocations.hospitalId, v.hospitalId), eq(meritAllocations.specialityId, specialityId))).limit(1);
      if (!seen) throw new UserFacingError("That speciality has no seats at this hospital in the merit lists.");
    }
    const values = { hospitalId: v.hospitalId, specialityId, authorId: me.id, induction: v.induction, training: v.training, workload: v.workload, hostel: v.hostel, stipend: v.stipend, body: v.body };
    const [existing] = await tx.select({ id: hospitalReviews.id }).from(hospitalReviews)
      .where(and(eq(hospitalReviews.authorId, me.id), eq(hospitalReviews.hospitalId, v.hospitalId), sql`coalesce(${hospitalReviews.specialityId}, 0) = ${specialityId ?? 0}`)).limit(1);
    if (existing) {
      await tx.update(hospitalReviews).set({ ...values, updatedAt: new Date() }).where(eq(hospitalReviews.id, existing.id));
      return { id: existing.id, created: false };
    }
    const [row] = await tx.insert(hospitalReviews).values(values).returning({ id: hospitalReviews.id });
    await notifyFollowers(tx, [{ kind: "hospital", key: String(v.hospitalId) }], { kind: "new_review", title: `New review: ${h.name}`, href: `/portal/explore/hospitals/${v.hospitalId}#reviews` }, me.id);
    return { id: row!.id, created: true };
  });
}

const avg = (col: AnyPgColumn) => sql<number | null>`round(avg(${col})::numeric, 1)`.mapWith((v) => (v == null ? null : Number(v)));

/** A hospital's reviews: averages, the list (newest first), and your own for the form. */
export async function listHospitalReviews(db: Database, session: Session | null, input: { hospitalId: number; specialityId?: number | null }) {
  assertCan(session, "portal");
  const isMod = can(session, "community.moderate");
  const me = await ensureUser(db, session);
  const specFilter = input.specialityId ? eq(hospitalReviews.specialityId, input.specialityId) : undefined;
  const visible = eq(hospitalReviews.status, "visible");
  const [[summary], list, [mine]] = await Promise.all([
    db.select({ count: sql<number>`count(*)`.mapWith(Number), training: avg(hospitalReviews.training), workload: avg(hospitalReviews.workload), hostel: avg(hospitalReviews.hostel), stipend: avg(hospitalReviews.stipend) })
      .from(hospitalReviews).where(and(eq(hospitalReviews.hospitalId, input.hospitalId), visible, specFilter)),
    db.select({
      id: hospitalReviews.id,
      author: users.displayName,
      authorIsTeam: sql<boolean>`${users.role} <> 'candidate'`,
      authorVerified,
      allocatedHere,
      speciality: specialities.name,
      specialityId: hospitalReviews.specialityId,
      induction: hospitalReviews.induction,
      training: hospitalReviews.training,
      workload: hospitalReviews.workload,
      hostel: hospitalReviews.hostel,
      stipend: hospitalReviews.stipend,
      body: hospitalReviews.body,
      status: hospitalReviews.status,
      helpful: voteCount("review", hospitalReviews.id),
      voted: sql<boolean>`exists (select 1 from ${discussionVotes} v where v.target_kind = 'review' and v.target_id = ${hospitalReviews.id} and v.user_id = ${me.id})`,
      mine: sql<boolean>`${hospitalReviews.authorId} = ${me.id}`,
      updatedAt: hospitalReviews.updatedAt,
    })
      .from(hospitalReviews)
      .innerJoin(users, eq(users.id, hospitalReviews.authorId))
      .leftJoin(specialities, eq(specialities.id, hospitalReviews.specialityId))
      .where(and(eq(hospitalReviews.hospitalId, input.hospitalId), isMod ? undefined : visible, specFilter))
      .orderBy(sql`${hospitalReviews.updatedAt} desc`)
      .limit(100),
    db.select().from(hospitalReviews)
      .where(and(eq(hospitalReviews.authorId, me.id), eq(hospitalReviews.hospitalId, input.hospitalId), sql`coalesce(${hospitalReviews.specialityId}, 0) = ${input.specialityId ?? 0}`)).limit(1),
  ]);
  const averages = KEYS.map((k) => ({ key: k, value: summary?.[k] ?? null }));
  return { count: summary?.count ?? 0, averages, reviews: list, mine: mine ?? null, mayWrite: await mayPost(db, session) };
}

/** Per hospital, how trainees rate one speciality there (top 8 by number of reviews). */
export async function specialityReviewSummary(db: Database, session: Session | null, specialityId: number) {
  assertCan(session, "portal");
  return db.select({
    hospitalId: hospitalReviews.hospitalId,
    hospital: hospitals.name,
    count: sql<number>`count(*)`.mapWith(Number),
    training: avg(hospitalReviews.training),
    workload: avg(hospitalReviews.workload),
    hostel: avg(hospitalReviews.hostel),
    stipend: avg(hospitalReviews.stipend),
  })
    .from(hospitalReviews)
    .innerJoin(hospitals, eq(hospitals.id, hospitalReviews.hospitalId))
    .where(and(eq(hospitalReviews.specialityId, specialityId), eq(hospitalReviews.status, "visible")))
    .groupBy(hospitalReviews.hospitalId, hospitals.name)
    .orderBy(sql`count(*) desc`, hospitals.name)
    .limit(8);
}

/** What the review form offers for one hospital: its specialities (from the merit lists) and inductions. */
export async function reviewChoices(db: Database, session: Session | null, hospitalId: number) {
  assertCan(session, "portal");
  const rows = (await db.execute(sql`
    select distinct m.speciality_id as id, s.name, r.induction_id
    from merit_allocations m join merit_rounds r on r.id = m.round_id join specialities s on s.id = m.speciality_id
    where m.hospital_id = ${hospitalId}`)) as unknown as { id: number; name: string; induction_id: number }[];
  const specs = new Map(rows.map((r) => [Number(r.id), r.name]));
  return {
    specialities: [...specs].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
    inductions: [...new Set(rows.map((r) => r.induction_id))].sort((a, b) => b - a),
  };
}
