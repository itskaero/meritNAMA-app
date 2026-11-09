import { classify, STATUS_LABEL, type FinderStatus } from "./finder";

/**
 * The "your chance" dial for one option: a half circle from `lo` to `hi` percent,
 * split into Out of reach / Borderline / Safe at the final-round and first-round
 * closing merit, with a needle at the candidate's score. Same rule as the finder.
 */
export type DialModel = {
  lo: number;
  hi: number;
  status: FinderStatus;
  label: string;
  /** Angle in radians for a percent value: π (left) … 2π (right). */
  angle: (pct: number) => number;
  reason: string;
};

export function dialModel(o: { mePct: number; firstPct: number; lastPct: number; firstRound: number; lastRound: number }): DialModel {
  const last = Math.min(o.firstPct, o.lastPct);
  const lo = Math.max(0, Math.floor(Math.min(o.mePct, last) - 3));
  const hi = Math.min(100, Math.ceil(Math.max(o.mePct, o.firstPct) + 3));
  const span = Math.max(hi - lo, 1);
  const status = classify(o.mePct, o.firstPct, o.lastPct);
  const f = (v: number) => `${v.toFixed(1)}%`;
  const reason =
    status === "safe" ? `Your ${f(o.mePct)} reaches round ${o.firstRound}'s closing (${f(o.firstPct)}).`
    : status === "borderline" ? `Below round ${o.firstRound}'s ${f(o.firstPct)} but above round ${o.lastRound}'s ${f(last)}: seats that freed up later would have reached you.`
    : `Below even round ${o.lastRound}'s closing (${f(last)}) last time.`;
  return {
    lo,
    hi,
    status,
    label: STATUS_LABEL[status],
    angle: (pct) => Math.PI + (Math.min(Math.max(pct, lo), hi) - lo) / span * Math.PI,
    reason,
  };
}
