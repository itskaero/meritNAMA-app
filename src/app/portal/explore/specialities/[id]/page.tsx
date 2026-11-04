import Link from "next/link";
import { notFound } from "next/navigation";
import { AreaPage } from "@/components/area-page";
import { DiscussionPanel } from "@/components/community/discussion-panel";
import { LineChart } from "@/components/charts/line-chart";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getSession } from "@/lib/auth/session";
import { specialityHistory } from "@/lib/data/merit";
import { getDb } from "@/lib/db/client";
import { formatMarks } from "@/lib/format";

export const metadata = { title: "Speciality" };
export const dynamic = "force-dynamic";

const selectClass = "h-10 w-full min-w-0 max-w-full rounded-xl border border-line-strong bg-canvas px-3 text-sm text-ink";

export default async function SpecialityPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ track?: string }>;
}) {
  const { id } = await params;
  if (!/^\d{1,6}$/.test(id)) notFound();
  const h = await specialityHistory(getDb(), await getSession(), Number(id));
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
              }))}
              format={(v) => (allKnown ? `${v.toFixed(1)}%` : v.toFixed(2))}
              height={260}
            />
          </Card>
          {latest ? (
            <Card>
              <CardHeader title={`By hospital · induction ${latest.induction_id}, round ${latest.round_no}`} description="The latest round with this speciality." />
              <div className="relative overflow-x-auto rounded-2xl border border-line">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Closing merit by hospital</caption>
                  <thead className="bg-elevated text-muted"><tr>
                    <th scope="col" className="px-3 py-3 font-medium">Hospital</th>
                    <th scope="col" className="px-3 py-3 font-medium">Programme · quota</th>
                    <th scope="col" className="px-3 py-3 text-right font-medium">Allocated</th>
                    <th scope="col" className="px-3 py-3 text-right font-medium">Closing</th>
                  </tr></thead>
                  <tbody className="divide-y divide-line">
                    {h.byHospital.map((r) => (
                      <tr key={`${r.hospital}|${r.program}|${r.quota}`} className="hover:bg-surface">
                        <td className="px-3 py-2.5">{r.hospital_id ? <Link href={`/portal/explore/hospitals/${r.hospital_id}`} className="hover:text-signal hover:underline">{r.hospital}</Link> : r.hospital}</td>
                        <td className="px-3 py-2.5 text-muted">{r.program} · {r.quota}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{r.allocations}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums">{formatMarks(Number(r.closing))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}
        </>
      )}
      <DiscussionPanel topic={{ kind: "speciality", key: String(h.speciality.id) }} label={h.speciality.name} />
    </AreaPage>
  );
}
