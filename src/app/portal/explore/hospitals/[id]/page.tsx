import Link from "next/link";
import { notFound } from "next/navigation";
import { AreaPage } from "@/components/area-page";
import { DiscussionPanel } from "@/components/community/discussion-panel";
import { BarList } from "@/components/charts/bar-list";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getSession } from "@/lib/auth/session";
import { hospitalProfile } from "@/lib/data/merit";
import { getDb } from "@/lib/db/client";
import { formatMarks } from "@/lib/format";

export const metadata = { title: "Hospital" };
export const dynamic = "force-dynamic";

export default async function HospitalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,6}$/.test(id)) notFound();
  const p = await hospitalProfile(getDb(), await getSession(), Number(id));
  if (!p) notFound();

  const seatsBySpec = new Map<string, { id: number; seats: number }>();
  for (const r of p.seats) seatsBySpec.set(r.speciality, { id: r.speciality_id, seats: (seatsBySpec.get(r.speciality)?.seats ?? 0) + r.seats });
  const seatItems = [...seatsBySpec].sort((a, b) => b[1].seats - a[1].seats).map(([label, v]) => ({ label, value: v.seats, href: `/portal/explore/specialities/${v.id}` }));
  const latest = p.closing[0];
  const max = latest ? p.maxMarks[latest.induction_id] : undefined;

  return (
    <AreaPage
      area="portal"
      trail={[{ label: "Hospitals & specialities", href: "/portal/explore" }, { label: p.hospital.name }]}
      title={p.hospital.name}
      description="Seats by speciality from the latest seat matrix, and closing merit in the latest merit round."
    >
      {seatItems.length === 0 && p.closing.length === 0 ? (
        <EmptyState title="No seats or merit data for this hospital yet" />
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
          <Card className="self-start">
            <CardHeader title={p.seats[0] ? `Seats · induction ${p.seats[0].induction_id}` : "Seats"} description="All programmes and quotas together." />
            {seatItems.length ? <BarList items={seatItems} /> : <p className="text-sm text-muted">Not in a seat matrix yet.</p>}
          </Card>
          <Card className="min-w-0">
            <CardHeader title={latest ? `Closing merit · induction ${latest.induction_id}, round ${latest.round_no}` : "Closing merit"} description={max ? `Out of ${max}.` : undefined} />
            {p.closing.length ? (
              <div className="relative overflow-x-auto rounded-2xl border border-line">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Closing merit by speciality</caption>
                  <thead className="bg-elevated text-muted"><tr>
                    <th scope="col" className="px-3 py-3 font-medium">Speciality</th>
                    <th scope="col" className="px-3 py-3 font-medium">Programme · quota</th>
                    <th scope="col" className="px-3 py-3 text-right font-medium">Allocated</th>
                    <th scope="col" className="px-3 py-3 text-right font-medium">Closing</th>
                  </tr></thead>
                  <tbody className="divide-y divide-line">
                    {p.closing.map((r) => (
                      <tr key={`${r.speciality}|${r.program}|${r.quota}`} className="hover:bg-surface">
                        <td className="px-3 py-2.5">{r.speciality_id ? <Link href={`/portal/explore/specialities/${r.speciality_id}`} className="hover:text-signal hover:underline">{r.speciality}</Link> : r.speciality}</td>
                        <td className="px-3 py-2.5 text-muted">{r.program} · {r.quota}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{r.allocations}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums">{formatMarks(Number(r.closing))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-sm text-muted">No merit rounds include this hospital yet.</p>}
          </Card>
        </div>
      )}
      <DiscussionPanel topic={{ kind: "hospital", key: String(p.hospital.id) }} label={p.hospital.name} />
    </AreaPage>
  );
}
