import Link from "next/link";
import { AreaPage } from "@/components/area-page";
import { RoundBeam } from "@/components/charts/round-beam";
import { StatTiles } from "@/components/charts/stat-tiles";
import { DatabaseUnavailable } from "@/components/database-unavailable";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getSession } from "@/lib/auth/session";
import { listInductionsWithRounds, meritOverview } from "@/lib/data/merit";
import { checkDatabase, getDb } from "@/lib/db/client";
import { findSection } from "@/lib/navigation";

export const metadata = { title: "Merit lists" };
export const dynamic = "force-dynamic";

export default async function MeritListsPage() {
  const s = findSection("/portal/history");
  if ((await checkDatabase()) !== "ok") {
    return <AreaPage area="portal" trail={[{ label: s.label }]} title={s.label} description={s.description}><DatabaseUnavailable /></AreaPage>;
  }
  const db = getDb();
  const session = await getSession();
  const [inductions, overview] = await Promise.all([listInductionsWithRounds(db, session), meritOverview(db, session)]);

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
                    <p className="font-mono text-xs uppercase tracking-[0.14em] text-ember-hot">{first.cycleCode}</p>
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
                <RoundBeam rounds={ind.rounds.map((r) => r.roundNo)} hrefFor={(r) => `/portal/history/${ind.id}/rounds/${r}`} />
              </Card>
            );
          })}
        </div>
      )}
    </AreaPage>
  );
}
