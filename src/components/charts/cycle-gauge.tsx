import Link from "next/link";
import { arcSegment, cycleProgress, type CycleStatus } from "@/lib/domain/cycle";
import { cn } from "../ui/cn";

const SEGMENTS = 26;
const CX = 260, CY = 250, R1 = 150, R2 = 214;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const short = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
const STATUS_TONE: Record<CycleStatus, string> = {
  "Not started": "text-muted",
  Applications: "text-amber",
  "Rounds running": "text-signal",
  "Final list out": "text-success",
  "Cycle closed": "text-muted",
};

/** The cycle gauge for one induction, when its cycle is dated. */
export function gaugeProps(ind: { id: number; rounds: { cycleName: string; startsOn: string | null; endsOn: string | null; importedAt: Date }[] }, prevRounds?: number) {
  const first = ind.rounds[0];
  if (!first?.startsOn || !first.endsOn) return null;
  return {
    induction: ind.id,
    cycleName: first.cycleName,
    startsOn: first.startsOn,
    endsOn: first.endsOn,
    published: ind.rounds.length,
    expectedRounds: prevRounds,
    lastImportAt: ind.rounds.reduce<Date | null>((m, r) => (!m || r.importedAt > m ? r.importedAt : m), null),
  };
}

/**
 * The induction cycle on one dial: segmented arc filled to today against the
 * published cycle dates, rounds marked in order, with the round list and facts
 * beside it. Server-rendered; the only motion is the entrance.
 */
export function CycleGauge({
  induction, cycleName, startsOn, endsOn, published, expectedRounds, lastImportAt, now = new Date(),
}: {
  induction: number;
  cycleName: string;
  startsOn: string;
  endsOn: string;
  published: number;
  expectedRounds?: number;
  lastImportAt: Date | null;
  now?: Date;
}) {
  const c = cycleProgress({ startsOn, endsOn, published, expectedRounds, today: now });
  const frac = c.day / c.totalDays;
  const gid = `mn-gauge-${induction}`;
  const facts: [string, string, string?][] = [
    ["Rounds published", `${c.published} of ${c.expected}`],
    ["Days left in cycle", String(c.daysLeft)],
    ["Next round (estimate)", c.next ? `R${c.next.roundNo} · ${c.next.overdue ? "due now" : `~${short(c.next.estimatedOn)}`}` : c.published >= c.expected ? "All rounds out" : "—"],
    ["Status", c.status, STATUS_TONE[c.status]],
  ];

  return (
    <figure className="m-0 grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <figcaption className="sr-only">
        Induction {induction} cycle, {startsOn} to {endsOn}: day {c.day} of {c.totalDays} ({c.pct}%), {c.published} of {c.expected} rounds published, status {c.status}.
      </figcaption>
      <div className="min-w-0">
        <svg viewBox="0 0 520 290" className="mx-auto block h-auto w-full max-w-[520px]" aria-hidden>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--mn-cyan-strong)" />
              <stop offset="100%" stopColor="color-mix(in srgb, var(--mn-cyan) 55%, var(--mn-teal-deep))" />
            </linearGradient>
            <filter id={`${gid}-glow`} x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          {Array.from({ length: SEGMENTS }, (_, k) => {
            const mid = Math.PI + ((k + 0.5) / SEGMENTS) * Math.PI, w = (0.88 * Math.PI) / SEGMENTS;
            const on = (k + 0.5) / SEGMENTS <= frac;
            return (
              <path
                key={k}
                d={arcSegment(CX, CY, R1, R2, mid - w / 2, mid + w / 2)}
                fill={on ? `url(#${gid})` : "var(--mn-navy-700)"}
                stroke={on ? "var(--mn-cyan-strong)" : "var(--mn-border)"}
                strokeWidth="0.6"
                filter={on ? `url(#${gid}-glow)` : undefined}
                className={on ? "mn-rise" : undefined}
                style={on ? { animationDelay: `${k * 25}ms` } : undefined}
              />
            );
          })}
          {c.rounds.map((r) => {
            const a = Math.PI + r.at * Math.PI, x = CX + (R2 + 20) * Math.cos(a), y = CY + (R2 + 20) * Math.sin(a);
            return (
              <text key={r.roundNo} x={x} y={y + 4} textAnchor="middle" className={cn("font-mono text-[12px]", r.state === "published" ? "fill-signal" : r.state === "next" ? "fill-ink font-semibold" : "fill-subtle")}>
                R{r.roundNo}
              </text>
            );
          })}
          <text x={CX} y={CY - 52} textAnchor="middle" className="fill-ink font-display text-[58px] font-extrabold">{c.pct}%</text>
          <text x={CX} y={CY - 22} textAnchor="middle" className="fill-muted text-[14px]">Day {c.day} of {c.totalDays}</text>
          <text x={CX - (R1 + R2) / 2} y={CY + 24} textAnchor="middle" className="fill-subtle text-[12px]">{short(startsOn)}</text>
          <text x={CX + (R1 + R2) / 2} y={CY + 24} textAnchor="middle" className="fill-subtle text-[12px]">{short(endsOn)}</text>
        </svg>
      </div>
      <div className="grid min-w-0 content-start gap-4">
        <ol className="grid gap-0.5">
          {c.rounds.map((r) => (
            <li key={r.roundNo}>
              <Link
                href={r.state === "published" ? `/portal/history/${induction}/rounds/${r.roundNo}` : `/portal/history/${induction}`}
                className={cn("grid grid-cols-[22px_1fr_auto] items-center gap-3 rounded-xl px-2 py-2 text-sm hover:bg-hover", r.state === "next" && "bg-signal/10")}
              >
                <span
                  aria-hidden
                  className={cn(
                    "h-3 w-3 justify-self-center rounded-full border-2",
                    r.state === "published" && "border-success bg-success shadow-[0_0_10px_color-mix(in_srgb,var(--mn-success)_60%,transparent)]",
                    r.state === "next" && "border-signal bg-signal",
                    r.state === "expected" && "border-line-strong",
                  )}
                />
                <span>Round {r.roundNo} merit list</span>
                <span className="text-xs text-subtle">
                  {r.state === "published" ? "Published" : r.state === "next" ? (c.next?.overdue ? "Next · due now" : `Next · ~${short(r.estimatedOn)}`) : "Expected"}
                </span>
              </Link>
            </li>
          ))}
        </ol>
        <dl className="grid grid-cols-2 gap-x-5 gap-y-3 border-t border-line pt-4 text-sm">
          {facts.map(([k, v, tone]) => (
            <div key={k}>
              <dt className="text-xs text-subtle">{k}</dt>
              <dd className={cn("font-semibold", tone)}>{v}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-subtle">
          {cycleName} cycle, {short(startsOn)} – {short(endsOn)} as published{lastImportAt ? `; last list added to meritNAMA on ${lastImportAt.toISOString().slice(0, 10)}` : ""}. PHF dates the cycle, not each round, so round dates here are estimates.
        </p>
      </div>
    </figure>
  );
}
