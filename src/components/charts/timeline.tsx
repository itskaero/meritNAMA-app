import Link from "next/link";
import { cn } from "../ui/cn";

export type TimelineRow = {
  id: number;
  label: string;
  sub?: string;
  /** ISO dates (YYYY-MM-DD) of the cycle. */
  start: string;
  end: string;
  rounds: number[];
  href: (round: number) => string;
  /** Highlight: the newest induction is a white pill, a running cycle is teal. */
  tone: "latest" | "active" | "past";
};

const DAY = 86_400_000;
const parse = (d: string) => Date.parse(`${d}T00:00:00Z`);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Gantt-style view of induction cycles on a date axis, with a "Now" line. The PHF
 * files date each cycle, not each round, so a cycle's bar is split into its rounds
 * in order (equal segments, labelled R1…Rn); each segment opens that round.
 */
export function Timeline({ rows, now = new Date(), caption }: { rows: TimelineRow[]; now?: Date; caption: string }) {
  if (rows.length === 0) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const lo = Math.min(...rows.map((r) => parse(r.start)), today) - 15 * DAY;
  const hi = Math.max(...rows.map((r) => parse(r.end)), today) + 20 * DAY;
  const x = (t: number) => ((t - lo) / (hi - lo)) * 100;

  // Month ticks; label every month when the span is short, otherwise every other.
  const ticks: { t: number; label: string }[] = [];
  const first = new Date(lo);
  for (let d = Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1); d < hi; ) {
    const dt = new Date(d);
    ticks.push({ t: d, label: `${MONTHS[dt.getUTCMonth()]}${dt.getUTCMonth() === 0 ? ` ${dt.getUTCFullYear()}` : ""}` });
    d = Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 1);
  }
  const every = ticks.length > 14 ? 2 : 1;
  const nowLabel = `${new Date(today).getUTCDate()} ${MONTHS[new Date(today).getUTCMonth()]}`;

  return (
    <figure className="m-0 min-w-0">
      <figcaption className="sr-only">{caption}</figcaption>
      <div className="relative overflow-x-auto rounded-2xl border border-line bg-canvas">
        <div className="relative min-w-[720px] px-4 pb-4">
          {/* Axis */}
          <div className="relative h-12 border-b border-line">
            {ticks.map((t, i) => (
              <span key={t.t} className="absolute top-4 -translate-x-1/2 whitespace-nowrap font-mono text-[0.7rem] text-subtle" style={{ left: `${x(t.t)}%` }}>
                {i % every === 0 ? t.label : ""}
              </span>
            ))}
            <span
              className={cn("absolute top-2 z-[2] whitespace-nowrap rounded-md bg-signal px-1.5 py-0.5 font-mono text-[0.7rem] font-semibold text-signal-ink", x(today) > 88 ? "-translate-x-full" : "-translate-x-1/2")}
              style={{ left: `${x(today)}%` }}
            >
              Now · {nowLabel}
            </span>
          </div>
          {/* Grid lines and the Now line */}
          <div aria-hidden className="pointer-events-none absolute inset-x-4 bottom-4 top-12">
            {ticks.map((t) => <span key={t.t} className="absolute inset-y-0 w-px bg-line/60" style={{ left: `${x(t.t)}%` }} />)}
            <span className="absolute inset-y-0 z-[1] w-px bg-signal shadow-[0_0_10px_var(--mn-cyan)]" style={{ left: `${x(today)}%` }} />
          </div>
          {/* Rows */}
          <ol className="relative grid gap-3 pt-4">
            {rows.map((r, ri) => {
              const s = parse(r.start), e = parse(r.end) + DAY;
              const days = Math.round((e - s) / DAY);
              return (
                <li key={r.id} className="relative h-14">
                  <div
                    className={cn(
                      "mn-grow-x absolute inset-y-1 flex overflow-hidden rounded-xl border",
                      r.tone === "latest" && "border-ink bg-ink text-canvas",
                      r.tone === "active" && "border-signal/40 bg-[linear-gradient(90deg,var(--mn-teal-deep),color-mix(in_srgb,var(--mn-cyan)_55%,var(--mn-teal-deep)))] text-ink",
                      r.tone === "past" && "border-line-strong bg-elevated text-ink",
                    )}
                    style={{ left: `${x(s)}%`, width: `${Math.max(x(e) - x(s), 8)}%`, animationDelay: `${ri * 90}ms` }}
                  >
                    {r.rounds.map((n, i) => (
                      <Link
                        key={n}
                        href={r.href(n)}
                        aria-label={`${r.label}, round ${n}`}
                        className={cn(
                          "flex min-w-0 flex-1 items-center justify-center font-mono text-[0.7rem] font-semibold transition-colors",
                          i > 0 && (r.tone === "latest" ? "border-l border-canvas/15" : "border-l border-line"),
                          r.tone === "latest" ? "hover:bg-canvas/10" : "hover:bg-hover",
                        )}
                      >
                        R{n}
                      </Link>
                    ))}
                  </div>
                  {/* Label sits right of the bar when there is room, else inside the axis gutter */}
                  <div className="pointer-events-none absolute inset-y-0 flex items-center gap-2 pl-2" style={{ left: `${Math.min(x(e), 78)}%` }}>
                    <span className="whitespace-nowrap text-sm font-semibold">{r.label}</span>
                    <span className="whitespace-nowrap rounded-md bg-surface px-1.5 py-0.5 font-mono text-[0.68rem] text-muted ring-1 ring-line">{days} days</span>
                    {r.sub ? <span className="whitespace-nowrap text-xs text-subtle">{r.sub}</span> : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
      <p className="mt-2 text-xs text-subtle">Bars span each induction&apos;s cycle dates as published; rounds are shown in order because individual round dates are not in the files.</p>
    </figure>
  );
}
