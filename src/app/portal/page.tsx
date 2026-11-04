import Link from "next/link";
import { AreaPage } from "@/components/area-page";
import { LineChart } from "@/components/charts/line-chart";
import { RoundBeam } from "@/components/charts/round-beam";
import { StatTiles } from "@/components/charts/stat-tiles";
import { whenDatabaseDown } from "@/components/database-unavailable";
import { Icon, type IconName } from "@/components/icon";
import { Card, CardHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { inductionTimeline, listInductionsWithRounds, meritOverview } from "@/lib/data/merit";
import { getDb } from "@/lib/db/client";
import { findSection } from "@/lib/navigation";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

const SHORTCUTS: { href: string; title: string; text: string; icon: IconName }[] = [
  { href: "/portal/history", title: "See closing merit", text: "Every round of every induction", icon: "trend" },
  { href: "/portal/explore", title: "Browse hospitals", text: "Seats and closing merit in each", icon: "building" },
  { href: "/portal/profile", title: "My merit profile", text: "Coming with candidate accounts", icon: "user" },
];

export default async function PortalDashboard() {
  const s = findSection("/portal");
  const frame = { area: "portal" as const, trail: [{ label: s.label }], isRoot: true, title: s.label, description: "Where the latest induction stands, and where to go next." };
  const down = await whenDatabaseDown(frame);
  if (down) return down;

  const db = getDb();
  const session = await getSession();
  const [overview, inductions] = await Promise.all([meritOverview(db, session), listInductionsWithRounds(db, session)]);
  const latest = inductions[0];
  const timeline = latest ? await inductionTimeline(db, session, latest.id) : [];

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
      <StatTiles
        stats={[
          { label: "Inductions with merit lists", value: overview.inductions },
          { label: "Rounds published", value: overview.rounds },
          { label: "Allocations", value: overview.allocations },
          { label: "Seats in the latest matrix", value: overview.seats, hint: `${overview.hospitals} hospitals` },
        ]}
      />
      {latest ? (
        <Card>
          <CardHeader title={`Latest: induction ${latest.id} · ${latest.rounds[0]!.cycleName}`} description={`Median closing merit per round${latest.maxMarks ? `, out of ${latest.maxMarks}` : ""}.`} />
          <RoundBeam rounds={latest.rounds.map((r) => r.roundNo)} current={latest.rounds.at(-1)!.roundNo} hrefFor={(r) => `/portal/history/${latest.id}/rounds/${r}`} />
          <LineChart title={`Induction ${latest.id}: median closing merit per round`} xLabels={timeline.map((t) => `R${t.roundNo}`)} series={[{ label: "Median closing merit", values: timeline.map((t) => t.medianClosing) }]} height={200} />
        </Card>
      ) : null}
    </AreaPage>
  );
}
