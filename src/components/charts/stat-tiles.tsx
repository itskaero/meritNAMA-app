import { cn } from "../ui/cn";
import { CountUp } from "./count-up";

export type Delta = {
  /** Change since the comparison point (positive or negative). */
  value: number;
  /** e.g. "vs round 5". */
  label: string;
  /** Which direction is good news; colours follow it. "neutral" keeps it grey. */
  better: "up" | "down" | "neutral";
  format?: (v: number) => string;
};
export type Stat = { label: string; value: number; hint?: string; delta?: Delta; format?: (v: number) => string };

/** The change badge: arrow and sign carry the meaning, colour supports it. */
function DeltaBadge({ d }: { d: Delta }) {
  const flat = Math.abs(d.value) < 1e-9;
  const good = flat || d.better === "neutral" ? null : (d.value > 0) === (d.better === "up");
  const f = d.format ?? ((v: number) => v.toLocaleString("en-US"));
  return (
    <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted">
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-mono font-semibold tabular-nums",
          good === null ? "bg-elevated text-muted" : good ? "bg-success/15 text-success" : "bg-danger/15 text-danger",
        )}
      >
        <span aria-hidden>{flat ? "=" : d.value > 0 ? "▲" : "▼"}</span>
        {flat ? "0" : `${d.value > 0 ? "+" : "−"}${f(Math.abs(d.value))}`}
      </span>
      {d.label}
    </p>
  );
}

/** Headline numbers that count up and rise in, staggered, with an optional change badge. */
export function StatTiles({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((s, i) => (
        <section key={s.label} className="mn-rise min-w-0 rounded-[1.5rem] border border-line bg-surface p-5" style={{ animationDelay: `${i * 70}ms` }}>
          <p className="text-xs text-muted">{s.label}</p>
          <p className="mt-3 font-display text-4xl font-extrabold tracking-tight [font-stretch:110%]">
            {s.format ? <span className="tabular-nums">{s.format(s.value)}</span> : <CountUp value={s.value} />}
          </p>
          {s.delta ? <DeltaBadge d={s.delta} /> : null}
          {s.hint ? <p className="mt-1 text-xs text-subtle">{s.hint}</p> : null}
        </section>
      ))}
    </div>
  );
}
