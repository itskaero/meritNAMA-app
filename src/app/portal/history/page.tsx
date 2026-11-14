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
import { Pill, Segmented } from "@/components/ui/segmented";
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

const IVORY = "text-[#F3EEE5]";
const IVORY_DIM = "text-[#F3EEE5]/65";
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

  return (
    <AreaPage {...frame} bare>
      <AuroraHeader as="section" className="grid gap-5 p-5 sm:p-7">
        <p className={cn("flex items-center gap-2 text-xs", IVORY_DIM)}>
          <span aria-hidden className={cn("h-2 w-2 rounded-full", running ? "bg-success shadow-[0_0_10px_var(--mn-success)]" : "bg-white/40")} />
          Round {last.roundNo} of induction {latest.id} is {running ? "live" : "the last list"}
        </p>
        <div>
          <h1 className={cn("text-3xl font-semibold tracking-tight sm:text-4xl", IVORY)}>Merit lists</h1>
          {now?.medianClosing != null ? (
            <p className={cn("mt-1 text-sm", IVORY_DIM)}>
              Round {last.roundNo} closed at a median of <span className={cn("font-semibold", IVORY)}>{formatMarks(now.medianClosing)}</span>
              {delta != null ? <>, <span className={delta <= 0 ? "text-success" : "text-danger"}>{Math.abs(delta).toFixed(2)} {delta <= 0 ? "lower" : "higher"}</span> than round {before!.roundNo}</> : null}.
              {prev ? ` Merit fell in ${fellIn} of ${specs} specialities.` : ""}
            </p>
          ) : null}
        </div>
        <form method="get" action="/portal/history/find" role="search" className="flex max-w-2xl gap-2">
          <label className="sr-only" htmlFor="find-q">Find anyone</label>
          <input id="find-q" name="q" autoComplete="off" placeholder="Find anyone: name, PMDC number or applicant ID" className="h-11 min-w-0 flex-1 rounded-xl border border-white/15 bg-black/25 px-4 text-sm text-[#F3EEE5] placeholder:text-[#F3EEE5]/45" />
          <button type="submit" className="mn-btn h-11 rounded-xl px-5 text-sm font-semibold">Find</button>
        </form>
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {([["Inductions", fmt(overview.inductions)], ["Rounds published", fmt(overview.rounds)], ["Allocations on record", fmt(overview.allocations)], ["Next list", nextText]] as const).map(([l, v], i) => (
            <div key={l} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <dt className={cn("text-xs", IVORY_DIM)}>{l}</dt>
              <dd className={cn("mt-1 truncate text-2xl font-semibold tabular-nums", i === 3 ? "text-amber" : IVORY)}>{v}</dd>
            </div>
          ))}
        </dl>
      </AuroraHeader>

      {ticker.length ? (
        <div className="-mx-1 overflow-x-auto rounded-xl border border-line bg-card px-4 py-2.5" aria-label={`Biggest moves in round ${last.roundNo}`}>
          <ul className="flex gap-6 whitespace-nowrap text-sm">
            {ticker.map((g) => (
              <li key={`${g.program}|${g.quota}|${g.speciality}|${g.hospital}`} className="text-muted">
                {g.speciality} · {g.hospital.split(",")[0]} <span className={g.delta < 0 ? "text-success" : "text-danger"}>{g.delta < 0 ? "▼" : "▲"} {Math.abs(g.delta).toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-3">
        {biggestFall && biggestFall.delta < 0 ? (
          <Link href={`/portal/history/${latest.id}/rounds/${last.roundNo}?speciality=${encodeURIComponent(biggestFall.speciality)}`} className="rounded-2xl border border-line bg-card p-4 hover:border-success/40">
            <p className="text-xs text-muted">↘ Biggest fall this round</p>
            <p className="mt-1 truncate font-semibold text-heading">{biggestFall.speciality} · {biggestFall.hospital.split(",")[0]}</p>
            <p className="text-2xl font-semibold tabular-nums text-success">▼ {Math.abs(biggestFall.delta).toFixed(2)}</p>
          </Link>
        ) : null}
        {hardest ? (
          <Link href={`/portal/history/${latest.id}/rounds/${last.roundNo}?speciality=${encodeURIComponent(hardest.speciality)}`} className="rounded-2xl border border-line bg-card p-4 hover:border-danger/40">
            <p className="text-xs text-muted">↗ Hardest seat</p>
            <p className="mt-1 truncate font-semibold text-heading">{hardest.speciality} · {hardest.hospital.split(",")[0]}</p>
            <p className="font-mono text-2xl font-semibold tabular-nums text-danger">{formatMarks(hardest.closing)}</p>
          </Link>
        ) : null}
        <Link href={est ? `/portal/estimates?run=${est.id}` : "/portal/calendar"} className="rounded-2xl border border-line bg-card p-4 hover:border-violet-soft/40">
          <p className="text-xs text-muted">◷ Coming next</p>
          <p className="mt-1 font-semibold text-heading">{est ? `Estimated round ${est.roundNo}` : running ? `Round ${last.roundNo + 1}` : nextPhf ? nextPhf.title : "Next induction"}</p>
          <p className="flex items-center justify-between gap-2 text-xl font-semibold text-amber">
            <span>{est ? "Out now" : nextPhf ? nextPhf.when : running ? "after consent" : "not announced"}</span>
            {est ? <Pill tone="violet">Estimate</Pill> : null}
          </p>
        </Link>
      </div>

      <EstimateListCard estimates={estimates} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Card>
          <CardHeader title="Inductions" action={<Segmented label="Show" items={[
            { href: "/portal/history", label: "All", active: show === "all" },
            { href: "/portal/history?show=same", label: "Scored like now", active: show === "same" },
            { href: "/portal/history?show=running", label: "Running", active: show === "running" },
          ]} />} />
          {shown.length ? (
            <div className="-mx-5 overflow-x-auto sm:-mx-6">
              <table className="w-full min-w-[48rem] text-sm">
                <thead className="text-left text-xs text-subtle">
                  <tr><th className="px-5 py-2 font-medium sm:px-6">Induction</th><th className="px-2 py-2 font-medium">Rounds</th><th className="px-2 py-2 text-right font-medium">Allocations</th><th className="px-2 py-2 text-right font-medium">Median</th><th className="px-2 py-2 pr-5 font-medium sm:pr-6">Scoring</th></tr>
                </thead>
                <tbody>
                  {shown.map((ind) => {
                    const t = tl.get(ind.id) ?? [];
                    const lastT = t.at(-1);
                    const isRunning = ind.id === latest.id && running;
                    const estHere = estimates.find((e) => !e.official && e.induction === ind.id);
                    const same = ind.maxMarks === latest.maxMarks;
                    return (
                      <tr key={ind.id} className="border-t border-line">
                        <td className="px-5 py-2.5 sm:px-6">
                          <Link href={`/portal/history/${ind.id}`} className="whitespace-nowrap font-semibold text-heading hover:underline">Induction {ind.id}</Link>
                          {isRunning ? <Pill tone="success" className="ml-2">Running</Pill> : null}
                          <span className="block text-xs text-muted">{ind.rounds[0]!.cycleName}</span>
                        </td>
                        <td className="px-2 py-2.5">
                          <ol className="flex gap-1">
                            {ind.rounds.map((r) => (
                              <li key={r.roundNo}>
                                <Link href={`/portal/history/${ind.id}/rounds/${r.roundNo}`} title={`${fmt(r.allocations)} allocations`}
                                  className={cn("grid h-8 min-w-10 place-items-center rounded-lg px-2 text-xs font-semibold", r.roundNo === ind.rounds.at(-1)!.roundNo && isRunning ? "mn-btn" : "border border-line bg-hover/40 text-muted hover:text-ink")}>R{r.roundNo}</Link>
                              </li>
                            ))}
                            {estHere ? <li><Link href={`/portal/estimates?run=${estHere.id}`} className="grid h-8 min-w-10 place-items-center rounded-lg border border-dashed border-amber/60 px-2 text-xs font-semibold text-amber">R{estHere.roundNo}</Link></li> : null}
                          </ol>
                        </td>
                        <td className="px-2 py-2.5 text-right font-mono tabular-nums">{lastT ? fmt(lastT.allocations) : "—"}</td>
                        <td className="px-2 py-2.5 text-right font-mono tabular-nums">{lastT?.medianClosing != null ? formatMarks(lastT.medianClosing) : "—"}</td>
                        <td className="px-2 py-2.5 pr-5 sm:pr-6">{ind.maxMarks ? <span className={cn("whitespace-nowrap rounded-md px-2 py-0.5 text-xs", same ? "bg-[var(--mn-violet-fill)] text-violet-pale" : "bg-hover text-muted")}>out of {ind.maxMarks}{same && ind.id === latest.id ? " · now" : ""}</span> : null}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <p className="text-sm text-muted">No induction matches.</p>}
          <p className="mt-3 text-xs text-muted">Grey scoring was different from today&apos;s, so compare with care.</p>
        </Card>

        <div className="grid content-start gap-5">
          {searches.length ? (
            <Card>
              <CardHeader title="Searched right now" action={<Pill tone="success">live</Pill>} />
              <ul className="grid gap-1.5 text-sm">{searches.map((x) => <li key={x.key} className="flex justify-between gap-3"><span className="truncate">{x.label}</span><span className="tabular-nums text-muted">{fmt(x.n)}</span></li>)}</ul>
            </Card>
          ) : null}
          {now ? (
            <Card>
              <CardHeader title={`Round ${now.roundNo} in numbers`} />
              {now.accepted + now.rejected + now.notAvail ? (
                <>
                  <div className="flex h-7 gap-1 overflow-hidden rounded-lg" aria-hidden>
                    <span className="bg-success" style={{ flex: now.accepted }} />
                    <span className="bg-danger" style={{ flex: now.rejected }} />
                    <span className="bg-white/20" style={{ flex: now.notAvail }} />
                  </div>
                  <p className="mt-2 flex flex-wrap gap-x-3 text-xs text-muted">
                    <span className="text-success">● Accepted {Math.round((now.accepted / now.allocations) * 100)}%</span>
                    <span className="text-danger">● Rejected {Math.round((now.rejected / now.allocations) * 100)}%</span>
                    <span>● N/A {Math.round((now.notAvail / now.allocations) * 100)}%</span>
                  </p>
                </>
              ) : <p className="text-sm text-muted">{fmt(now.allocations)} allocations, {fmt(now.applicants)} candidates. Consent is not on this list.</p>}
              <Link href={`/portal/history/${latest.id}/rounds/${now.roundNo}`} className="mn-btn-ghost mt-3 inline-flex h-9 w-full items-center justify-center rounded-lg text-sm">Open round {now.roundNo}</Link>
            </Card>
          ) : null}
        </div>
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
