import Link from "next/link";
import { FindBox } from "@/components/find-box";
import { ChartSource } from "@/components/charts/chart-source";
import { AreaPage } from "@/components/area-page";
import { StatTiles } from "@/components/charts/stat-tiles";
import { whenDatabaseDown } from "@/components/database-unavailable";
import { ListNav, ViewTabs } from "@/components/merit-lists";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getSession } from "@/lib/auth/session";
import { currentInduction, inductionLists, type ListStep } from "@/lib/data/lists";
import { listInductionsWithRounds, meritOverview, seatTrends } from "@/lib/data/merit";
import { LineChart } from "@/components/charts/line-chart";
import { getDb } from "@/lib/db/client";
import { findSection } from "@/lib/navigation";
import { oneOf } from "@/lib/params";

export const metadata = { title: "Merit lists" };
export const dynamic = "force-dynamic";

const TABS = ["current", "previous"] as const;

/** What the current cycle has reached, in a sentence. */
function progress(steps: ListStep[]) {
  const official = steps.filter((s) => s.kind === "official").length;
  const estimate = steps.filter((s) => s.kind === "estimate").map((s) => s.label.toLowerCase());
  const parts = [
    steps.some((s) => s.kind === "gazette") ? "Gazette published" : null,
    official ? `${official} official round${official === 1 ? "" : "s"}` : "no official round yet",
    estimate.length ? `${estimate.join(", ")} estimated` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

/**
 * Merit lists: the current induction (gazette, then each round, official or estimated,
 * then simulate the next one) and the finished inductions (official rounds only).
 */
export default async function MeritListsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const s = findSection("/portal/history");
  const down = await whenDatabaseDown({ area: "portal", trail: [{ label: s.label }], title: s.label, description: s.description });
  if (down) return down;
  const db = getDb();
  const session = await getSession();
  const [inductions, current] = await Promise.all([listInductionsWithRounds(db, session), currentInduction(db, session)]);
  const tab = oneOf((await searchParams).tab, TABS) ?? (current ? "current" : "previous");
  const previous = inductions.filter((i) => i.id !== current?.induction);

  return (
    <AreaPage area="portal" trail={[{ label: s.label }]} title={s.label} description="The gazette and every merit list, official and estimated. Find yourself, or anyone, by name or applicant ID.">
      <ViewTabs
        label="Which inductions"
        current={tab}
        items={[
          { key: "current", href: "/portal/history?tab=current", label: current ? `Current · induction ${current.induction}` : "Current" },
          { key: "previous", href: "/portal/history?tab=previous", label: "Previous inductions" },
        ]}
      />
      {tab === "current" ? await currentTab() : await previousTab()}
    </AreaPage>
  );

  async function currentTab() {
    if (!current) {
      return (
        <EmptyState title="No induction is running right now">
          The next cycle appears here once PHF publishes its gazette. Finished inductions are under <Link href="/portal/history?tab=previous" className="font-semibold text-signal underline">Previous inductions</Link>.
        </EmptyState>
      );
    }
    const lists = await inductionLists(db, session, current.induction);
    const cycle = inductions.find((i) => i.id === current.induction)?.rounds[0];
    return (
      <>
        <Card>
          <CardHeader
            title={`Induction ${current.induction}${cycle ? ` · ${cycle.cycleName}` : ""}`}
            description={progress(lists.steps)}
            action={<Badge tone="current">Running</Badge>}
          />
          {lists.steps.length ? <ListNav steps={lists.steps} /> : <p className="text-sm text-muted">Nothing is published for this induction yet.</p>}
          <ul className="mt-4 grid gap-1.5 text-xs text-muted sm:grid-cols-2">
            <li><span className="font-semibold text-heading">Gazette</span>: everyone who applied, with merit and eligibility (PHF).</li>
            <li><span className="font-semibold text-heading">Official</span>: the merit list PHF published.</li>
            <li><span className="font-semibold text-amber">Estimate</span>: simulated before PHF publishes it, from the gazette or the previous list and its consent. Not official.</li>
            <li><span className="font-semibold text-signal">Simulate it</span>: change anyone&apos;s consent on your own copy and see the next list.</li>
          </ul>
          {lists.official.length ? (
            <p className="mt-3 text-sm"><Link href={`/portal/history/${current.induction}`} className="font-semibold text-signal hover:underline">Induction {current.induction} overview: charts and predictions →</Link></p>
          ) : null}
        </Card>
        <FindBox />
      </>
    );
  }

  async function previousTab() {
    const [overview, seats] = await Promise.all([meritOverview(db, session), seatTrends(db, session)]);
    return (
      <>
        <FindBox />
        {previous.length === 0 ? (
          <EmptyState title="No finished inductions yet">Merit rounds appear here once an administrator imports them.</EmptyState>
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {previous.map((ind) => {
              const first = ind.rounds[0]!, last = ind.rounds.at(-1)!;
              return (
                <Card key={ind.id}>
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-xs uppercase tracking-[0.14em] text-ember">{first.cycleCode}</p>
                      <h2 className="mt-1 text-lg font-semibold">
                        <Link href={`/portal/history/${ind.id}`} className="hover:underline">Induction {ind.id}</Link>{" "}
                        <span className="font-normal text-muted">· {first.cycleName}</span>
                      </h2>
                      <p className="mt-1 text-sm text-muted">
                        {ind.rounds.length} {ind.rounds.length === 1 ? "round" : "rounds"} · {last.allocations.toLocaleString("en-US")} allocations in round {last.roundNo}
                        {ind.maxMarks ? ` · out of ${ind.maxMarks}` : ""}
                      </p>
                    </div>
                    <Link href={`/portal/history/${ind.id}`} className="text-sm font-semibold text-signal hover:underline">Overview →</Link>
                  </div>
                  <ListNav steps={ind.rounds.map((r) => ({ kind: "official" as const, href: `/portal/history/${ind.id}/rounds/${r.roundNo}`, label: `Round ${r.roundNo}`, note: `${r.allocations.toLocaleString("en-US")} allocations`, roundNo: r.roundNo }))} />
                </Card>
              );
            })}
          </div>
        )}
        <StatTiles
          stats={[
            { label: "Inductions with merit lists", value: overview.inductions },
            { label: "Rounds published", value: overview.rounds },
            { label: "Allocations", value: overview.allocations, hint: "One candidate can hold several, one per programme or quota" },
            { label: "Seats in the latest matrix", value: overview.seats, hint: `${overview.hospitals} hospitals` },
          ]}
        />
        {seats.inductions.length > 1 ? (
          <Card>
            <CardHeader title="Seats by induction" description="From each induction's seat matrix." />
            <LineChart
              title="Seats per induction, in total and by programme"
              xLabels={seats.inductions.map((i) => `I${i}`)}
              series={[{ label: "All programmes", values: seats.total }, ...seats.byProgram.map((p) => ({ label: p.program, values: p.values }))]}
              format={(v) => Math.round(v).toLocaleString("en-US")}
              height={240}
            />
            <ChartSource tone="official" data="seats" source="PHF seat matrices, one per induction" />
          </Card>
        ) : null}
      </>
    );
  }
}
