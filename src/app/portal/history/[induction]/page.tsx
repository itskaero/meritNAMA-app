import Link from "next/link";
import { notFound } from "next/navigation";
import { AreaPage } from "@/components/area-page";
import { ChartSource } from "@/components/charts/chart-source";
import { MeritLadder } from "@/components/charts/merit-ladder";
import { MethodNote, PredictionBadge } from "@/components/charts/prediction-badge";
import { RoundColumns } from "@/components/charts/round-columns";
import { SeatFlow } from "@/components/charts/seat-flow";
import { DiscussionPanel } from "@/components/community/discussion-panel";
import { EstimateListCard } from "@/components/estimate-list-card";
import { MedianChart } from "@/components/overview/overview-parts";
import { AuroraHeader } from "@/components/ui/aurora-header";
import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { DataTable } from "@/components/ui/data-table";
import { getSession } from "@/lib/auth/session";
import { gazetteCount } from "@/lib/data/gazette";
import { closingLadder, inductionTracks, roundSettling, seatFlow } from "@/lib/data/insights";
import { joiningOverview } from "@/lib/data/joining";
import { inductionMaxMarks, inductionTimeline, listInductionsWithRounds } from "@/lib/data/merit";
import { inductionRunning, methodCheck, nextInductionGate, predictRound } from "@/lib/data/predictions";
import { publishedEstimates } from "@/lib/data/simulation";
import { getDb } from "@/lib/db/client";
import { formatMarks } from "@/lib/format";
import { intParam, oneOf } from "@/lib/params";

export const metadata = { title: "Induction" };
export const dynamic = "force-dynamic";

const fmt = (n: number) => n.toLocaleString("en-US");
const IV = "text-[#F3EEE5]/[.68]";
const glass = "rounded-[14px] border border-[#F3EEE5]/[.12] bg-[rgba(16,36,58,.45)] px-3.5 py-3";

/**
 * One induction (v4): a hero with its rounds, figures and sections; then closing merit,
 * who is still moving, the merit ladder, where merit moved, predictions, seat flow,
 * consent by round, the rounds, and questions.
 */
