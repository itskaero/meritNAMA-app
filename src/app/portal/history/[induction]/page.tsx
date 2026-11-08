import Link from "next/link";
import { PageSections } from "@/components/ui/page-sections";
import { ChartSource } from "@/components/charts/chart-source";
import { notFound } from "next/navigation";
import { AreaPage } from "@/components/area-page";
import { DiscussionPanel } from "@/components/community/discussion-panel";
import { LineChart } from "@/components/charts/line-chart";
import { RoundBeam } from "@/components/charts/round-beam";
import { RoundColumns } from "@/components/charts/round-columns";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { selectClass } from "@/components/ui/styles";
import { DataTable } from "@/components/ui/data-table";
import { getSession } from "@/lib/auth/session";
import { inductionMaxMarks, inductionTimeline, listInductionsWithRounds } from "@/lib/data/merit";
import { getDb } from "@/lib/db/client";
import { formatMarks } from "@/lib/format";
import { intParam, oneOf } from "@/lib/params";
import { closingLadder, inductionTracks, roundSettling, seatFlow } from "@/lib/data/insights";
import { inductionRunning, methodCheck, nextInductionGate, predictRound } from "@/lib/data/predictions";
import { MethodNote, PredictionBadge } from "@/components/charts/prediction-badge";
import { SeatFlow } from "@/components/charts/seat-flow";
import { MeritLadder } from "@/components/charts/merit-ladder";
import { MeritMoveHeat } from "@/components/charts/merit-move-heat";
import { RoundFunnel } from "@/components/charts/round-funnel";
import { CycleGauge, gaugeProps } from "@/components/charts/cycle-gauge";

export const metadata = { title: "Induction" };
export const dynamic = "force-dynamic";


