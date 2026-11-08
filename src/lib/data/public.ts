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
    db.select({ rounds: sql<number>`count(*)`.mapWith(Number), inductions: sql<number>`count(distinct ${meritRounds.inductionId})`.mapWith(Number), updatedAt: sql<string | null>`max(${meritRounds.importedAt})::text` }).from(meritRounds),
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

  // A sample: what the middle allocated candidate's marks reach in the most common
  // track of the latest induction (the median of that track's latest round), so the
  // example is typical rather than discouraging.
  let sample: { program: string; quota: string; marks: number; total: number; pct: number; safe: number; borderline: number; out: number } | null = null;
  const total = latest ? maxMarks[latest.ind] : undefined;
  if (latest && total) {
    const [track] = (await db.execute(sql`
      with last as (select max(round_no) as r from merit_rounds where induction_id = ${latest.ind})
      select m.program, m.quota, count(*)::int as n,
        percentile_cont(0.5) within group (order by m.marks) as median
      from merit_allocations m join merit_rounds r on r.id = m.round_id
      where r.induction_id = ${latest.ind} and r.round_no = (select r from last)
      group by m.program, m.quota order by count(*) desc limit 1`)) as unknown as { program: string; quota: string; median: number }[];
    if (track) {
      const marks = Math.round(Number(track.median) * 100) / 100;
      const r = await computeOptions(db, { induction: latest.ind, program: track.program, quota: track.quota, marks, total });
      const n = (st: string) => r.options.filter((o) => o.status === st).length;
      sample = { program: track.program.trim(), quota: track.quota.trim(), marks, total, pct: Math.round((marks / total) * 100), safe: n("safe"), borderline: n("borderline"), out: n("out") };
    }
  }

  return {
    inductions: rounds?.inductions ?? 0,
    rounds: rounds?.rounds ?? 0,
    updatedAt: rounds?.updatedAt ? new Date(rounds.updatedAt) : null,
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

/**
 * The homepage's "check your marks" box: the programmes and quotas of the latest
 * induction (most allocations first) and its total marks. Public aggregates only.
 */
export async function landingTracks(db: Database) {
  const [latest] = await db.select({ ind: meritRounds.inductionId }).from(meritRounds).orderBy(desc(meritRounds.inductionId)).limit(1);
  if (!latest) return null;
  const total = (await inductionMaxMarks(db))[latest.ind];
  if (!total) return null;
  const tracks = (await db.execute(sql`
    select trim(m.program) as program, trim(m.quota) as quota, count(*)::int as n
    from merit_allocations m join merit_rounds r on r.id = m.round_id
    where r.induction_id = ${latest.ind}
    group by 1, 2 order by count(*) desc limit 40`)) as unknown as { program: string; quota: string; n: number }[];
  return { induction: latest.ind, total, tracks: tracks.map((t) => ({ program: t.program, quota: t.quota })) };
}

export type LandingCheck =
  | { ok: true; induction: number; total: number; marks: number; program: string; quota: string; safe: number; borderline: number; out: number }
  | { ok: false; message: string };

/**
 * Counts of options a score would have reached (safe, borderline, out of reach)
 * against the latest induction's closing merit. Counts only: which options they are
 * is in the score finder, after sign-in.
 */
export async function landingCheck(db: Database, input: { marks: string | undefined; track: string | undefined }): Promise<LandingCheck | null> {
  if (input.marks == null || input.marks === "") return null;
  const info = await landingTracks(db);
  if (!info) return { ok: false, message: "No merit lists have been published yet." };
  const marks = Number(input.marks);
  if (!Number.isFinite(marks) || marks <= 0 || marks > info.total) return { ok: false, message: `Enter your marks out of ${info.total}, for example ${(info.total * 0.7).toFixed(1)}.` };
  const t = info.tracks.find((x) => `${x.program}|${x.quota}` === input.track) ?? info.tracks[0];
  if (!t) return { ok: false, message: "No merit lists have been published yet." };
  const raw = (await db.execute(sql`
    select m.program, m.quota from merit_allocations m join merit_rounds r on r.id = m.round_id
    where r.induction_id = ${info.induction} and trim(m.program) = ${t.program} and trim(m.quota) = ${t.quota} limit 1`)) as unknown as { program: string; quota: string }[];
  if (!raw[0]) return { ok: false, message: "That programme and quota is not in the latest induction." };
  const r = await computeOptions(db, { induction: info.induction, program: raw[0].program, quota: raw[0].quota, marks, total: info.total });
  const n = (st: string) => r.options.filter((o) => o.status === st).length;
  return { ok: true, induction: info.induction, total: info.total, marks, program: t.program, quota: t.quota, safe: n("safe"), borderline: n("borderline"), out: n("out") };
}
