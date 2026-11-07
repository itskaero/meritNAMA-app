import { notFound } from "next/navigation";
import { AreaPage } from "@/components/area-page";
import { DiscussionPanel } from "@/components/community/discussion-panel";
import { LineChart } from "@/components/charts/line-chart";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { specialityAccreditation } from "@/lib/data/accreditation";
import { matchHospital } from "@/lib/domain/accreditation";
import { DataTable } from "@/components/ui/data-table";
import { EntityLink } from "@/components/entity-link";
import { selectClass } from "@/components/ui/styles";
import { EmptyState } from "@/components/ui/empty-state";
import { getSession } from "@/lib/auth/session";
import { closingLadder, seatFlow } from "@/lib/data/insights";
import { specialityReviewSummary } from "@/lib/data/reviews";
import { RatingMeter } from "@/components/community/rating-meter";
import { REVIEW_DIMENSIONS } from "@/lib/domain/community";
import Link from "next/link";
import { SeatFlow } from "@/components/charts/seat-flow";
import { specialityHistory } from "@/lib/data/merit";
import { MeritLadder } from "@/components/charts/merit-ladder";
import { getDb } from "@/lib/db/client";
import { formatMarks } from "@/lib/format";
import { intParam } from "@/lib/params";

export const metadata = { title: "Speciality" };
export const dynamic = "force-dynamic";