export default async function InductionPage({ params, searchParams }: { params: Promise<{ induction: string }>; searchParams: Promise<{ track?: string }> }) {
  const induction = intParam((await params).induction);
  if (induction === null) notFound();
  const db = getDb();
  const session = await getSession();
  const [all, timeline, maxMarks] = await Promise.all([listInductionsWithRounds(db, session), inductionTimeline(db, session, induction), inductionMaxMarks(db)]);
  const ind = all.find((i) => i.id === induction);
  if (!ind) notFound();
  const max = maxMarks[induction];
  const prev = all.find((i) => i.id < induction);
  const gauge = gaugeProps(ind, prev?.rounds.length);
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
  const [check, gate, ahead] = await Promise.all([
    ind.rounds.length > 1 ? methodCheck(db, session, { induction, track: ladderTrack }) : Promise.resolve(null),
    nextInductionGate(db, session, induction + 1),
    running ? predictRound(db, session, { induction, fromRound: lastRound, track: ladderTrack }) : Promise.resolve(null),
  ]);
  const last = ind.rounds[ind.rounds.length - 1]!;

  return (
    <AreaPage
      area="portal"
      trail={[{ label: "Merit lists", href: "/portal/history" }, { label: `Induction ${induction}` }]}
      title={`Induction ${induction} · ${ind.rounds[0]!.cycleName}`}
      description={`${ind.rounds[0]!.cycleCode} · ${ind.rounds.length} rounds published${max ? ` · scored out of ${max}` : ""}. Open a round to see closing merit by speciality and hospital.`}
    >
      <PageSections
        items={[
          ...(settling ? [{ id: "settling", label: "Still moving" }] : []),
          ...(ladder && ladder.rows.length ? [{ id: "ladder", label: "Merit ladder" }] : []),
          ...(ladder && ladder.rows.length && ladder.rounds.length > 1 ? [{ id: "moved", label: "Where merit moved" }] : []),
          { id: "predictions", label: "Predictions" },
          ...(flow.length ? [{ id: "flow", label: "Seat flow" }] : []),
          { id: "by-round", label: "By round" },
          { id: "rounds", label: "Rounds" },
          ...(ind.rounds.length > 1 ? [{ id: "compare", label: "Compare" }] : []),
          { id: "discussion", label: "Questions" },
        ]}
      />
      {gauge ? (
        <Card>
          <CardHeader title="Cycle progress" description="How far this cycle is through its published schedule." />
          <CycleGauge {...gauge} />
        </Card>
      ) : null}
      <Card>
        <RoundBeam rounds={ind.rounds.map((r) => r.roundNo)} hrefFor={(r) => `/portal/history/${induction}/rounds/${r}`} />
      </Card>
      {settling ? (
        <Card id="settling">
          <CardHeader
            title="Who is still moving"
            description="Candidates not yet in the seat they keep in the final round. The list has settled when this reaches zero."
            action={
              <form method="get" className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor="settle-track">Programme and quota</label>
                <select id="settle-track" name="track" defaultValue={track ?? ""} className={`${selectClass} w-auto`}>
                  <option value="">All programmes</option>
                  {tracks.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <Button type="submit" variant="secondary" size="sm">Show</Button>
              </form>
            }
          />
          <RoundFunnel final={settling.final} rounds={settling.rounds} caption={`Induction ${induction}${track ? `, ${track.replace("|", " ")}` : ""}: candidates still moving by round`} />
          <ChartSource source={`PHF merit lists, induction ${induction}`} induction={induction} />
        </Card>
      ) : null}
      {ladder && ladder.rows.length ? (
        <Card id="ladder">
          <CardHeader title={`Merit ladder · ${ladderLabel}`} description={`Each speciality's lowest closing merit${max ? ` as percent of ${max}` : ""}. Step through the rounds to see where merit fell.${track ? "" : " Pick a programme above to change it."}`} />
          <MeritLadder rows={ladder.rows} rounds={ladder.rounds} total={max ?? null} caption={`Induction ${induction}, ${ladderLabel}: lowest closing merit per speciality by round`} />
          <ChartSource source={`PHF merit lists, induction ${induction}`} induction={induction} />
        </Card>
      ) : null}
      {ladder && ladder.rows.length && ladder.rounds.length > 1 ? (
        <Card id="moved">
          <CardHeader title="Where merit moved" description={`Change in each speciality's lowest closing marks between rounds, ${ladderLabel}. Teal: fell (easier). Amber: rose. A dot: no change.`} />
          <MeritMoveHeat rows={ladder.rows} rounds={ladder.rounds} caption={`Induction ${induction}, ${ladderLabel}: change in closing merit between rounds per speciality`} />
          <ChartSource source={`PHF merit lists, induction ${induction}`} induction={induction} />
        </Card>
      ) : null}
      <Card id="predictions">
        <CardHeader
          title="Predictions"
          description={`Ranges with a confidence, never single numbers. Estimates from how closing merit moved in other inductions; not official.${ladderLabel ? ` ${ladderLabel}.` : ""}`}
        />
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
              <p className="text-sm text-muted">{running ? "Not enough history to predict the next round yet." : `This cycle is finished, so there is no next round to predict. Below is how the method did on it, round by round.`}</p>
            )}
            <div className="rounded-xl border border-line bg-canvas p-3 text-sm">
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
                      <span className="h-2.5 overflow-hidden rounded-full bg-line" aria-hidden>
                        <span className="block h-full rounded-full bg-signal" style={{ width: `${Math.round((t.share ?? 0) * 100)}%` }} />
                      </span>
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
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
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
        <Card>
          <CardHeader title="Median closing merit" description={`The middle of every programme, quota and speciality\u2019s closing marks${max ? `, out of ${max}` : ""}.`} />
          <LineChart title={`Induction ${induction}: median closing merit per round`} xLabels={timeline.map((t) => `R${t.roundNo}`)} series={[{ label: "Median closing merit", values: timeline.map((t) => t.medianClosing) }]} />
          <ChartSource source={`PHF merit lists, induction ${induction}`} induction={induction} />
        </Card>
      </div>
      <Card id="rounds">
        <CardHeader title="Rounds" />
        <DataTable
          caption={`Induction ${induction} rounds`}
          rows={timeline}
          rowKey={(t) => String(t.roundNo)}
          columns={[
            { key: "r", header: "Round", sort: (t) => t.roundNo, cell: (t) => <Link href={`/portal/history/${induction}/rounds/${t.roundNo}`} className="font-medium text-signal hover:underline">Round {t.roundNo}</Link> },
            { key: "a", header: "Allocations", sort: (t) => t.allocations, cell: (t) => t.allocations.toLocaleString("en-US"), align: "right" },
            { key: "c", header: "Candidates", sort: (t) => t.applicants, cell: (t) => t.applicants.toLocaleString("en-US"), align: "right" },
            { key: "acc", header: "Accepted", sort: (t) => t.accepted, cell: (t) => t.accepted.toLocaleString("en-US"), align: "right" },
            { key: "med", header: "Median closing", sort: (t) => t.medianClosing, cell: (t) => formatMarks(t.medianClosing), align: "right" },
          ]}
        />
      </Card>
      {ind.rounds.length > 1 ? (
        <Card id="compare">
          <CardHeader title="Compare two rounds" description="Closing merit changes and how many candidates entered, left or moved." />
          <form method="get" action={`/portal/history/${induction}/compare`} className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1.5 text-sm font-medium">From
              <select name="from" defaultValue={ind.rounds[0]!.roundNo} className={`${selectClass} w-auto`}>{ind.rounds.map((r) => <option key={r.roundNo} value={r.roundNo}>Round {r.roundNo}</option>)}</select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium">To
              <select name="to" defaultValue={last.roundNo} className={`${selectClass} w-auto`}>{ind.rounds.map((r) => <option key={r.roundNo} value={r.roundNo}>Round {r.roundNo}</option>)}</select>
            </label>
            <Button type="submit" variant="secondary">Compare</Button>
          </form>
        </Card>
      ) : null}
      <DiscussionPanel topic={{ kind: "induction", key: String(induction) }} label={`induction ${induction}`} />
    </AreaPage>
  );
}
