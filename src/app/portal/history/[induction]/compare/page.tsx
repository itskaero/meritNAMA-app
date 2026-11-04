import Link from "next/link";
import { notFound } from "next/navigation";
import { AreaPage } from "@/components/area-page";
import { BarList } from "@/components/charts/bar-list";
import { StatTiles } from "@/components/charts/stat-tiles";
import { MeritDelta } from "@/components/merit-delta";
import { Card, CardHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { compareRounds } from "@/lib/data/merit";
import { getDb } from "@/lib/db/client";
import { formatMarks } from "@/lib/format";

export const metadata = { title: "Compare rounds" };
export const dynamic = "force-dynamic";

export default async function ComparePage({ params, searchParams }: {
  params: Promise<{ induction: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { induction: ri } = await params;
  const { from = "", to = "" } = await searchParams;
  if (!/^\d{1,3}$/.test(ri) || !/^\d{1,2}$/.test(from) || !/^\d{1,2}$/.test(to)) notFound();
  const induction = Number(ri);
  const cmp = await compareRounds(getDb(), await getSession(), induction, Number(from), Number(to));
  if (!cmp) notFound();
  const drops = cmp.groups.filter((g) => g.delta != null && g.delta < -0.005).slice(0, 10);

  return (
    <AreaPage
      area="portal"
      trail={[{ label: "Merit lists", href: "/portal/history" }, { label: `Induction ${induction}`, href: `/portal/history/${induction}` }, { label: `Round ${from} → ${to}` }]}
      title={`Round ${from} → round ${to}`}
      description={`Induction ${induction} · ${cmp.to.cycleName}. Closing merit per programme, quota and speciality, and candidate movement between the two rounds.`}
    >
      <StatTiles
        stats={[
          { label: `Allocations in round ${from}`, value: cmp.from.allocations },
          { label: `Allocations in round ${to}`, value: cmp.to.allocations },
          { label: "Entered", value: cmp.movement.entered, hint: "New in this programme and quota" },
          { label: "Moved seat", value: cmp.movement.moved, hint: `${cmp.movement.left.toLocaleString("en-US")} left the list` },
        ]}
      />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Card className="self-start">
          <CardHeader title="Biggest falls in closing merit" description="Where seats became easier to reach." />
          {drops.length ? (
            <BarList tone="teal" format={(v) => `−${v.toFixed(2)}`} items={drops.map((g) => ({ label: g.speciality, detail: `${g.program} · ${g.quota}`, value: -(g.delta ?? 0), href: g.specialityId ? `/portal/explore/specialities/${g.specialityId}` : undefined }))} />
          ) : <p className="text-sm text-muted">Closing merit did not fall anywhere.</p>}
        </Card>
        <Card className="min-w-0">
          <CardHeader title="All groups" />
          <div className="relative max-h-[640px] overflow-auto rounded-2xl border border-line">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Closing merit change per programme, quota and speciality</caption>
              <thead className="sticky top-0 bg-elevated text-muted">
                <tr>
                  <th scope="col" className="px-3 py-3 font-medium">Speciality</th>
                  <th scope="col" className="px-3 py-3 font-medium">Programme · quota</th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">R{from}</th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">R{to}</th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {cmp.groups.map((g) => (
                  <tr key={`${g.program}|${g.quota}|${g.speciality}`} className="hover:bg-surface">
                    <td className="px-3 py-2.5">{g.specialityId ? <Link href={`/portal/explore/specialities/${g.specialityId}`} className="hover:text-signal hover:underline">{g.speciality}</Link> : g.speciality}</td>
                    <td className="px-3 py-2.5 text-muted">{g.program} · {g.quota}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">{formatMarks(g.fromClosing)}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">{formatMarks(g.closing)}</td>
                    <td className="px-3 py-2.5 text-right"><MeritDelta value={g.delta} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </AreaPage>
  );
}
