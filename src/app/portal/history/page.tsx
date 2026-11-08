import Link from "next/link";
import { FindBox } from "@/components/find-box";
import { ChartSource } from "@/components/charts/chart-source";
import { AreaPage } from "@/components/area-page";
import { InductionTimeline } from "@/components/charts/induction-timeline";
import { StatTiles } from "@/components/charts/stat-tiles";
import { whenDatabaseDown } from "@/components/database-unavailable";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getSession } from "@/lib/auth/session";
import { listInductionsWithRounds, meritOverview, seatTrends } from "@/lib/data/merit";
import { LineChart } from "@/components/charts/line-chart";
import { getDb } from "@/lib/db/client";
import { publishedEstimates } from "@/lib/data/simulation";
import { EstimateListCard } from "@/components/estimate-list-card";
import { findSection } from "@/lib/navigation";

export const metadata = { title: "Merit lists" };
export const dynamic = "force-dynamic";

export default async function MeritListsPage() {
  const s = findSection("/portal/history");
  const down = await whenDatabaseDown({ area: "portal", trail: [{ label: s.label }], title: s.label, description: s.description });
  if (down) return down;
  const db = getDb();
  const session = await getSession();
  const [inductions, overview, seats, estimates] = await Promise.all([listInductionsWithRounds(db, session), meritOverview(db, session), seatTrends(db, session), publishedEstimates(db, session)]);

  return (
    <AreaPage area="portal" trail={[{ label: s.label }]} title={s.label} description={s.description}>
      <StatTiles
        stats={[
          { label: "Inductions with merit lists", value: overview.inductions },
          { label: "Rounds published", value: overview.rounds },
          { label: "Allocations", value: overview.allocations, hint: "One candidate can hold several, one per programme or quota" },
          { label: "Seats in the latest matrix", value: overview.seats, hint: `${overview.hospitals} hospitals` },
        ]}
      />
      <FindBox />
      <EstimateListCard estimates={estimates} />
      {inductions.length ? (
        <Card>
          <CardHeader title="Timeline" description="Each induction's cycle; select a round to open its merit list." />
          <InductionTimeline inductions={inductions} />
        </Card>
      ) : null}
      {seats.inductions.length ? (
        <Card>
          <CardHeader
            title="Seats by induction"
            description={seats.inductions.length > 1
              ? `From each induction's seat matrix. Induction ${seats.inductions.at(-1)} has ${seats.total.at(-1)!.toLocaleString("en-US")} seats, ${(() => { const d = seats.total.at(-1)! - seats.total.at(-2)!; return d === 0 ? "the same as" : `${Math.abs(d).toLocaleString("en-US")} ${d > 0 ? "more than" : "fewer than"}`; })()} induction ${seats.inductions.at(-2)}.`
              : `Only induction ${seats.inductions[0]}'s seat matrix is imported, so there is no trend yet: ${seats.total[0]!.toLocaleString("en-US")} seats.`}
          />
          {seats.inductions.length > 1 ? (
            <LineChart
              title="Seats per induction, in total and by programme"
              xLabels={seats.inductions.map((i) => `I${i}`)}
              series={[{ label: "All programmes", values: seats.total }, ...seats.byProgram.map((p) => ({ label: p.program, values: p.values }))]}
              format={(v) => Math.round(v).toLocaleString("en-US")}
              height={240}
            />
          ) : (
            <ul className="flex flex-wrap gap-2 text-sm">
              {seats.byProgram.map((p) => <li key={p.program} className="rounded-full px-3 py-1.5 ring-1 ring-line-strong">{p.program} <span className="font-mono">{p.values[0]?.toLocaleString("en-US")}</span></li>)}
            </ul>
          )}
          <ChartSource tone="official" data="seats" source="PHF seat matrices, one per induction" />
        </Card>
      ) : null}
      {inductions.length === 0 ? (
        <EmptyState title="No merit lists yet">Merit rounds appear here once an administrator imports them.</EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          {inductions.map((ind) => {
            const first = ind.rounds[0]!, last = ind.rounds[ind.rounds.length - 1]!;
            return (
              <Card key={ind.id} className="mn-rise">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs uppercase tracking-[0.14em] text-ember">{first.cycleCode}</p>
                    <h2 className="mt-1 text-xl font-semibold">
                      <Link href={`/portal/history/${ind.id}`} className="hover:underline">Induction {ind.id}</Link>{" "}
                      <span className="font-normal text-muted">· {first.cycleName}</span>
                    </h2>
                    <p className="mt-1 text-sm text-muted">
                      {ind.rounds.length} {ind.rounds.length === 1 ? "round" : "rounds"} · {last.allocations.toLocaleString("en-US")} allocations in round {last.roundNo}
                      {ind.maxMarks ? ` · scored out of ${ind.maxMarks}` : ""}
                    </p>
                  </div>
                  <Link href={`/portal/history/${ind.id}`} className="rounded-full border border-line-strong px-4 py-2 text-sm font-semibold hover:bg-hover">Open</Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </AreaPage>
  );
}
