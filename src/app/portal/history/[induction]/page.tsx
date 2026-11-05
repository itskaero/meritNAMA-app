import Link from "next/link";
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
import { inductionTracks, roundSettling } from "@/lib/data/insights";
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
  const settling = ind.rounds.length > 1 ? await roundSettling(db, session, induction, track) : null;
  const last = ind.rounds[ind.rounds.length - 1]!;

  return (
    <AreaPage
      area="portal"
      trail={[{ label: "Merit lists", href: "/portal/history" }, { label: `Induction ${induction}` }]}
      title={`Induction ${induction} · ${ind.rounds[0]!.cycleName}`}
      description={`${ind.rounds[0]!.cycleCode} · ${ind.rounds.length} rounds published${max ? ` · scored out of ${max}` : ""}. Open a round to see closing merit by speciality and hospital.`}
    >
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
        </Card>
      ) : null}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card>
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
        </Card>
        <Card>
          <CardHeader title="Median closing merit" description={`The middle of every programme, quota and speciality\u2019s closing marks${max ? `, out of ${max}` : ""}.`} />
          <LineChart title={`Induction ${induction}: median closing merit per round`} xLabels={timeline.map((t) => `R${t.roundNo}`)} series={[{ label: "Median closing merit", values: timeline.map((t) => t.medianClosing) }]} />
        </Card>
      </div>
      <Card>
        <CardHeader title="Rounds" />
        <DataTable
          caption={`Induction ${induction} rounds`}
          rows={timeline}
          rowKey={(t) => String(t.roundNo)}
          columns={[
            { key: "r", header: "Round", cell: (t) => <Link href={`/portal/history/${induction}/rounds/${t.roundNo}`} className="font-medium text-signal hover:underline">Round {t.roundNo}</Link> },
            { key: "a", header: "Allocations", cell: (t) => t.allocations.toLocaleString("en-US"), align: "right" },
            { key: "c", header: "Candidates", cell: (t) => t.applicants.toLocaleString("en-US"), align: "right" },
            { key: "acc", header: "Accepted", cell: (t) => t.accepted.toLocaleString("en-US"), align: "right" },
            { key: "med", header: "Median closing", cell: (t) => formatMarks(t.medianClosing), align: "right" },
          ]}
        />
      </Card>
      {ind.rounds.length > 1 ? (
        <Card>
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
