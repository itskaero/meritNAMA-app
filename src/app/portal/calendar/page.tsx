import Link from "next/link";
import { AreaPage } from "@/components/area-page";
import { whenDatabaseDown } from "@/components/database-unavailable";
import { AuroraHeader, AuroraStat } from "@/components/ui/aurora-header";
import { FollowButton } from "@/components/community/follow-button";
import { isFollowing } from "@/lib/data/notifications";
import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { getSession } from "@/lib/auth/session";
import { listJobs } from "@/lib/data/jobs";
import { latestSchedule } from "@/lib/data/schedule";
import { listInductionsWithRounds } from "@/lib/data/merit";
import { publishedEstimates } from "@/lib/data/simulation";
import { getDb } from "@/lib/db/client";
import { cycleProgress } from "@/lib/domain/cycle";
import { todayPk } from "@/lib/jobs/rules";
import { findSection } from "@/lib/navigation";

export const metadata = { title: "Calendar" };
export const dynamic = "force-dynamic";

type Kind = "phf" | "list" | "expected" | "estimate" | "cycle" | "job";
type Ev = { date: string; kind: Kind; label: string; note?: string; href?: string };
const KIND: Record<Kind, { label: string; dot: string; tone: "success" | "neutral" | "amber" | "info" | "violet" }> = {
  phf: { label: "PHF date", dot: "bg-teal", tone: "info" },
  list: { label: "List out", dot: "bg-success", tone: "success" },
  expected: { label: "Expected", dot: "bg-violet-soft", tone: "violet" },
  estimate: { label: "Estimate", dot: "bg-amber", tone: "amber" },
  cycle: { label: "Cycle", dot: "bg-info", tone: "info" },
  job: { label: "Job closes", dot: "bg-danger", tone: "neutral" },
};
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const nice = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/**
 * The running induction on a calendar: lists PHF published (by the day they came in),
 * the cycle's dates, the expected next rounds (estimated from the cycle, labelled so),
 * published estimates, and job adverts closing. PHF does not date each round, so
 * expected dates are spread across the published cycle.
 */
