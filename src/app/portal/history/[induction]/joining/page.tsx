import Link from "next/link";
import { notFound } from "next/navigation";
import { AreaPage } from "@/components/area-page";
import { BarList } from "@/components/charts/bar-list";
import { ChartSource } from "@/components/charts/chart-source";
import { pct, WasteTable, WasteTiles, wasteSentence } from "@/components/joining";
import { AuroraStat } from "@/components/ui/aurora-header";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getSession } from "@/lib/auth/session";
import { joiningOverview, joiningTrend } from "@/lib/data/joining";
import { getDb } from "@/lib/db/client";
import { intParam } from "@/lib/params";

export const metadata = { title: "Joining and wasted seats" };
export const dynamic = "force-dynamic";

const fmt = (n: number) => n.toLocaleString("en-US");

/** Who joined the last round's seats, and which seats went unused, from PHF's joining file. */
export default async function JoiningPage({ params }: { params: Promise<{ induction: string }> }) {
  const induction = intParam((await params).induction);
  if (induction === null) notFound();
  const db = getDb();
  const session = await getSession();
  const [o, trend] = await Promise.all([joiningOverview(db, session, induction), joiningTrend(db, session)]);
  const trail = [{ label: "Merit lists", href: "/portal/history" }, { label: `Induction ${induction}`, href: `/portal/history/${induction}` }, { label: "Joining" }];
  if (!o) {
    return (
      <AreaPage area="portal" trail={trail} title={`Induction ${induction} · joining`} description="Who joined their seat, and how many seats went unused.">
        <EmptyState title="No joining data for this induction">It appears once PHF&apos;s joining status for the last round is in.</EmptyState>
      </AreaPage>
    );
  }
  const w = o.total;
  return (
    <AreaPage
      area="portal"
      trail={trail}
      title={`Induction ${induction} · joining`}
      description={`Against round ${o.roundNo}, the last list. ${wasteSentence(w)}`}
      aside={
        <div className="grid grid-cols-3 gap-6">
          <AuroraStat label="Seats" value={fmt(w.seats)} />
          <AuroraStat label="Joined" value={fmt(w.joined)} hint={w.pending ? `${fmt(w.pending)} pending` : undefined} />
          <AuroraStat label="Wasted" value={fmt(w.wasted)} hint={`${pct(w.pct)} of seats`} />
        </div>
      }
    >
      <WasteTiles w={w} />
      <p className="text-sm text-muted">
        PHF&apos;s joining file lists people who joined or are pending. Anyone on <Link href={`/portal/history/${induction}/rounds/${o.roundNo}`} className="text-signal hover:underline">round {o.roundNo}&apos;s list</Link> who is not in it counts as not joined. Wasted = did not join + never filled; pending seats are not counted. The file is a snapshot: late joinings can still change it.
      </p>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Most wasted · specialities" />
          <WasteTable rows={o.bySpeciality} kind="speciality" />
        </Card>
        <Card>
          <CardHeader title="Most wasted · hospitals" />
          <WasteTable rows={o.byHospital} kind="hospital" />
        </Card>
      </div>
      <Card>
        <CardHeader title="By quota" />
        <WasteTable rows={o.byQuota} kind="quota" />
        <ChartSource tone="official" source={`PHF joining status and merit list, induction ${induction} round ${o.roundNo}`} induction={induction} />
      </Card>
      {trend.length > 1 ? (
        <Card>
          <CardHeader title="Wasted seats by induction" description="Share of seats that went unused, for every induction with joining data." />
          <BarList items={trend.map((t) => ({ label: `Induction ${t.induction}`, detail: `${fmt(t.total.wasted)} of ${fmt(t.total.seats)}`, value: Math.round(t.total.pct * 100), href: `/portal/history/${t.induction}/joining` }))} format={(v) => `${v}%`} />
        </Card>
      ) : null}
    </AreaPage>
  );
}