export default async function InductionPage({ params, searchParams }: { params: Promise<{ induction: string }>; searchParams: Promise<{ track?: string }> }) {
  const induction = intParam((await params).induction);
  if (induction === null) notFound();
  const db = getDb();
  const session = await getSession();
  const [estimates, gazetteTotal] = await Promise.all([publishedEstimates(db, session, { induction }), gazetteCount(db, session, induction)]);
  const [all, timeline, maxMarks] = await Promise.all([listInductionsWithRounds(db, session), inductionTimeline(db, session, induction), inductionMaxMarks(db)]);
  const ind = all.find((i) => i.id === induction);
  if (!ind) notFound();
  const max = maxMarks[induction];
  const tracks = await inductionTracks(db, session, induction);
  const track = oneOf((await searchParams).track, tracks.map((t) => t.value));
  const ladderTrack = track ?? tracks[0]?.value;
  const [settling, ladder, flow] = await Promise.all([
    ind.rounds.length > 1 ? roundSettling(db, session, induction, track) : Promise.resolve(null),
    ladderTrack ? closingLadder(db, session, { induction, track: ladderTrack }) : Promise.resolve(null),
    seatFlow(db, session, { induction, limit: 6 }),
  ]);
  const ladderLabel = ladderTrack?.replace("|", " · ");
  const running = await inductionRunning(db, induction);
  const lastRound = ind.rounds.at(-1)!.roundNo;
  const [check, gate, ahead, joining] = await Promise.all([
    ind.rounds.length > 1 ? methodCheck(db, session, { induction, track: ladderTrack }) : Promise.resolve(null),
    nextInductionGate(db, session, induction + 1),
    running ? predictRound(db, session, { induction, fromRound: lastRound, track: ladderTrack }) : Promise.resolve(null),
    joiningOverview(db, session, induction),
  ]);
  const last = ind.rounds.at(-1)!;
  const current = estimates.filter((e) => !e.official);
  const est = current[0] ?? null;
  const lastT = timeline.at(-1), prevT = timeline.at(-2);
  const delta = lastT?.medianClosing != null && prevT?.medianClosing != null ? lastT.medianClosing - prevT.medianClosing : null;
  const medians = timeline.filter((t) => t.medianClosing != null);

  // Where merit moved: each speciality's closing between the first and last round of the ladder.
  const moves = (ladder?.rows ?? []).filter((r) => r.marks.length > 1).map((r) => ({ ...r, d: r.marks.at(-1)! - r.marks[0]! })).filter((r) => Math.abs(r.d) >= 0.01);
  const fell = [...moves].sort((a, b) => a.d - b.d).filter((r) => r.d < 0).slice(0, 6);
  const rose = [...moves].sort((a, b) => b.d - a.d).filter((r) => r.d > 0).slice(0, 6);
  const settleMax = Math.max(1, ...(settling?.rounds.map((r) => r.moving) ?? [0]));
  const trackForm = (id: string) => (
    <form method="get" className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={id}>Programme and quota</label>
      <select id={id} name="track" defaultValue={track ?? ""} className="mn-sel h-8 text-xs">
        <option value="">All programmes</option>
        {tracks.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>
      <button type="submit" className="mn-ob">Show</button>
    </form>
  );

  return (
    <AreaPage area="portal" trail={[{ label: "Merit lists", href: "/portal/history" }, { label: `Induction ${induction}` }]} title={`Induction ${induction} · ${ind.rounds[0]!.cycleName}`} bare>
      <AuroraHeader as="section" className="flex flex-col gap-4 px-5 py-[22px] sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className={cn("flex items-center gap-2 text-[13px]", IV)}>
              <Link href="/portal/history" className="text-[#F3EEE5]/70 hover:underline">Merit lists</Link> / Induction {induction}
              {running ? <> · <span className="mn-live !h-2 !w-2" /> running</> : " · finished"}
            </p>
            <h1 className="mt-1.5 text-[2rem] font-bold tracking-[-0.03em]">Induction {induction} <span className={cn("text-base font-medium tracking-normal", IV)}>· {ind.rounds[0]!.cycleName}</span></h1>
            <p className={cn("mt-1.5 max-w-[700px] text-sm", IV)}>
              {ind.rounds[0]!.cycleCode} · {ind.rounds.length} round{ind.rounds.length === 1 ? "" : "s"} published{max ? ` · scored out of ${max}` : ""}.
              {joining ? ` ${fmt(joining.total.wasted)} of ${fmt(joining.total.seats)} seats (${Math.round(joining.total.pct * 100)}%) went unused after joining.` : ""}
            </p>
          </div>
          <nav aria-label="Induction" className="mn-seg mn-seg-iv max-w-full overflow-x-auto">
            <Link href={`/portal/history/${induction}`} aria-current="page">Overview</Link>
            {ind.rounds.length > 1 ? <Link href={`/portal/history/${induction}/compare?from=${ind.rounds.at(-2)!.roundNo}&to=${lastRound}`}>Movement</Link> : null}
            <a href="#predictions">Predictions</a>
            {joining ? <Link href={`/portal/history/${induction}/joining`}>Joining</Link> : null}
            <a href="#discussion">Questions</a>
          </nav>
        </div>

        <nav aria-label="Rounds" className="flex flex-wrap gap-2">
          {ind.rounds.map((r) => (
            <Link key={r.roundNo} href={`/portal/history/${induction}/rounds/${r.roundNo}`}
              className={cn("grid h-9 min-w-11 place-items-center rounded-[10px] border px-3 text-[13px] font-semibold transition-colors", r.roundNo === lastRound ? "border-[rgba(155,135,255,.7)] bg-[rgba(110,86,255,.25)] text-white shadow-[0_0_16px_rgba(110,86,255,.4)]" : "border-[#F3EEE5]/[.14] bg-black/15 text-[#F3EEE5]/85 hover:border-[#F3EEE5]/40")}>
              R{r.roundNo}
            </Link>
          ))}
          {est ? <Link href={`/portal/estimates?run=${est.id}`} className="grid h-9 min-w-11 place-items-center rounded-[10px] border border-dashed border-[rgba(229,160,75,.7)] px-3 text-[13px] font-semibold text-[#E5A04B]">R{est.roundNo} est.</Link> : null}
        </nav>

        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className={glass}><dt className={cn("text-xs", IV)}>Rounds published</dt><dd className="mt-1 text-2xl font-bold tabular-nums">{ind.rounds.length}</dd></div>
          <div className={glass}><dt className={cn("text-xs", IV)}>Allocations in round {lastRound}</dt><dd className="mt-1 text-2xl font-bold tabular-nums">{fmt(last.allocations)}</dd></div>
          <div className={glass}>
            <dt className={cn("text-xs", IV)}>Median closing, round {lastRound}</dt>
            <dd className="mt-1 text-2xl font-bold tabular-nums">{formatMarks(lastT?.medianClosing ?? null)}{delta != null && Math.abs(delta) >= 0.005 ? <span className={cn("ml-1.5 text-sm", delta < 0 ? "text-[#3DDC97]" : "text-[#FF7A7A]")}>{delta < 0 ? "▼" : "▲"} {Math.abs(delta).toFixed(2)}</span> : null}</dd>
          </div>
          {joining ? (
            <Link href={`/portal/history/${induction}/joining`} className={cn(glass, "hover:border-[rgba(255,122,122,.45)]")}><dt className={cn("text-xs", IV)}>Wasted after joining</dt><dd className="mt-1 text-2xl font-bold tabular-nums text-[#FF7A7A]">{fmt(joining.total.wasted)} <span className={cn("text-sm font-medium", IV)}>· {Math.round(joining.total.pct * 100)}%</span></dd></Link>
          ) : gazetteTotal ? (
            <Link href={`/portal/history/${induction}/gazette`} className={cn(glass, "hover:border-[#F3EEE5]/30")}><dt className={cn("text-xs", IV)}>In the gazette</dt><dd className="mt-1 text-2xl font-bold tabular-nums">{fmt(gazetteTotal)}</dd></Link>
          ) : (
            <div className={glass}><dt className={cn("text-xs", IV)}>Candidates, round {lastRound}</dt><dd className="mt-1 text-2xl font-bold tabular-nums">{fmt(lastT?.applicants ?? 0)}</dd></div>
          )}
        </dl>
      </AuroraHeader>

      {current.length ? <EstimateListCard estimates={current} title={`Estimated lists for induction ${induction}`} /> : null}
      {gazetteTotal || joining ? (
        <div className="grid gap-4 md:grid-cols-2">
          {gazetteTotal ? (
            <Link href={`/portal/history/${induction}/gazette`} className="mn-card-glass mn-hover block rounded-[20px] border border-white/[.07] p-5">
              <p className="text-[15px] font-semibold text-heading">Candidates list (gazette) →</p>
              <p className="mt-1 text-[13px] text-muted">{fmt(gazetteTotal)} candidates with their marks, as PHF published them before round 1.</p>
            </Link>
          ) : null}
          {joining ? (
            <Link href={`/portal/history/${induction}/joining`} className="mn-card-glass mn-hover block rounded-[20px] border border-white/[.07] p-5">
              <p className="text-[15px] font-semibold text-heading">Joining and wasted seats →</p>
              <p className="mt-1 text-[13px] text-muted">{fmt(joining.total.joined)} joined · {fmt(joining.total.notJoined)} did not join · {fmt(joining.total.unfilled)} never filled.</p>
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section aria-label="Median closing merit" className="mn-card-glass rounded-[20px] border border-white/[.07] p-5 [background:radial-gradient(520px_260px_at_100%_100%,rgba(110,86,255,.16),transparent_70%),rgba(23,23,28,.78)]">
          <h2 className="text-[15px] font-semibold text-heading">Median closing merit</h2>
          <p className="mt-0.5 text-xs text-muted">The middle of every programme, quota and speciality&apos;s closing marks{max ? `, out of ${max}` : ""} · lower is easier</p>
          {medians.length > 1 ? <MedianChart values={medians.map((t) => t.medianClosing!)} labels={medians.map((t) => `R${t.roundNo}`)} /> : <p className="mt-3 text-sm text-muted">Needs two rounds.</p>}
          <ChartSource source={`PHF merit lists, induction ${induction}`} induction={induction} />
        </section>
        {settling ? (
          <section id="settling" aria-label="Who is still moving" className="mn-card-glass rounded-[20px] border border-white/[.07] p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><h2 className="text-[15px] font-semibold text-heading">Who is still moving</h2><p className="mt-0.5 text-xs text-muted">Not yet in the seat they keep in the final round. Settled at zero.</p></div>
              {trackForm("settle-track")}
            </div>
            <ul className="mt-4 grid gap-2.5">
              {settling.rounds.map((r) => (
                <li key={r.roundNo} className="grid grid-cols-[2.5rem_minmax(0,1fr)_3.5rem] items-center gap-2.5 text-[13px]">
                  <span className="text-muted">R{r.roundNo}</span>
                  <span className="h-2.5 overflow-hidden rounded-full bg-white/[.06]"><span className="mn-grow-x block h-full rounded-full bg-[linear-gradient(90deg,#7B61FF,#9B87FF)] shadow-[0_0_10px_rgba(123,97,255,.5)]" style={{ width: `${(r.moving / settleMax) * 100}%` }} /></span>
                  <span className="text-right font-mono">{fmt(r.moving)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">{fmt(settling.final)} people hold a seat in the final round{track ? ` (${track.replace("|", " · ")})` : ""}.</p>
          </section>
        ) : null}
      </div>

      {ladder && ladder.rows.length ? (
        <Card id="ladder">
          <CardHeader title={`Merit ladder · ${ladderLabel}`} description={`Each speciality's lowest closing merit${max ? ` as percent of ${max}` : ""}. Step through the rounds to see where merit fell.`} action={trackForm("ladder-track")} />
          <MeritLadder rows={ladder.rows} rounds={ladder.rounds} total={max ?? null} caption={`Induction ${induction}, ${ladderLabel}: lowest closing merit per speciality by round`} />
          <ChartSource source={`PHF merit lists, induction ${induction}`} induction={induction} />
        </Card>
      ) : null}

      {fell.length || rose.length ? (
        <section id="moved" aria-label="Where merit moved" className="mn-card-glass rounded-[20px] border border-white/[.07] p-5">
          <h2 className="text-[15px] font-semibold text-heading">Where merit moved · R{ladder!.rounds[0]} → R{ladder!.rounds.at(-1)}</h2>
          <p className="mt-0.5 text-xs text-muted">Each speciality&apos;s lowest closing marks, {ladderLabel}. A fall means the seat got easier.</p>
          <div className="mt-3.5 grid gap-6 md:grid-cols-2">
            {([["Fell most", fell, "g"], ["Rose most", rose, "r"]] as const).map(([title, list, tone]) => (
              <div key={title}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.06em] text-muted">{title}</p>
                {list.length ? (
                  <ul className="grid gap-1.5">
                    {list.map((r) => (
                      <li key={r.key} className="flex items-center justify-between gap-3 rounded-[10px] bg-white/[.025] px-3 py-2 text-[13px]">
                        <span className="min-w-0 truncate">{r.specialityId ? <Link href={`/portal/explore/specialities/${r.specialityId}`} className="hover:text-[#D6CCFF]">{r.label}</Link> : r.label}</span>
                        <span className="flex flex-none items-center gap-2"><span className="font-mono text-xs text-muted">{formatMarks(r.marks[0])} → {formatMarks(r.marks.at(-1))}</span><span className={`mn-pill ${tone}`}>{r.d < 0 ? "▼" : "▲"} {Math.abs(r.d).toFixed(2)}</span></span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-sm text-muted">None.</p>}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <Card id="predictions">
        <CardHeader title="Predictions" description={`Ranges with a confidence, never single numbers. Estimates from how closing merit moved in other inductions; not official.${ladderLabel ? ` ${ladderLabel}.` : ""}`} />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="grid content-start gap-3">
            {ahead && ahead.specialities.length ? (
              <>
                <h3 className="text-sm font-semibold">Likely closing merit in round {lastRound + 1}</h3>
                <ul className="divide-y divide-line text-sm">
                  {ahead.specialities.slice().sort((a, b) => b.closing - a.closing).slice(0, 10).map((r) => (
                    <li key={r.speciality} className="flex items-center justify-between gap-3 py-2">
                      <span className="min-w-0 truncate text-muted">{r.speciality}<span className="block font-mono text-[0.7rem] text-subtle">now {r.closing.toFixed(2)}</span></span>
                      <PredictionBadge {...r} />
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-sm text-muted">{running ? "Not enough history to predict the next round yet." : "This cycle is finished, so there is no next round to predict. Beside this is how the method did on it, round by round."}</p>
            )}
            <div className="rounded-xl border border-white/[.07] bg-white/[.02] p-3 text-sm">
              <p className="font-medium">Round 1 of induction {induction + 1}</p>
              <p className="mt-1 text-xs text-muted">{gate.reason}</p>
            </div>
          </div>
          <div className="grid content-start gap-3">
            <h3 className="text-sm font-semibold">How well this works on induction {induction}</h3>
            {check && check.transitions.length ? (
              <>
                <ul className="grid gap-2">
                  {check.transitions.map((t) => (
                    <li key={t.from} className="grid grid-cols-[4.5rem_minmax(0,1fr)_3rem] items-center gap-3 text-sm">
                      <span className="font-mono text-xs text-muted">R{t.from}→R{t.to}</span>
                      <span className="h-2.5 overflow-hidden rounded-full bg-white/[.06]" aria-hidden><span className="block h-full rounded-full bg-[#5CE1E6]" style={{ width: `${Math.round((t.share ?? 0) * 100)}%` }} /></span>
                      <span className="text-right font-mono text-xs tabular-nums">{t.share == null ? "—" : `${Math.round(t.share * 100)}%`}</span>
                    </li>
                  ))}
                </ul>
                <MethodNote share={check.share} n={check.n} induction={induction} />
                <p className="text-xs text-subtle">Share of speciality closings that landed inside the range predicted from the round before, using inductions {check.inductionsUsed.join(", ")}.</p>
              </>
            ) : <p className="text-sm text-muted">Needs at least two rounds of this induction.</p>}
          </div>
        </div>
      </Card>

      {flow.length ? (
        <Card id="flow">
          <CardHeader title="Seat flow" description="The six largest specialities: seats accepted, and seats declined or not taken that are offered again next round." />
          <SeatFlow panels={flow} caption={`Induction ${induction}: accepted and released seats per round, six largest specialities`} />
          <ChartSource source={`PHF merit lists and consent, induction ${induction}`} induction={induction} />
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card id="by-round">
          <CardHeader title="Allocations and consent by round" description="Seats free up as candidates reject or are not available." />
          <RoundColumns
            title={`Induction ${induction}: allocations by consent per round`}
            columns={timeline.map((t) => ({
              label: `R${t.roundNo}`,
              parts: [
                { label: "Accepted", value: t.accepted, tone: "teal" as const },
                { label: "Rejected", value: t.rejected, tone: "danger" as const },
                { label: "Not available", value: t.notAvail, tone: "muted" as const },
              ],
            }))}
          />
          <ChartSource tone="official" source={`PHF merit lists, induction ${induction}`} induction={induction} />
        </Card>
        <Card id="rounds">
          <CardHeader
            title="Rounds"
            action={ind.rounds.length > 1 ? (
              <form method="get" action={`/portal/history/${induction}/compare`} className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <label htmlFor="cmp-from" className="sr-only">From</label>
                <select id="cmp-from" name="from" defaultValue={ind.rounds[0]!.roundNo} className="mn-sel h-8 text-xs">{ind.rounds.map((r) => <option key={r.roundNo} value={r.roundNo}>Round {r.roundNo}</option>)}</select>
                →
                <label htmlFor="cmp-to" className="sr-only">To</label>
                <select id="cmp-to" name="to" defaultValue={last.roundNo} className="mn-sel h-8 text-xs">{ind.rounds.map((r) => <option key={r.roundNo} value={r.roundNo}>Round {r.roundNo}</option>)}</select>
                <button type="submit" className="mn-ob">Compare</button>
              </form>
            ) : null}
          />
          <DataTable
            caption={`Induction ${induction} rounds`}
            rows={timeline}
            rowKey={(t) => String(t.roundNo)}
            columns={[
              { key: "r", header: "Round", sort: (t) => t.roundNo, cell: (t) => <Link href={`/portal/history/${induction}/rounds/${t.roundNo}`} className="font-medium text-[#B9AAFF] hover:underline">Round {t.roundNo}</Link> },
              { key: "a", header: "Allocations", sort: (t) => t.allocations, cell: (t) => fmt(t.allocations), align: "right" },
              { key: "acc", header: "Accepted", sort: (t) => t.accepted, cell: (t) => fmt(t.accepted), align: "right" },
              { key: "med", header: "Median", sort: (t) => t.medianClosing, cell: (t) => formatMarks(t.medianClosing), align: "right" },
            ]}
          />
        </Card>
      </div>

      <div id="discussion"><DiscussionPanel topic={{ kind: "induction", key: String(induction) }} label={`induction ${induction}`} /></div>
    </AreaPage>
  );
}
