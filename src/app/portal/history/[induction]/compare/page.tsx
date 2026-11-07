import { SaveView } from "@/components/workspace/save-view";
import { notFound } from "next/navigation";
import { AreaPage } from "@/components/area-page";
import { BarList } from "@/components/charts/bar-list";
import { StatTiles } from "@/components/charts/stat-tiles";
import { MeritDelta } from "@/components/merit-delta";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EntityLink } from "@/components/entity-link";
import { getSession } from "@/lib/auth/session";
import { compareRounds } from "@/lib/data/merit";
import { getDb } from "@/lib/db/client";
import { formatMarks } from "@/lib/format";
import { intParam } from "@/lib/params";

export const metadata = { title: "Compare rounds" };
export const dynamic = "force-dynamic";

export default async function ComparePage({ params, searchParams }: {
  params: Promise<{ induction: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const induction = intParam((await params).induction), from = intParam(sp.from, 2), to = intParam(sp.to, 2);
  if (induction === null || from === null || to === null) notFound();
  const cmp = await compareRounds(getDb(), await getSession(), induction, from, to);
  if (!cmp) notFound();
  const drops = cmp.groups.filter((g) => g.delta != null && g.delta < -0.005).slice(0, 10);

  return (
    <AreaPage
      area="portal"
      trail={[{ label: "Merit lists", href: "/portal/history" }, { label: `Induction ${induction}`, href: `/portal/history/${induction}` }, { label: `Round ${from} → ${to}` }]}
      title={`Round ${from} → round ${to}`}
      description={`Induction ${induction} · ${cmp.to.cycleName}. Closing merit per programme, quota and speciality, and candidate movement between the two rounds.`}
    >
      <div><SaveView href={`/portal/history/${induction}/compare?from=${from}&to=${to}`} label={`Induction ${induction}: round ${from} → ${to}`} /></div>
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
          <DataTable
            caption="Closing merit change per programme, quota and speciality"
            maxHeight="640px"
            rows={cmp.groups}
            rowKey={(g) => `${g.program}|${g.quota}|${g.speciality}`}
            columns={[
              { key: "s", header: "Speciality", cell: (g) => <EntityLink kind="speciality" id={g.specialityId} name={g.speciality} /> },
              { key: "pq", header: "Programme · quota", tone: "muted", cell: (g) => `${g.program} · ${g.quota}` },
              { key: "f", header: `R${from}`, align: "right", tone: "mono", cell: (g) => formatMarks(g.fromClosing) },
              { key: "t", header: `R${to}`, align: "right", tone: "mono", cell: (g) => formatMarks(g.closing) },
              { key: "d", header: "Change", align: "right", cell: (g) => <MeritDelta value={g.delta} /> },
            ]}
          />
        </Card>
      </div>
    </AreaPage>
  );
}
