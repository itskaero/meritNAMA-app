import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import { discussionPosts, discussionThreads, inductionSeats, meritAllocations, meritRounds, scoringPolicies } from "@/lib/db/schema";
import { policySchema } from "@/lib/domain/scoring-policy";
import { computeOptions } from "./finder";
import { inductionMaxMarks } from "./merit";

/**
 * Figures for the public landing page. No session: every value here is an
 * aggregate (counts, totals, medians, the published policy). No allocation rows,
 * applicant ids, names or community text leave this module.
 */
export async function landingFigures(db: Database) {
  const [[rounds], [alloc], [seats], [threads], [posts], active, maxMarks] = await Promise.all([
    db.select({ rounds: sql<number>`count(*)`.mapWith(Number), inductions: sql<number>`count(distinct ${meritRounds.inductionId})`.mapWith(Number) }).from(meritRounds),
    db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(meritAllocations),
    db.select({ seats: sql<number>`coalesce(sum(${inductionSeats.seats}), 0)`.mapWith(Number), hospitals: sql<number>`count(distinct ${inductionSeats.hospitalId})`.mapWith(Number), specialities: sql<number>`count(distinct ${inductionSeats.specialityId})`.mapWith(Number) }).from(inductionSeats),
    db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(discussionThreads).where(eq(discussionThreads.status, "visible")),
    db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(discussionPosts).where(eq(discussionPosts.status, "visible")),
    db.select({ key: scoringPolicies.policyKey, definition: scoringPolicies.definition }).from(scoringPolicies).where(eq(scoringPolicies.status, "active")).limit(1),
    inductionMaxMarks(db),
  ]);

  const policy = active[0] ? policySchema.safeParse(active[0].definition) : null;
  const components = policy?.success
    ? policy.data.components.filter((c) => c.included !== false && c.max_marks > 0).map((c) => ({ label: c.label, max: c.max_marks })).sort((a, b) => b.max - a.max)
    : [];

  // Median closing merit per round of the latest induction.
  const [latest] = await db.select({ ind: meritRounds.inductionId, name: meritRounds.cycleName }).from(meritRounds).orderBy(desc(meritRounds.inductionId)).limit(1);
  const trend = latest
    ? ((await db.execute(sql`
        with g as (
          select r.round_no, min(m.marks) as closing
          from merit_allocations m join merit_rounds r on r.id = m.round_id
          where r.induction_id = ${latest.ind}
          group by r.round_no, m.program, m.quota, m.speciality)
        select round_no, percentile_cont(0.5) within group (order by closing) as median
        from g group by round_no order by round_no`)) as unknown as { round_no: number; median: number }[]).map((r) => ({ round: r.round_no, median: Number(r.median) }))
    : [];

  // A sample: what 65% would have reached in the most common track of the latest induction.
  let sample: { program: string; quota: string; pct: number; safe: number; borderline: number; out: number } | null = null;
  if (latest && maxMarks[latest.ind]) {
    const [track] = await db
      .select({ program: meritAllocations.program, quota: meritAllocations.quota })
      .from(meritAllocations)
      .innerJoin(meritRounds, eq(meritRounds.id, meritAllocations.roundId))
      .where(eq(meritRounds.inductionId, latest.ind))
      .groupBy(meritAllocations.program, meritAllocations.quota)
      .orderBy(desc(sql`count(*)`))
      .limit(1);
    if (track) {
      const r = await computeOptions(db, { induction: latest.ind, program: track.program, quota: track.quota, marks: 65, total: 100 });
      const n = (s: string) => r.options.filter((o) => o.status === s).length;
      sample = { ...track, pct: 65, safe: n("safe"), borderline: n("borderline"), out: n("out") };
    }
  }

  return {
    inductions: rounds?.inductions ?? 0,
    rounds: rounds?.rounds ?? 0,
    allocations: alloc?.n ?? 0,
    seats: seats?.seats ?? 0,
    hospitals: seats?.hospitals ?? 0,
    specialities: seats?.specialities ?? 0,
    discussions: (threads?.n ?? 0) + (posts?.n ?? 0),
    policy: active[0] && policy?.success ? { key: active[0].key, total: policy.data.total_marks, components } : null,
    latest: latest ? { induction: latest.ind, cycle: latest.name, maxMarks: maxMarks[latest.ind] ?? null, trend } : null,
    sample,
  };
}

export type LandingFigures = Awaited<ReturnType<typeof landingFigures>>;
