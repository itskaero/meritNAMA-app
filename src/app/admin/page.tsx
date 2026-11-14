import Link from "next/link";
import { AreaPage } from "@/components/area-page";
import { CycleStripView, HealthRow, InductionCardView, laneHeadline, NeedsYouList } from "@/components/admin/today";
import { Badge } from "@/components/ui/badge";
import { AuroraHeader, AuroraStat } from "@/components/ui/aurora-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Metric } from "@/components/ui/metric";
import { getSession, requireSection } from "@/lib/auth/session";
import { cycleStrip, inductionCards, needsYou, systemHealth } from "@/lib/data/admin-today";
import { checkDatabase, getDb } from "@/lib/db/client";
import { findSection } from "@/lib/navigation";
import { NoticesCard } from "./notices";

export const metadata = { title: "Today" };
export const dynamic = "force-dynamic";

const dbBadge = {
  unreachable: <Badge tone="danger">Unreachable</Badge>,
  not_configured: <Badge tone="warning">Not configured</Badge>,
} as const;

const fmt = (n: number) => n.toLocaleString("en-US");

/** Admin Today: where the cycle is, what needs a person, the running induction, the bar, and health. */
export default async function AdminTodayPage() {
  await requireSection("/admin");
  const s = findSection("/admin");
  const status = await checkDatabase();
  const frame = { area: "admin" as const, trail: [{ label: s.label }], isRoot: true, title: s.label, description: s.description };
  if (status !== "ok") {
    return (
      <AreaPage {...frame}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Database" value={null} badge={dbBadge[status]} hint="Live check" /></div>
      </AreaPage>
    );
  }
  const db = getDb();
  const session = (await getSession())!;
  const [queue, cards, strip, health] = await Promise.all([needsYou(db, session), inductionCards(db, session), cycleStrip(db, session), systemHealth(db, session)]);
  const running = cards.find((c) => c.induction === strip?.induction) ?? cards.find((c) => !c.closed) ?? cards[0] ?? null;

  return (
    <AreaPage {...frame}>
      <AuroraHeader as="section" className="grid gap-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-start gap-6">
          <div className="min-w-0 flex-1">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-[#F3EEE5]/65">{strip ? "Running · from PHF's schedule" : "Running"}</p>
            <h2 className="mt-1 text-2xl font-semibold text-[#F3EEE5]">
              {running ? <>Induction {running.induction} · {laneHeadline(running).toLowerCase()}</> : "No induction data yet"}
            </h2>
            <p className="mt-1 text-sm text-[#F3EEE5]/75">
              {strip?.next ? <>Next PHF step: <span className="font-semibold text-[#F3EEE5]">{strip.next.title}</span>, {strip.next.when}.</> : strip ? "Every step on PHF's schedule has started." : "Drop the induction's schedule file into Data to see PHF's dates here."}
            </p>
          </div>
          {running ? (
            <div className="flex flex-wrap gap-6">
              <AuroraStat label="Official rounds" value={running.rounds.length ? fmt(running.rounds.length) : "—"} />
              <AuroraStat label="Consent rounds" value={running.consent.length ? fmt(running.consent.length) : "—"} />
              {running.joining ? <AuroraStat label="Joined" value={fmt(running.joining.joined)} hint={`of ${fmt(running.joining.total)} listed`} /> : null}
            </div>
          ) : null}
        </div>
        {strip?.steps.length ? <CycleStripView steps={strip.steps} /> : null}
      </AuroraHeader>

      <Card>
        <CardHeader title={queue.length ? `Needs you · ${queue.length}` : "Needs you"} description="Everything waiting for a person, most urgent first. You see what your role can act on." />
        <NeedsYouList items={queue} />
      </Card>

      {running ? (
        <section aria-label={`Induction ${running.induction} data`} className="grid gap-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-muted">Induction {running.induction} data</h2>
            <Link href="/admin/data" className="text-sm font-semibold text-signal hover:underline">Open in Data →</Link>
          </div>
          <InductionCardView c={running} compact />
        </section>
      ) : null}

      <NoticesCard db={db} session={session} />

      <section aria-label="Health" className="grid gap-2">
        <h2 className="text-sm font-semibold text-muted">Health</h2>
        <HealthRow items={health} />
      </section>
    </AreaPage>
  );
}
