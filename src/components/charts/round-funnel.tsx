"use client";

import { useState } from "react";
import type { SettlingRound } from "@/lib/data/insights";
import { bandPath, biggestSettle, movingPct } from "@/lib/domain/funnel";
import { cn } from "../ui/cn";

const fmt = (n: number) => n.toLocaleString("en-US");
const W = 960, H = 300, MID = 172, MAXH = 228;

/**
 * "Who is still moving": layered bands per round. The outer bands are candidates
 * holding a seat; the bright inner band is how many of the final round's
 * candidates are not yet in the seat they keep, so it narrows to nothing.
 */
export function RoundFunnel({ final, rounds, caption }: { final: number; rounds: SettlingRound[]; caption: string }) {
  const [col, setCol] = useState(Math.min(1, rounds.length - 1));
  if (rounds.length === 0 || final === 0) return null;
  const n = rounds.length, cw = W / n;
  const maxHolding = Math.max(...rounds.map((r) => r.holding), 1);
  const outer = rounds.map((r) => (r.holding / maxHolding) * MAXH);
  const inner = rounds.map((r) => Math.max((r.moving / final) * MAXH, 3));
  const first = rounds[0]!, best = biggestSettle(rounds.map((r) => r.moving), final);
  const sel = rounds[col]!;
  const detail: [string, string][] = col === 0
    ? [[fmt(first.holding), "holding a seat in round 1"], [fmt(first.moving), "will still move later"], [fmt(final - first.moving), "already in their final seat"], ["—", "pick a later round to compare"]]
    : [[fmt(sel.holding), `holding a seat in round ${sel.roundNo}`], [fmt(sel.entered), "new in this round"], [fmt(sel.moved), "moved to a different seat"], [fmt(sel.left), "left the list"]];

  return (
    <figure className="m-0 grid min-w-0 gap-4">
      <figcaption className="sr-only">
        {caption}. {rounds.map((r) => `Round ${r.roundNo}: ${r.moving} of ${final} still moving`).join("; ")}.
      </figcaption>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-3xl font-semibold tabular-nums">{movingPct(first.moving, final)}%</p>
          <p className="text-xs text-subtle">still to settle after round {first.roundNo} · {fmt(first.moving)} of {fmt(final)} candidates</p>
        </div>
        {best && best[2] > 0 ? (
          <div className="text-right">
            <p className="font-mono text-3xl font-semibold tabular-nums text-success">−{best[2]} pts</p>
            <p className="text-xs text-subtle">biggest single-round settle (R{best[0]} → R{best[1]})</p>
          </div>
        ) : null}
      </div>
      <div className="relative overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full min-w-[620px]" role="group" aria-label="Rounds: choose one to see its details below">
          <defs>
            <linearGradient id="mn-funnel-core" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--mn-text)" />
              <stop offset="100%" stopColor="color-mix(in srgb, var(--mn-text) 72%, var(--mn-navy-700))" />
            </linearGradient>
          </defs>
          <path aria-hidden d={bandPath(outer, { width: W, mid: MID })} fill="var(--mn-border-strong)" opacity="0.6" />
          <path aria-hidden d={bandPath(outer.map((h) => h * 0.82), { width: W, mid: MID })} fill="var(--mn-text-subtle)" opacity="0.35" />
          <path aria-hidden className="mn-grow-x" style={{ transformBox: "fill-box" }} d={bandPath(inner, { width: W, mid: MID })} fill="url(#mn-funnel-core)" />
          {rounds.map((r, i) => {
            const cx = i * cw + cw / 2, pct = movingPct(r.moving, final);
            return (
              <g key={r.roundNo}>
                {i > 0 ? <line aria-hidden x1={i * cw} x2={i * cw} y1={40} y2={H - 4} stroke="var(--mn-border)" /> : null}
                <rect
                  x={i * cw} y={0} width={cw} height={H}
                  className={cn("cursor-pointer outline-none", i === col ? "fill-[rgba(244,244,245,0.04)]" : "fill-transparent hover:fill-[rgba(244,244,245,0.03)]")}
                  onMouseEnter={() => setCol(i)} onFocus={() => setCol(i)} onClick={() => setCol(i)}
                  tabIndex={0} role="button" aria-label={`Round ${r.roundNo}: details`} aria-pressed={i === col}
                />
                <text aria-hidden x={cx} y={26} textAnchor="middle" className="pointer-events-none fill-ink font-mono text-[17px] font-semibold">{r.moving ? fmt(r.moving) : "Settled"}</text>
                <text aria-hidden x={cx} y={44} textAnchor="middle" className="pointer-events-none fill-subtle text-[11px]">{r.moving ? "still moving" : `${fmt(final)} in final seats`}</text>
                <rect aria-hidden x={cx - 27} y={MID - 14} width={54} height={28} rx={14} className="pointer-events-none fill-ink" />
                <text aria-hidden x={cx} y={MID + 5} textAnchor="middle" className="pointer-events-none fill-canvas font-mono text-[13px] font-semibold">{pct}%</text>
                <text aria-hidden x={cx} y={H - 12} textAnchor="middle" className="pointer-events-none fill-muted text-[12px]">Round {r.roundNo}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-live="polite">
        {detail.map(([v, l]) => (
          <div key={l} className="rounded-xl border border-line bg-canvas px-3 py-2.5">
            <dt className="sr-only">{l}</dt>
            <dd className="font-mono text-lg font-semibold tabular-nums">{v}</dd>
            <dd className="text-xs text-subtle" aria-hidden>{l}</dd>
          </div>
        ))}
      </dl>
    </figure>
  );
}
