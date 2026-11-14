import Link from "next/link";
import { AreaPage } from "@/components/area-page";
import { ChartSource } from "@/components/charts/chart-source";
import { LineChart } from "@/components/charts/line-chart";
import { whenDatabaseDown } from "@/components/database-unavailable";
import { EstimateListCard } from "@/components/estimate-list-card";
import { AuroraHeader } from "@/components/ui/aurora-header";
import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { cycleSteps } from "@/lib/admin/today";
import { getSession } from "@/lib/auth/session";
import { topSearches } from "@/lib/data/activity";
import { inductionTimeline, listInductionsWithRounds, meritOverview, roundGroups, seatTrends } from "@/lib/data/merit";
import { inductionRunning } from "@/lib/data/predictions";
import { latestSchedule } from "@/lib/data/schedule";
import { publishedEstimates } from "@/lib/data/simulation";
import { getDb } from "@/lib/db/client";
import { formatMarks } from "@/lib/format";
import { findSection } from "@/lib/navigation";

export const metadata = { title: "Merit lists" };
export const dynamic = "force-dynamic";

const fmt = (n: number) => n.toLocaleString("en-US");
const FILTERS = ["all", "same", "running"] as const;

/** Every merit list: search, what moved in the latest round, and every induction with its rounds. */
export default async function MeritListsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const s = findSection("/portal/history");
  const down = await whenDatabaseDown({ area: "portal", trail: [{ label: s.label }], title: s.label, description: s.description });
  if (down) return down;
  const db = getDb();
  const session = await getSession();
  const asked = (await searchParams).show;
  const show = (FILTERS as readonly string[]).includes(asked ?? "") ? asked! : "all";
  const [inductions, overview, seats, estimates, searches, schedule] = await Promise.all([
    listInductionsWithRounds(db, session), meritOverview(db, session), seatTrends(db, session), publishedEstimates(db, session),
    topSearches(db, session, { limit: 5 }).catch(() => []), latestSchedule(db, session),
  ]);
  const frame = { area: "portal" as const, trail: [{ label: s.label }], title: s.label, description: s.description };
  if (!inductions.length) return <AreaPage {...frame}><EmptyState title="No merit lists yet">Merit rounds appear here once they are imported.</EmptyState></AreaPage>;

  const latest = inductions[0]!;
  const last = latest.rounds.at(-1)!;
  const prev = latest.rounds.at(-2) ?? null;
  const [timelines, running, groups] = await Promise.all([
    Promise.all(inductions.map((i) => inductionTimeline(db, session, i.id))),
    inductionRunning(db, latest.id),
    roundGroups(db, session, last.id, prev?.id ?? null),
  ]);
  const tl = new Map(inductions.map((i, n) => [i.id, timelines[n]!]));
  const now = tl.get(latest.id)!.at(-1);
  const before = tl.get(latest.id)!.at(-2);
  const moved = groups.filter((g) => g.closing != null && g.prevClosing != null).map((g) => ({ ...g, delta: g.closing! - g.prevClosing! }));
  const fellIn = new Set(moved.filter((g) => g.delta < -0.005).map((g) => g.speciality)).size;
  const specs = new Set(groups.map((g) => g.speciality)).size;
  const biggestFall = [...moved].sort((a, b) => a.delta - b.delta)[0];
  const hardest = [...groups].filter((g) => g.closing != null).sort((a, b) => b.closing! - a.closing!)[0];
  const ticker = [...moved].filter((g) => Math.abs(g.delta) > 0.005).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 12);
  const est = estimates.find((e) => !e.official && e.induction === latest.id);
  const nextPhf = schedule && schedule.induction >= latest.id ? cycleSteps(schedule.rows, new Date()).find((x) => x.state === "next") : null;
  const nextText = est ? `R${est.roundNo} estimate out` : running ? `R${last.roundNo + 1} after consent` : nextPhf ? nextPhf.title : "Cycle over";
  const shown = inductions.filter((i) => (show === "running" ? i.id === latest.id && running : show === "same" ? i.maxMarks === latest.maxMarks : true));
  const delta = now?.medianClosing != null && before?.medianClosing != null ? now.medianClosing - before.medianClosing : null;

  const short = (h: string) => h.split(",")[0]!;
  const spark = (d: string, c: string, rgb: string) => (
    <svg aria-hidden width="110" height="40" viewBox="0 0 110 40" className="flex-none"><path className="mn-draw-line" d={d} fill="none" stroke={c} strokeWidth="2.5" style={{ filter: `drop-shadow(0 0 5px rgba(${rgb},0.7))` }} /></svg>
  );

  return (
    <AreaPage {...frame} bare>
      <AuroraHeader as="section" className="grid gap-[18px] px-5 py-[22px] sm:px-6">
        <div className="grid gap-3.5">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[13px] text-[#F3EEE5]/[.68]">
              <span aria-hidden className={cn("h-2 w-2 rounded-full", running ? "mn-live bg-[#3DDC97] shadow-[0_0_10px_#3DDC97]" : "bg-white/40")} />
              Round {last.roundNo} of induction {latest.id} is {running ? "live" : "the last list"}
            </p>
            <h1 className="mt-2 text-[2rem] font-bold tracking-[-0.03em] sm:text-[36px]">Merit lists</h1>
            {now?.medianClosing != null ? (
              <p className="mt-1.5 max-w-[700px] text-sm text-[#F3EEE5]/[.68]">
                Round {last.roundNo} closed at a median of <b className="text-[#F3EEE5]">{formatMarks(now.medianClosing)}</b>
                {delta != null ? <>, <span className={delta <= 0 ? "text-[#3DDC97]" : "text-[#FF7A7A]"}>{Math.abs(delta).toFixed(2)} {delta <= 0 ? "lower" : "higher"}</span> than round {before!.roundNo}</> : null}.
                {prev ? ` Merit fell in ${fellIn} of ${specs} specialities.` : ""}
              </p>
            ) : null}
          </div>
          <form method="get" action="/portal/history/find" role="search" className="flex w-full max-w-[460px] gap-2">
            <label className="flex h-11 flex-1 items-center gap-2 rounded-xl border border-[#F3EEE5]/[.18] bg-[rgba(16,36,58,.55)] px-3.5 text-[#F3EEE5]/60">
              <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <span className="sr-only">Find anyone</span>
              <input name="q" autoComplete="off" placeholder="Find anyone: name, PMDC or ID" className="h-full min-w-0 flex-1 bg-transparent text-sm text-[#F3EEE5] outline-none placeholder:text-[#F3EEE5]/60" />
            </label>
            <button type="submit" className="mn-btn h-11 rounded-xl px-[18px] text-[13px] font-semibold">Find</button>
          </form>
        </div>
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {([["Inductions", fmt(overview.inductions)], ["Rounds published", fmt(overview.rounds)], ["Allocations on record", fmt(overview.allocations)], ["Next list", nextText]] as const).map(([l, v], i) => (
            <div key={l} className="mn-glass"><dt className="text-xs text-[#F3EEE5]/[.68]">{l}</dt><dd className={cn("mt-1 truncate text-2xl font-bold tabular-nums", i === 3 && "text-[#E5A04B]")}>{v}</dd></div>
          ))}
        </dl>
      </AuroraHeader>

      {ticker.length ? (
        <div aria-label={`Biggest moves in round ${last.roundNo}`} className="overflow-hidden whitespace-nowrap rounded-xl border border-white/[.07] bg-[rgba(23,23,28,.82)] py-2.5 text-[13px]">
          <div className="mn-ticker pl-4">
            {[...ticker, ...ticker].map((g, i) => (
              <span key={i} aria-hidden={i >= ticker.length ? true : undefined}>
                <span className="text-muted">{g.speciality} · {short(g.hospital)}</span>{" "}
                <span className={g.delta < 0 ? "text-[#3DDC97]" : "text-[#FF7A7A]"}>{g.delta < 0 ? "▼" : "▲"} {Math.abs(g.delta).toFixed(2)}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {biggestFall && biggestFall.delta < 0 ? (
          <Link href={`/portal/history/${latest.id}/rounds/${last.roundNo}?tab=closing&speciality=${encodeURIComponent(biggestFall.speciality)}`} className="mn-card-glass mn-hover rounded-[20px] border border-line p-4">
            <p className="text-xs text-muted">↘ Biggest fall this round</p>
            <div className="mt-2 flex items-end justify-between gap-2">
              <div className="min-w-0"><b className="block truncate">{biggestFall.speciality} · {short(biggestFall.hospital)}</b><p className="mt-1 text-[22px] font-bold text-[#3DDC97]">▼ {Math.abs(biggestFall.delta).toFixed(2)}</p></div>
              {spark("M2 6 C25 8, 40 16, 60 22 S 95 34, 108 36", "#3DDC97", "61,220,151")}
            </div>
          </Link>
        ) : null}
        {hardest ? (
          <Link href={`/portal/history/${latest.id}/rounds/${last.roundNo}?tab=closing&speciality=${encodeURIComponent(hardest.speciality)}`} className="mn-card-glass mn-hover rounded-[20px] border border-line p-4">
            <p className="text-xs text-muted">↗ Hardest seat</p>
            <div className="mt-2 flex items-end justify-between gap-2">
              <div className="min-w-0"><b className="block truncate">{hardest.speciality} · {short(hardest.hospital)}</b><p className="mt-1 font-mono text-[22px] font-bold text-[#FF7A7A]">{formatMarks(hardest.closing)}</p></div>
              {spark("M2 36 C25 34, 45 26, 62 20 S 95 8, 108 4", "#FF7A7A", "255,122,122")}
            </div>
          </Link>
        ) : null}
        <Link href={est ? `/portal/estimates?run=${est.id}` : "/portal/calendar"} className="mn-card-glass mn-hover rounded-[20px] border border-line p-4">
          <p className="text-xs text-muted">◷ Coming next</p>
          <div className="mt-2 flex items-end justify-between gap-2">
            <div className="min-w-0"><b className="block truncate">{est ? `Estimated round ${est.roundNo}` : running ? `Round ${last.roundNo + 1}` : nextPhf ? nextPhf.title : "Next induction"}</b><p className="mt-1 text-[22px] font-bold text-[#E5A04B]">{est ? "Out now" : nextPhf ? nextPhf.when : running ? "After consent" : "Not announced"}</p></div>
            {est ? <span className="mn-pill v">Estimate</span> : null}
          </div>
        </Link>
      </div>

      <EstimateListCard estimates={estimates} />

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section aria-labelledby="inds" className="mn-card-glass overflow-hidden rounded-[20px] border border-line">
          <header className="flex flex-wrap items-center justify-between gap-3 px-4 pb-2.5 pt-4">
            <h2 id="inds" className="text-[15px] font-semibold text-heading">Inductions</h2>
            <nav aria-label="Show" className="mn-seg">
              <Link href="/portal/history" aria-current={show === "all" ? "page" : undefined}>All</Link>
              <Link href="/portal/history?show=same" aria-current={show === "same" ? "page" : undefined}>Scored like now</Link>
              <Link href="/portal/history?show=running" aria-current={show === "running" ? "page" : undefined}>Running</Link>
            </nav>
          </header>
          <div className="overflow-x-auto">
            <table className="mn-tbl min-w-[46rem]">
              <thead><tr><th scope="col">Induction</th><th scope="col">Rounds</th><th scope="col" className="!text-right">Allocations</th><th scope="col" className="!text-right">Median</th><th scope="col">Scoring</th></tr></thead>
              <tbody>
                {shown.map((ind) => {
                  const t = tl.get(ind.id) ?? [];
                  const lastT = t.at(-1), beforeT = t.at(-2);
                  const isRunning = ind.id === latest.id && running;
                  const estHere = estimates.find((e) => !e.official && e.induction === ind.id);
                  const same = ind.maxMarks === latest.maxMarks;
                  return (
                    <tr key={ind.id}>
                      <td>
                        <Link href={`/portal/history/${ind.id}`} className="whitespace-nowrap font-bold text-ink">Induction {ind.id}</Link>
                        {isRunning ? <span className="mn-pill g ml-1.5"><span className="mn-live">●</span> Running</span> : null}
                        <span className="block text-xs text-muted">{ind.rounds[0]!.cycleName}</span>
                      </td>
                      <td>
                        <span className="flex gap-[5px]">
                          {ind.rounds.map((r) => (
                            <Link key={r.roundNo} href={`/portal/history/${ind.id}/rounds/${r.roundNo}`} title={`${fmt(r.allocations)} allocations`} className={cn("mn-chip", isRunning && r.roundNo === ind.rounds.at(-1)!.roundNo && "on")}>R{r.roundNo}</Link>
                          ))}
                          {estHere ? <Link href={`/portal/estimates?run=${estHere.id}`} className="mn-chip est">R{estHere.roundNo}</Link> : null}
                        </span>
                      </td>
                      <td className="text-right font-mono">{lastT ? fmt(lastT.allocations) : "—"}</td>
                      <td className="whitespace-nowrap text-right font-mono">
                        {lastT?.medianClosing != null ? formatMarks(lastT.medianClosing) : "—"}
                        {lastT?.medianClosing != null && beforeT?.medianClosing != null ? <span className={lastT.medianClosing <= beforeT.medianClosing ? "text-[#3DDC97]" : "text-[#FF7A7A]"}> {lastT.medianClosing <= beforeT.medianClosing ? "▼" : "▲"}</span> : null}
                      </td>
                      <td>{ind.maxMarks ? <span className={cn("mn-pill", same ? "v" : "n")}>out of {ind.maxMarks}{same && ind.id === latest.id ? " · now" : ""}</span> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="border-t border-white/5 px-4 pb-3.5 pt-3 text-xs text-muted">Grey scoring was different from today&apos;s, so compare with care.</p>
        </section>

        <aside className="grid gap-4">
          {searches.length ? (
            <section className="mn-card-glass rounded-[20px] border border-line p-4">
              <div className="flex items-center justify-between"><h2 className="text-[15px] font-semibold text-heading">Searched right now</h2><span className="mn-pill g"><span className="mn-live">●</span> live</span></div>
              <ol className="mt-3 grid gap-2.5 text-[13px]">{searches.map((x) => <li key={x.key} className="flex justify-between gap-3"><span className="truncate">{x.label}</span><span className="text-muted">{fmt(x.n)}</span></li>)}</ol>
            </section>
          ) : null}
          {now ? (
            <section className="mn-card-glass rounded-[20px] border border-line p-4">
              <h2 className="text-[15px] font-semibold text-heading">Round {now.roundNo} in numbers</h2>
              {now.accepted + now.rejected + now.notAvail ? (
                <>
                  <div aria-hidden className="mt-3.5 flex h-7 gap-[3px]">
                    <span className="rounded-md bg-[#3DDC97] shadow-[0_0_12px_rgba(61,220,151,.4)]" style={{ flex: now.accepted }} />
                    <span className="rounded-md bg-[#FF7A7A]" style={{ flex: now.rejected }} />
                    <span className="rounded-md bg-white/20" style={{ flex: now.notAvail }} />
                  </div>
                  <p className="mt-2.5 flex flex-wrap gap-3 text-xs text-muted">
                    <span><span className="text-[#3DDC97]">●</span> Accepted {Math.round((now.accepted / now.allocations) * 100)}%</span>
                    <span><span className="text-[#FF7A7A]">●</span> Rejected {Math.round((now.rejected / now.allocations) * 100)}%</span>
                    <span>● N/A {Math.round((now.notAvail / now.allocations) * 100)}%</span>
                  </p>
                </>
              ) : <p className="mt-3 text-[13px] text-muted">{fmt(now.allocations)} allocations, {fmt(now.applicants)} candidates. Consent is not on this list.</p>}
              <Link href={`/portal/history/${latest.id}/rounds/${now.roundNo}`} className="mn-ob mt-3.5 w-full">Open round {now.roundNo}</Link>
            </section>
          ) : null}
        </aside>
      </div>

      {seats.inductions.length > 1 ? (
        <Card>
          <CardHeader title="Seats by induction" description="From each induction's seat matrix." />
          <LineChart title="Seats per induction, in total and by programme" xLabels={seats.inductions.map((i) => `I${i}`)}
            series={[{ label: "All programmes", values: seats.total }, ...seats.byProgram.map((p) => ({ label: p.program, values: p.values }))]}
            format={(v) => Math.round(v).toLocaleString("en-US")} height={220} />
          <ChartSource tone="official" data="seats" source="PHF seat matrices, one per induction" />
        </Card>
      ) : null}
    </AreaPage>
  );
}
