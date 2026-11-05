import { dialModel } from "@/lib/domain/chance";
import { cn } from "../ui/cn";

const TONE = { safe: "text-success", borderline: "text-amber", out: "text-danger" } as const;

/**
 * "Your chance" for one option: arc zones Out of reach (red) → Borderline (amber)
 * → Safe (green), split at the final-round and first-round closing, and a needle
 * at the score. Percent of each induction's total; raw marks in the caption.
 */
export function ChanceDial({
  mePct, firstPct, lastPct, firstRound, lastRound, compact = false, note,
}: {
  mePct: number; firstPct: number; lastPct: number; firstRound: number; lastRound: number; compact?: boolean; note?: string;
}) {
  const m = dialModel({ mePct, firstPct, lastPct, firstRound, lastRound });
  const W = 300, cx = 150, cy = 150, R = 118;
  const pt = (r: number, a: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
  const arc = (from: number, to: number, color: string) => {
    if (to - from < 0.001) return null;
    const [x0, y0] = pt(R, m.angle(from)), [x1, y1] = pt(R, m.angle(to));
    return <path d={`M${x0.toFixed(1)},${y0.toFixed(1)} A${R},${R} 0 0 1 ${x1.toFixed(1)},${y1.toFixed(1)}`} stroke={color} strokeWidth={18} fill="none" />;
  };
  const last = Math.min(firstPct, lastPct);
  const [nx, ny] = pt(R + 6, m.angle(mePct));
  const tag = (v: number, text: string, dy: number) => {
    const [x, y] = pt(R + 26, m.angle(v));
    return <text x={x} y={y + dy} textAnchor="middle" className="fill-muted text-[11px]">{text}</text>;
  };
  return (
    <figure className={cn("m-0 grid min-w-0 items-center gap-3", compact ? "grid-cols-[7.5rem_minmax(0,1fr)]" : "gap-2")}>
      <svg viewBox={`0 0 ${W} 172`} className={cn("block h-auto w-full", compact ? "" : "mx-auto max-w-[300px]")} aria-hidden>
        {arc(m.lo, last, "var(--mn-danger)")}
        {arc(last, firstPct, "var(--mn-amber)")}
        {arc(firstPct, m.hi, "var(--mn-success)")}
        {compact ? null : (
          <>
            {tag(last, `R${lastRound} ${last.toFixed(1)}%`, firstPct - last < 2 ? 10 : 0)}
            {tag(firstPct, `R${firstRound} ${firstPct.toFixed(1)}%`, firstPct - last < 2 ? -8 : 0)}
          </>
        )}
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="var(--mn-text)" strokeWidth={compact ? 5 : 3.5} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={compact ? 11 : 8} fill="var(--mn-text)" />
      </svg>
      <figcaption className={cn("min-w-0", compact ? "" : "text-center")}>
        <span className={cn("block font-display font-extrabold", compact ? "text-lg" : "text-2xl", TONE[m.status])}>{m.label}</span>
        <span className="block text-xs text-muted">{m.reason}</span>
        {note ? <span className="mt-1 block text-[0.7rem] text-subtle">{note}</span> : null}
      </figcaption>
    </figure>
  );
}
