import Link from "next/link";
import { AreaPage } from "@/components/area-page";
import { CycleStripView, HealthRow, InductionChecks, laneHeadline, NeedsYouList } from "@/components/admin/today";
import { Badge } from "@/components/ui/badge";
import { AuroraHeader } from "@/components/ui/aurora-header";
import { Metric } from "@/components/ui/metric";
import { getSession, requireSection } from "@/lib/auth/session";
import { cycleStrip, inductionCards, needsYou, systemHealth } from "@/lib/data/admin-today";
import { latestJoining } from "@/lib/data/joining";
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
  const [queue, cards, strip, health, joining] = await Promise.all([needsYou(db, session), inductionCards(db, session), cycleStrip(db, session), systemHealth(db, session), latestJoining(db, session).catch(() => null)]);
  const running = cards.find((c) => c.induction === strip?.induction) ?? cards.find((c) => !c.closed) ?? cards[0] ?? null;

  const waste = running && joining && joining.induction === running.induction ? joining.total : null;
  // PHF's portal schedule has housekeeping steps (logins, timers); the strip keeps the ones that move the cycle.
  const steps = (strip?.steps ?? []).filter((x) => !/login|display|remaning|remaining|sign ?up|register|^seats$/i.test(x.title)).slice(0, 8);
  const stat = (label: string, value: string, color?: string) => (
    <div><dt className="text-[11px] uppercase tracking-[0.1em] text-[#F3EEE5]/[.72]">{label}</dt><dd className="mt-0.5 text-[26px] font-semibold tabular-nums" style={color ? { color } : undefined}>{value}</dd></div>
  );

  return (
    <AreaPage {...frame} bare>
      <p className="text-[13px] text-muted">Admin / <b className="font-semibold text-ink">Today</b></p>
      <AuroraHeader as="section" className="flex flex-col gap-[18px] !rounded-[20px] px-5 py-[22px] sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="min-w-0">
            <p className="mb-1 text-xs uppercase tracking-[0.1em] text-[#F3EEE5]/[.72]">{strip ? "Running · from PHF's schedule" : "Running"}</p>
            <h1 className="text-[30px] font-bold tracking-[-0.02em]">{running ? <>Induction {running.induction} · {running.rounds.length && !running.closed ? `round ${running.rounds.at(-1)} out` : laneHeadline(running).toLowerCase()}</> : "No induction data yet"}</h1>
            <p className="mt-1.5 text-sm text-[#F3EEE5]/[.72]">
              {strip?.next ? <>Next PHF step: <b className="text-[#F3EEE5]">{strip.next.title}</b>, <b className="text-[#E5A04B]">{strip.next.when}</b>.</> : strip ? "Every step on PHF's schedule has started." : "Drop the induction's schedule file into Data to see PHF's dates here."}
            </p>
          </div>
          {running ? (
            <dl className="flex flex-wrap gap-7">
              {waste
                ? <>{stat("Seats", fmt(waste.seats))}{stat("Joined", fmt(waste.joined), "#3DDC97")}{stat("Wasted", fmt(waste.wasted), "#FF7A7A")}</>
                : <>{stat("Official rounds", running.rounds.length ? fmt(running.rounds.length) : "—")}{stat("Consent rounds", running.consent.length ? fmt(running.consent.length) : "—")}</>}
            </dl>
          ) : null}
        </div>
        {steps.length ? <CycleStripView steps={steps} /> : null}
      </AuroraHeader>

      <div className="grid items-start gap-[18px] xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <section aria-labelledby="needs" className="mn-card-glass rounded-[20px] border border-white/[.07] p-5">
          <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
            <h2 id="needs" className="text-[17px] font-semibold text-[#F7F7FA]">Needs you {queue.length ? <span className="font-medium text-muted">· {queue.length}, most urgent first</span> : null}</h2>
            <span className="text-xs text-muted">Updated <span className="text-[#3DDC97] motion-safe:animate-pulse">●</span> just now</span>
          </div>
          <NeedsYouList items={queue} />
        </section>

        <div className="flex flex-col gap-[18px]">
          {running ? (
            <section aria-labelledby="ind-data" className="mn-card-glass rounded-[20px] border border-white/[.07] p-5">
              <div className="mb-3 flex items-center justify-between"><h2 id="ind-data" className="text-[15px] font-semibold text-[#F7F7FA]">Induction {running.induction} data</h2><Link href="/admin/data" className="text-[13px] text-[#B9AAFF] hover:text-[#D6CCFF]">Open in Data →</Link></div>
              <InductionChecks c={running} />
              <p className="mt-3 text-[13px] text-muted">
                {running.next
                  ? <>Next: <Link href={running.next.href} className="text-[#B9AAFF] hover:text-[#D6CCFF]">{running.next.label}</Link>.</>
                  : `Rounds ${running.rounds.length ? `1–${running.rounds.at(-1)}` : "none yet"} · consent ${running.consent.length ? `1–${running.consent.at(-1)}` : "none yet"}${running.joining ? ` · ${fmt(running.joining.joined)} of ${fmt(running.joining.total)} joined` : ""}.`}
              </p>
            </section>
          ) : null}
          <NoticesCard db={db} session={session} />
          <section aria-labelledby="health" className="mn-card-glass rounded-[20px] border border-white/[.07] p-5">
            <h2 id="health" className="mb-3 text-[15px] font-semibold text-[#F7F7FA]">Health</h2>
            <HealthRow items={health} />
          </section>
        </div>
      </div>
    </AreaPage>
  );
}
