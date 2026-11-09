"use client";

import { useRef, useState } from "react";

export type CrosshairPoint = {
  /** Horizontal position as a percent of the chart's width. */
  xPct: number;
  label: string;
  rows: { name: string; value: string; detail?: string; color: string }[];
};

/**
 * Hover, touch and keyboard layer over a server-drawn chart: snaps to the nearest
 * point, draws a crosshair with a label pill on the axis, and shows a tooltip.
 * Focus the chart and use ← → to move; the tooltip text is announced.
 */
export function ChartCrosshair({ points, plotTopPct, plotBottomPct, title }: { points: CrosshairPoint[]; plotTopPct: number; plotBottomPct: number; title: string }) {
  const [i, setI] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  if (points.length === 0) return null;

  const nearest = (clientX: number) => {
    const box = ref.current!.getBoundingClientRect();
    const pct = ((clientX - box.left) / box.width) * 100;
    let best = 0;
    points.forEach((p, k) => { if (Math.abs(p.xPct - pct) < Math.abs(points[best]!.xPct - pct)) best = k; });
    return best;
  };
  const p = i === null ? null : points[i]!;
  const flip = p ? p.xPct > 62 : false;

  return (
    <div
      ref={ref}
      tabIndex={0}
      role="group"
      aria-label={`${title}. Use the left and right arrow keys to read values.`}
      className="absolute inset-0 cursor-crosshair rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-signal/60"
      onPointerMove={(e) => setI(nearest(e.clientX))}
      onPointerDown={(e) => setI(nearest(e.clientX))}
      onPointerLeave={(e) => e.pointerType === "mouse" && setI(null)}
      onFocus={() => setI((v) => v ?? points.length - 1)}
      onBlur={() => setI(null)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") { e.preventDefault(); setI((v) => Math.max(0, (v ?? points.length) - 1)); }
        if (e.key === "ArrowRight") { e.preventDefault(); setI((v) => Math.min(points.length - 1, (v ?? -1) + 1)); }
        if (e.key === "Escape") setI(null);
      }}
    >
      {p ? (
        <>
          <span aria-hidden className="pointer-events-none absolute w-px bg-ink/70" style={{ left: `${p.xPct}%`, top: `${plotTopPct}%`, bottom: `${100 - plotBottomPct}%` }} />
          <span aria-hidden className="pointer-events-none absolute -translate-x-1/2 translate-y-1 rounded-full bg-ink px-2 py-0.5 font-mono text-[0.68rem] font-semibold text-canvas" style={{ left: `${p.xPct}%`, top: `${plotBottomPct}%` }}>
            {p.label}
          </span>
          <div
            role="status"
            className="pointer-events-none absolute top-2 z-10 min-w-36 rounded-xl border border-line-strong bg-surface/95 px-3 py-2 text-xs shadow-[var(--mn-shadow-2)] backdrop-blur"
            style={flip ? { right: `${100 - p.xPct + 1.5}%` } : { left: `${p.xPct + 1.5}%` }}
          >
            <p className="mb-1 font-semibold text-ink">{p.label}</p>
            {p.rows.map((r) => (
              <p key={r.name} className="flex items-center gap-2 text-muted">
                <span aria-hidden className="h-2 w-2 flex-none rounded-full" style={{ background: r.color }} />
                <span className="min-w-0 flex-1 truncate">{r.name}</span>
                <span className="font-mono font-semibold tabular-nums text-ink">{r.value}</span>
                {r.detail ? <span className="font-mono text-subtle">{r.detail}</span> : null}
              </p>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