export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const s = findSection("/portal/calendar");
  const down = await whenDatabaseDown({ area: "portal", trail: [{ label: s.label }], title: s.label, description: s.description });
  if (down) return down;
  const db = getDb();
  const session = await getSession();
  const [inductions, estimates, jobs, schedule] = await Promise.all([
    listInductionsWithRounds(db, session),
    publishedEstimates(db, session),
    listJobs(db, session).catch(() => null),
    latestSchedule(db, session).catch(() => null),
  ]);
  const latest = inductions[0];
  const today = todayPk();
  const events: Ev[] = [];
  let cycle: ReturnType<typeof cycleProgress> | null = null;
  if (latest) {
    // A list is dated by the day it came in; a bulk import brings several on one day, so keep the latest of each day.
    const byDay = new Map<string, (typeof latest.rounds)[number]>();
    for (const r of latest.rounds) { const d = isoDay(r.importedAt); if (!byDay.has(d) || byDay.get(d)!.roundNo < r.roundNo) byDay.set(d, r); }
    for (const [d, r] of byDay) events.push({ date: d, kind: "list", label: `Round ${r.roundNo} list`, note: `${r.allocations.toLocaleString("en-US")} seats`, href: `/portal/history/${latest.id}/rounds/${r.roundNo}` });
    const first = latest.rounds[0];
    if (first?.startsOn && first.endsOn) {
      cycle = cycleProgress({ startsOn: first.startsOn, endsOn: first.endsOn, published: latest.rounds.length, expectedRounds: inductions[1]?.rounds.length, today: new Date(`${today}T00:00:00Z`) });
      events.push({ date: first.startsOn, kind: "cycle", label: `${first.cycleName} cycle starts` }, { date: first.endsOn, kind: "cycle", label: `${first.cycleName} cycle ends` });
      for (const r of cycle.rounds) if (r.state !== "published") events.push({ date: r.estimatedOn, kind: "expected", label: `Round ${r.roundNo} (expected)`, note: "Estimated from the cycle dates; PHF does not date rounds" });
    }
  }
  // PHF's own schedule: each step's opening and closing day (Pakistan time).
  const pkDay = (d: Date) => new Date(d.getTime() + 5 * 3_600_000).toISOString().slice(0, 10);
  for (const st of schedule?.rows ?? []) {
    if (st.startsAt) events.push({ date: pkDay(st.startsAt), kind: "phf", label: `${st.title} opens`, note: `PHF schedule · induction ${schedule!.induction}` });
    if (st.endsAt && (!st.startsAt || pkDay(st.endsAt) !== pkDay(st.startsAt))) events.push({ date: pkDay(st.endsAt), kind: "phf", label: `${st.title} closes`, note: `PHF schedule · induction ${schedule!.induction}` });
  }
  for (const e of estimates.filter((x) => !x.official)) events.push({ date: isoDay(e.publishedAt), kind: "estimate", label: `Estimated round ${e.roundNo}`, href: `/portal/estimates?run=${e.id}` });
  for (const j of jobs?.jobs ?? []) if (j.lastDate && j.state !== "closed") events.push({ date: j.lastDate, kind: "job", label: j.title, href: `/portal/jobs?job=${j.id}` });
  events.sort((a, b) => a.date.localeCompare(b.date));

  const [ty, tm] = today.split("-").map(Number) as [number, number];
  const m = /^(\d{4})-(\d{2})$/.exec(searchParams ? ((await searchParams).m ?? "") : "");
  const year = m ? Number(m[1]) : ty, month = m ? Number(m[2]) : tm;
  const first = new Date(Date.UTC(year, month - 1, 1));
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7; // Monday first
  const key = (d: number) => `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const byDay = new Map<string, Ev[]>();
  for (const e of events) (byDay.get(e.date) ?? byDay.set(e.date, []).get(e.date)!).push(e);
  const shift = (n: number) => { const d = new Date(Date.UTC(year, month - 1 + n, 1)); return `/portal/calendar?m=${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
  const coming = events.filter((e) => e.date >= today && e.kind !== "job").slice(0, 6);
  const comingJobs = events.filter((e) => e.date >= today && e.kind === "job").slice(0, 4);
  const done = events.filter((e) => e.date < today && e.kind === "list").slice(-2).reverse();
  const nextRound = cycle?.next;
  const daysTo = nextRound ? Math.round((Date.parse(`${nextRound.estimatedOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000) : null;

  // The nearest PHF step that is open now and closes soonest: the countdown.
  const openStep = (schedule?.rows ?? []).filter((r) => r.endsAt && r.endsAt > new Date() && (!r.startsAt || r.startsAt <= new Date())).sort((a, b) => a.endsAt!.getTime() - b.endsAt!.getTime())[0];
  const leftMs = openStep ? openStep.endsAt!.getTime() - new Date().getTime() : 0;
  const deadline = openStep ? { title: openStep.title, d: Math.floor(leftMs / 86_400_000), h: Math.floor((leftMs % 86_400_000) / 3_600_000), m: Math.floor((leftMs % 3_600_000) / 60_000) } : null;
  const followingInd = latest ? await isFollowing(db, session, { kind: "induction", key: String(latest.id) }).catch(() => false) : false;

  return (
    <AreaPage area="portal" trail={[{ label: s.label }]} title={latest ? `Induction ${latest.id} calendar` : s.label} bare>
      <AuroraHeader as="section" className="flex flex-wrap items-end justify-between gap-5 px-5 py-[22px] sm:px-6">
        <div className="min-w-0">
          <p className="text-[13px] text-[#F3EEE5]/70"><Link href="/portal/history" className="hover:underline">Merit lists</Link>{latest ? <> / <Link href={`/portal/history/${latest.id}`} className="hover:underline">Induction {latest.id}</Link></> : null}</p>
          <h1 className="mt-1.5 text-[2rem] font-bold tracking-[-0.03em]">{latest ? `Induction ${latest.id} · ${latest.rounds[0]?.cycleName ?? ""}` : s.label}</h1>
          {latest ? (
            <nav aria-label="Induction" className="mn-seg mn-seg-iv mt-3 w-max max-w-full overflow-x-auto">
              <Link href={`/portal/history/${latest.id}`}>Overview</Link>
              {latest.rounds.length > 1 ? <Link href={`/portal/history/${latest.id}/compare?from=${latest.rounds.at(-2)!.roundNo}&to=${latest.rounds.at(-1)!.roundNo}`}>Movement</Link> : null}
              <Link href="/portal/estimates">Predictions</Link>
              <Link href="/portal/calendar" aria-current="page">Calendar</Link>
              <Link href={`/portal/community?topic=${encodeURIComponent(`induction|${latest.id}`)}&tab=questions`}>Questions</Link>
            </nav>
          ) : null}
        </div>
        {deadline ? (
          <div className="flex flex-wrap items-end gap-2.5">
            <div>
              <p className="mb-2 text-[13px] text-[#E5A04B]"><span className="mn-live">●</span> {deadline.title} closes in</p>
              <div className="flex gap-2">
                {([[deadline.d, deadline.d === 1 ? "day" : "days"], [deadline.h, "hours"], [deadline.m, "min"]] as const).map(([v, l]) => (
                  <span key={l} className="grid min-w-[5.5rem] place-items-center rounded-xl border border-[rgba(229,160,75,.45)] bg-black/20 px-3 py-2"><span className="text-3xl font-bold tabular-nums">{String(v).padStart(2, "0")}</span><span className="text-[11px] text-[#F3EEE5]/65">{l}</span></span>
                ))}
              </div>
            </div>
            {latest ? <FollowButton target={{ kind: "induction", key: String(latest.id) }} following={followingInd} path="/portal/calendar" label="Remind me" /> : null}
          </div>
        ) : latest ? (
          <div className="flex gap-6">
            <AuroraStat label="Lists out" value={latest.rounds.length} />
            <AuroraStat label={nextRound ? `Round ${nextRound.roundNo}` : "Next round"} value={daysTo == null ? "—" : daysTo <= 0 ? (nextRound!.overdue ? "Due" : "Today") : `${daysTo} d`} hint={nextRound ? "expected" : undefined} />
            <AuroraStat label="Cycle" value={cycle ? `${cycle.pct}%` : "—"} hint={cycle?.status} />
          </div>
        ) : null}
      </AuroraHeader>
      {!latest ? <EmptyState title="No induction yet">Dates appear once the first merit list of an induction is in.</EmptyState> : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <Card>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-heading">{MONTHS[month - 1]} {year}</h2>
              <div className="flex items-center gap-1">
                <Link href={shift(-1)} aria-label="Previous month" className="mn-btn-ghost grid h-9 w-9 place-items-center rounded-lg">‹</Link>
                <Link href="/portal/calendar" className="mn-btn-ghost rounded-lg px-3 py-1.5 text-sm">Today</Link>
                <Link href={shift(1)} aria-label="Next month" className="mn-btn-ghost grid h-9 w-9 place-items-center rounded-lg">›</Link>
              </div>
            </div>
            <ul className="mb-3 flex flex-wrap gap-3 text-xs text-muted">
              {(Object.keys(KIND) as Kind[]).map((k) => <li key={k} className="flex items-center gap-1.5"><span className={cn("h-2 w-2 rounded-full", KIND[k].dot)} />{KIND[k].label}</li>)}
            </ul>
            <div className="grid grid-cols-7 gap-1 text-center text-[0.7rem] font-semibold uppercase tracking-wide text-subtle">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="py-1">{d}</div>)}
            </div>
            <ol className="grid grid-cols-7 gap-1">
              {Array.from({ length: lead }, (_, i) => <li key={`x${i}`} aria-hidden />)}
              {Array.from({ length: days }, (_, i) => {
                const d = key(i + 1);
                const evs = byDay.get(d) ?? [];
                const isToday = d === today;
                return (
                  <li key={d} className={cn("min-h-16 rounded-lg border p-1.5 text-left sm:min-h-20", isToday ? "border-violet-soft shadow-[0_0_18px_var(--mn-violet-glow)]" : evs.length ? "border-line-strong bg-hover/40" : "border-line")}>
                    <span className={cn("text-xs tabular-nums", isToday ? "font-bold text-violet-pale" : "text-muted")}>{i + 1}</span>
                    <span className="sr-only">{evs.map((e) => e.label).join(", ")}</span>
                    <span aria-hidden className="mt-1 flex flex-wrap gap-1">
                      {evs.slice(0, 4).map((e, j) => <span key={j} title={e.label} className={cn("h-2 w-2 rounded-full", KIND[e.kind].dot, e.kind !== "job" && "shadow-[0_0_8px_currentColor]")} />)}
                    </span>
                    {evs[0] && evs[0].kind !== "job" ? <span className="mt-1 hidden truncate text-[0.68rem] text-ink lg:block">{evs[0].label}</span> : null}
                  </li>
                );
              })}
            </ol>
          </Card>

          <div className="grid content-start gap-5">
            <Card>
              <CardHeader title="What's coming" description={schedule ? "PHF dates come from PHF's own schedule. Expected rounds are spread across the cycle; the real day can differ." : "Expected dates are spread across PHF's cycle dates; the real day can differ."} />
              {coming.length ? (
                <ol className="grid gap-3">
                  {coming.map((e, i) => <EventRow key={i} e={e} />)}
                </ol>
              ) : <p className="text-sm text-muted">Nothing dated ahead for this induction.</p>}
              {done.length ? (
                <>
                  <p className="mt-5 text-xs font-semibold uppercase tracking-[0.12em] text-subtle">Done</p>
                  <ol className="mt-2 grid gap-3">{done.map((e, i) => <EventRow key={i} e={e} />)}</ol>
                </>
              ) : null}
            </Card>
            {comingJobs.length ? (
              <Card>
                <CardHeader title="Job adverts closing" action={<Link href="/portal/jobs?state=closing" className="text-sm font-semibold text-signal hover:underline">Jobs →</Link>} />
                <ol className="grid gap-3">{comingJobs.map((e, i) => <EventRow key={i} e={e} />)}</ol>
              </Card>
            ) : null}
          </div>
        </div>
      )}
    </AreaPage>
  );
}

const ROW_TONE: Record<Kind, string> = { phf: "#E5A04B", list: "#3DDC97", expected: "#5CE1E6", estimate: "#C4B8FF", cycle: "#5CE1E6", job: "#FF7A7A" };

function EventRow({ e }: { e: Ev }) {
  const today = e.date === todayPk();
  const body = (
    <>
      <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: ROW_TONE[e.kind] }}>{nice(e.date)} · {KIND[e.kind].label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-heading">{e.label}</p>
      {e.note ? <p className="mt-0.5 text-xs text-muted">{e.note}</p> : null}
    </>
  );
  const cls = today
    ? "block rounded-[14px] border border-[rgba(229,160,75,.5)] bg-[linear-gradient(135deg,rgba(229,160,75,.12),rgba(23,23,28,.82))] p-3 shadow-[0_0_22px_rgba(229,160,75,.15)]"
    : "block rounded-[14px] border border-white/[.07] bg-[rgba(23,23,28,.82)] p-3 transition-colors hover:border-[rgba(155,135,255,.35)]";
  return <li>{e.href ? <Link href={e.href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>}</li>;
}
