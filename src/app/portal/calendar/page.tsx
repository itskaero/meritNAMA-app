import Link from "next/link";
import { AreaPage } from "@/components/area-page";
import { whenDatabaseDown } from "@/components/database-unavailable";
import { Icon } from "@/components/icon";
import { AuroraStat } from "@/components/ui/aurora-header";
import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { Pill } from "@/components/ui/segmented";
import { getSession } from "@/lib/auth/session";
import { listJobs } from "@/lib/data/jobs";
import { listInductionsWithRounds } from "@/lib/data/merit";
import { publishedEstimates } from "@/lib/data/simulation";
import { getDb } from "@/lib/db/client";
import { cycleProgress } from "@/lib/domain/cycle";
import { todayPk } from "@/lib/jobs/rules";
import { findSection } from "@/lib/navigation";

export const metadata = { title: "Calendar" };
export const dynamic = "force-dynamic";

type Kind = "list" | "expected" | "estimate" | "cycle" | "job";
type Ev = { date: string; kind: Kind; label: string; note?: string; href?: string };
const KIND: Record<Kind, { label: string; dot: string; tone: "success" | "neutral" | "amber" | "info" | "violet" }> = {
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
  const [inductions, estimates, jobs] = await Promise.all([
    listInductionsWithRounds(db, session),
    publishedEstimates(db, session),
    listJobs(db, session).catch(() => null),
  ]);
  const latest = inductions[0];
  const today = todayPk();
  const events: Ev[] = [];
  let cycle: ReturnType<typeof cycleProgress> | null = null;
  if (latest) {
    for (const r of latest.rounds) events.push({ date: isoDay(r.importedAt), kind: "list", label: `Round ${r.roundNo} list`, note: `${r.allocations.toLocaleString("en-US")} seats`, href: `/portal/history/${latest.id}/rounds/${r.roundNo}` });
    const first = latest.rounds[0];
    if (first?.startsOn && first.endsOn) {
      cycle = cycleProgress({ startsOn: first.startsOn, endsOn: first.endsOn, published: latest.rounds.length, expectedRounds: inductions[1]?.rounds.length, today: new Date(`${today}T00:00:00Z`) });
      events.push({ date: first.startsOn, kind: "cycle", label: `${first.cycleName} cycle starts` }, { date: first.endsOn, kind: "cycle", label: `${first.cycleName} cycle ends` });
      for (const r of cycle.rounds) if (r.state !== "published") events.push({ date: r.estimatedOn, kind: "expected", label: `Round ${r.roundNo} (expected)`, note: "Estimated from the cycle dates; PHF does not date rounds" });
    }
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

  return (
    <AreaPage
      area="portal"
      trail={[{ label: s.label }]}
      title={latest ? `Induction ${latest.id} calendar` : s.label}
      description={s.description}
      aside={
        latest ? (
          <div className="grid grid-cols-3 gap-6">
            <AuroraStat label="Lists out" value={latest.rounds.length} />
            <AuroraStat label={nextRound ? `Round ${nextRound.roundNo}` : "Next round"} value={daysTo == null ? "—" : daysTo <= 0 ? (nextRound!.overdue ? "Due" : "Today") : `${daysTo} d`} hint={nextRound ? "expected, from cycle dates" : undefined} />
            <AuroraStat label="Cycle" value={cycle ? `${cycle.pct}%` : "—"} hint={cycle?.status} />
          </div>
        ) : null
      }
    >
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
              <CardHeader title="What's coming" description="Expected dates are spread across PHF's cycle dates; the real day can differ." />
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

function EventRow({ e }: { e: Ev }) {
  const body = (
    <>
      <span className="w-24 flex-none text-xs font-semibold uppercase tracking-wide text-muted">{nice(e.date)}</span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2"><Pill tone={KIND[e.kind].tone}>{KIND[e.kind].label}</Pill></span>
        <span className="mt-1 block truncate text-sm font-medium text-heading">{e.label}</span>
        {e.note ? <span className="block text-xs text-muted">{e.note}</span> : null}
      </span>
      {e.href ? <Icon name="arrow" className="h-4 w-4 flex-none text-decor" /> : null}
    </>
  );
  return <li>{e.href ? <Link href={e.href} className="flex items-start gap-3 rounded-lg p-1 hover:bg-hover/50">{body}</Link> : <div className="flex items-start gap-3 p-1">{body}</div>}</li>;
}