export default async function SpecialityPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ track?: string }>;
}) {
  const id = intParam((await params).id, 6);
  if (id === null) notFound();
  const h = await specialityHistory(getDb(), await getSession(), id);
  if (!h) notFound();

  // A "track" is one programme + quota; default to the one with the most allocations.
  const tracks = new Map<string, number>();
  for (const r of h.rows) tracks.set(`${r.program} · ${r.quota}`, (tracks.get(`${r.program} · ${r.quota}`) ?? 0) + r.allocations);
  const ordered = [...tracks].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  const { track: wanted } = await searchParams;
  const track = wanted && tracks.has(wanted) ? wanted : ordered[0];
  const points = h.rows.filter((r) => `${r.program} · ${r.quota}` === track);
  const inductionsSeen = [...new Set(points.map((p) => p.inductionId))];
  const allKnown = inductionsSeen.every((n) => h.maxMarks[n]);
  // Percent of the induction's total when known: totals differ (60 vs 35 marks).
  const value = (p: (typeof points)[number]) => (allKnown ? ((p.closing ?? 0) / h.maxMarks[p.inductionId]!) * 100 : p.closing);
  const latest = h.byHospital[0];
  const [ladder, flow] = latest
    ? await Promise.all([
        closingLadder(getDb(), await getSession(), { induction: latest.induction_id, specialityId: id }),
        seatFlow(getDb(), await getSession(), { induction: latest.induction_id, specialityId: id, limit: 6 }),
      ])
    : [null, []];
  const said = await specialityReviewSummary(getDb(), await getSession(), id);
  // CPSP accreditation for this speciality, matched to the hospitals by name.
  const acc = await specialityAccreditation(getDb(), await getSession(), h.speciality.name);
  const accredited = new Set(acc ? h.byHospital.filter((r) => matchHospital(r.hospital, acc.hospitals)).map((r) => r.hospital) : []);

  return (
    <AreaPage
      area="portal"
      trail={[{ label: "Hospitals & specialities", href: "/portal/explore" }, { label: h.speciality.name }]}
      title={h.speciality.name}
      description={`Closing merit across ${inductionsSeen.length} induction${inductionsSeen.length === 1 ? "" : "s"} and their rounds.`}
    >
      {h.rows.length === 0 ? (
        <EmptyState title="No merit data for this speciality yet" />
      ) : (
        <>
          <Card>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <CardHeader title={`Closing merit · ${track}`} description={allKnown ? "Percent of each induction's total marks, so inductions scored out of 60 and 35 compare fairly." : "Marks as published."} />
              <form method="get" className="flex min-w-0 max-w-full flex-wrap items-end gap-2">
                <label className="grid min-w-0 flex-1 gap-1.5 text-sm font-medium">Programme · quota
                  <select name="track" defaultValue={track} className={selectClass}>{ordered.map((t) => <option key={t}>{t}</option>)}</select>
                </label>
                <Button type="submit" variant="secondary">Show</Button>
              </form>
            </div>
            <LineChart
              title={`${h.speciality.name}, ${track}: closing merit by induction and round`}
              xLabels={points.map((p) => `I${p.inductionId} R${p.roundNo}`)}
              // One series per induction, so rounds of different inductions are not joined. Latest first (ember).
              series={[...inductionsSeen].reverse().map((n, i) => ({
                label: `Induction ${n}`,
                tone: i === 0 ? ("ember" as const) : ("muted" as const),
                values: points.map((p) => (p.inductionId === n ? value(p) : null)),
                details: points.map((p) => (p.inductionId === n && allKnown ? `${(p.closing ?? 0).toFixed(2)}/${h.maxMarks[p.inductionId]}` : null)),
              }))}
              format={(v) => (allKnown ? `${v.toFixed(1)}%` : v.toFixed(2))}
              height={260}
            />
          </Card>
          {latest && ladder && ladder.rows.length ? (
            <Card>
              <CardHeader title={`Merit ladder · induction ${latest.induction_id}`} description="Lowest closing merit for each programme and quota, round by round." />
              <MeritLadder rows={ladder.rows} rounds={ladder.rounds} total={h.maxMarks[latest.induction_id] ?? null} linkRows={false} caption={`${h.speciality.name}, induction ${latest.induction_id}: lowest closing merit per programme and quota by round`} />
            </Card>
          ) : null}
          {latest && flow.length ? (
            <Card>
              <CardHeader title={`Seat flow · induction ${latest.induction_id}`} description="Seats accepted, and seats declined or not taken that go back into the pool for the next round." />
              <SeatFlow panels={flow} caption={`${h.speciality.name}, induction ${latest.induction_id}: accepted and released seats per round by programme and quota`} />
            </Card>
          ) : null}
          {said.length ? (
            <Card>
              <CardHeader title="What trainees say" description={`Reviews of ${h.speciality.name} by verified candidates, per hospital. Higher is better. Not official.`} />
              <div tabIndex={0} role="region" aria-label="Average review ratings per hospital" className="relative overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <caption className="sr-only">Average review ratings per hospital</caption>
                  <thead className="text-left text-xs text-muted">
                    <tr><th scope="col" className="py-2 pr-3 font-medium">Hospital</th>{REVIEW_DIMENSIONS.map((d) => <th key={d.key} scope="col" className="px-2 py-2 font-medium">{d.label}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {said.map((r) => (
                      <tr key={r.hospitalId}>
                        <th scope="row" className="py-2.5 pr-3 text-left font-normal">
                          <Link href={`/portal/explore/hospitals/${r.hospitalId}?spec=${id}#reviews`} className="hover:underline">{r.hospital}</Link>
                          <span className="block text-xs text-subtle">{r.count} {r.count === 1 ? "review" : "reviews"}</span>
                        </th>
                        {REVIEW_DIMENSIONS.map((d) => <td key={d.key} className="px-2 py-2.5"><RatingMeter value={r[d.key]} size="sm" label={`${r.hospital}, ${d.label}`} /></td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}
          {latest ? (
            <Card>
              <CardHeader title={`By hospital · induction ${latest.induction_id}, round ${latest.round_no}`} description="The latest round with this speciality." />
              <DataTable
                caption="Closing merit by hospital"
                rows={h.byHospital}
                rowKey={(r) => `${r.hospital}|${r.program}|${r.quota}`}
                columns={[
                  { key: "h", header: "Hospital", cell: (r) => <EntityLink kind="hospital" id={r.hospital_id} name={r.hospital} /> },
                  { key: "pq", header: "Programme · quota", tone: "muted", cell: (r) => `${r.program} · ${r.quota}` },
                  { key: "n", header: "Allocated", align: "right", cell: (r) => r.allocations },
                  { key: "c", header: "Closing", align: "right", tone: "mono", cell: (r) => formatMarks(Number(r.closing)) },
                  ...(acc ? [{ key: "cpsp", header: "CPSP", cell: (r: (typeof h.byHospital)[number]) => (accredited.has(r.hospital) ? <Badge tone="success">accredited</Badge> : <span className="text-xs text-subtle">not matched</span>) }] : []),
                ]}
              />
              {acc ? <p className="mt-3 text-xs text-subtle">CPSP lists {acc.hospitals.length} hospital{acc.hospitals.length === 1 ? "" : "s"} accredited for {h.speciality.name}. Hospitals are matched by name, so “not matched” is not proof that a unit is unaccredited.</p> : null}
            </Card>
          ) : null}
        </>
      )}
      <DiscussionPanel topic={{ kind: "speciality", key: String(h.speciality.id) }} label={h.speciality.name} />
    </AreaPage>
  );
}
