import Link from "next/link";
import { AreaPage } from "@/components/area-page";
import { LineChart } from "@/components/charts/line-chart";
import { RoundFunnel } from "@/components/charts/round-funnel";
import { CycleGauge, gaugeProps } from "@/components/charts/cycle-gauge";
import { InductionTimeline } from "@/components/charts/induction-timeline";
import { StatTiles } from "@/components/charts/stat-tiles";
import { whenDatabaseDown } from "@/components/database-unavailable";
import { Icon, type IconName } from "@/components/icon";
import { Card, CardHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { roundSettling } from "@/lib/data/insights";
import { inductionTimeline, latestRoundChange, listInductionsWithRounds } from "@/lib/data/merit";
import { latestRoundStats } from "@/lib/round-stats";
import { getDb } from "@/lib/db/client";
import { findSection } from "@/lib/navigation";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

const SHORTCUTS: { href: string; title: string; text: string; icon: IconName }[] = [
  { href: "/portal/finder", title: "Where can my score get me?", text: "Safe, borderline and out-of-reach options", icon: "target" },
  { href: "/portal/history", title: "See closing merit", text: "Every round of every induction", icon: "trend" },
  { href: "/portal/explore", title: "Browse hospitals", text: "Seats and closing merit in each", icon: "building" },
];

export default async function PortalDashboard() {
  const s = findSection("/portal");
  const frame = { area: "portal" as const, trail: [{ label: s.label }], isRoot: true, title: s.label, description: "Where the latest induction stands, and where to go next." };
  const down = await whenDatabaseDown(frame);
  if (down) return down;

  const db = getDb();
  const session = await getSession();
  const [inductions, change] = await Promise.all([listInductionsWithRounds(db, session), latestRoundChange(db, session)]);
  const latest = inductions[0];
  const gauge = latest ? gaugeProps(latest, inductions[1]?.rounds.length) : null;
  const [timeline, settling] = latest
    ? await Promise.all([inductionTimeline(db, session, latest.id), roundSettling(db, session, latest.id)])
    : [[], null];

  return (
    <AreaPage {...frame}>
      <div className="grid gap-4 sm:grid-cols-3">
        {SHORTCUTS.map((c, i) => (
          <Link key={c.href} href={c.href} className="mn-rise group flex items-start gap-4 rounded-[1.5rem] border border-line bg-surface p-5 transition-colors hover:border-ember/50 hover:bg-elevated" style={{ animationDelay: `${i * 60}ms` }}>
            <span className="grid h-11 w-11 flex-none place-items-center rounded-full bg-ember/15 text-ember-hot ring-1 ring-ember/30 transition-transform group-hover:-translate-y-0.5"><Icon name={c.icon} /></span>
            <span><span className="block text-lg font-semibold">{c.title}</span><span className="text-sm text-muted">{c.text}</span></span>
          </Link>
        ))}
      </div>
      {change ? <StatTiles stats={latestRoundStats(change, latest?.maxMarks ?? undefined)} /> : null}
      {latest && gauge ? (
        <Card>
          <CardHeader title="Cycle progress" description={`Induction ${latest.id}: how far the cycle is through its published schedule, and which round comes next.`} />
          <CycleGauge {...gauge} />
        </Card>
      ) : null}
      {inductions.length ? (
        <Card>
          <CardHeader title="Timeline" description="Induction cycles and their rounds. Select a round to open it." />
          <InductionTimeline inductions={inductions} />
        </Card>
      ) : null}
      {latest && settling && latest.rounds.length > 1 ? (
        <Card>
          <CardHeader
            title="Who is still moving"
            description={`Induction ${latest.id}: candidates not yet in the seat they keep in the final round. Hover a round for who entered, moved or left.`}
            action={<Link href={`/portal/history/${latest.id}#settling`} className="text-sm font-semibold text-signal hover:underline">By programme →</Link>}
          />
          <RoundFunnel final={settling.final} rounds={settling.rounds} caption={`Induction ${latest.id}: candidates still moving by round`} />
        </Card>
      ) : null}
      {latest ? (
        <Card>
          <CardHeader title={`Latest: induction ${latest.id} · ${latest.rounds[0]!.cycleName}`} description={`Median closing merit per round${latest.maxMarks ? `, out of ${latest.maxMarks}` : ""}.`} />
          <LineChart title={`Induction ${latest.id}: median closing merit per round`} xLabels={timeline.map((t) => `R${t.roundNo}`)} series={[{ label: "Median closing merit", values: timeline.map((t) => t.medianClosing) }]} height={200} />
        </Card>
      ) : null}
    </AreaPage>
  );
}
