/**
 * Scale for the segmented merit ladder: 20 segments across a range that covers
 * every value with a point of headroom, each segment a whole number of percent.
 */
export const LADDER_SEGMENTS = 20;

export function ladderScale(pcts: number[]): { lo: number; hi: number; step: number } {
  const vals = pcts.filter((v) => Number.isFinite(v));
  if (vals.length === 0) return { lo: 0, hi: 100, step: 5 };
  const lo = Math.max(0, Math.floor(Math.min(...vals)) - 1);
  const top = Math.min(100, Math.ceil(Math.max(...vals)) + 1);
  const step = Math.max(1, Math.ceil((top - lo) / LADDER_SEGMENTS));
  return { lo, hi: lo + step * LADDER_SEGMENTS, step };
}

/** How many segments a value fills (fractional, 0 … LADDER_SEGMENTS). */
export const segmentsFor = (pct: number, s: { lo: number; step: number }) =>
  Math.min(LADDER_SEGMENTS, Math.max(0, (pct - s.lo) / s.step));
