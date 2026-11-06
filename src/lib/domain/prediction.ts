/**
 * Next-round predictions within a cycle, as ranges with a confidence.
 *
 * How far a closing merit moves from round r to r + 1, as a relative change, is a
 * property of the allocation process (seats released and re-offered), not of the
 * marks formula, so past inductions under other policies still inform it. The
 * range is the 20th–80th percentile of those past changes applied to today's
 * closing. Never a single number; always labelled "not official".
 */

export type Confidence = "High" | "Medium" | "Low";
export type Band = { low: number; high: number; n: number; confidence: Confidence; fallback: boolean };

export const BAND = { lowQ: 0.2, highQ: 0.8 } as const;
/** Relative changes beyond this are treated as data errors and left out. */
export const MAX_CHANGE = 0.5;
export const MIN_SAMPLES = 3;

/** Linear-interpolated quantile of an ascending array. */
export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * Math.min(Math.max(q, 0), 1);
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

const r2 = (v: number) => Math.round(v * 100) / 100;
// Round outwards so the shown range never excludes a value it actually contains.
const down2 = (v: number) => Math.floor(v * 100 + 1e-9) / 100;
const up2 = (v: number) => Math.ceil(v * 100 - 1e-9) / 100;

/** The predicted band for the next round, or null with too little history. */
export function predictNext(o: { closing: number; changes: number[]; fallback?: boolean }): Band | null {
  const c = o.changes.filter((x) => Number.isFinite(x) && Math.abs(x) <= MAX_CHANGE).sort((a, b) => a - b);
  if (c.length < MIN_SAMPLES || !(o.closing > 0)) return null;
  const low = down2(o.closing * (1 + quantile(c, BAND.lowQ)));
  const high = up2(o.closing * (1 + quantile(c, BAND.highQ)));
  const width = (high - low) / o.closing;
  const confidence: Confidence = o.fallback ? "Low" : c.length >= 8 && width < 0.02 ? "High" : c.length >= 4 ? "Medium" : "Low";
  return { low: Math.min(low, high), high: Math.max(low, high), n: c.length, confidence, fallback: Boolean(o.fallback) };
}

/** Relative change between two closings, or null when it cannot be computed. */
export const relChange = (from: number | null | undefined, to: number | null | undefined) =>
  from != null && to != null && from > 0 ? (to - from) / from : null;

/** Share of actual values inside their predicted bands (0–1), and the median miss in marks (0 when inside). */
export function coverage(pairs: { low: number; high: number; actual: number }[]) {
  if (pairs.length === 0) return { share: null as number | null, medianMiss: null as number | null, n: 0 };
  const misses = pairs.map((p) => (p.actual < p.low ? p.low - p.actual : p.actual > p.high ? p.actual - p.high : 0)).sort((a, b) => a - b);
  const inside = misses.filter((m) => m === 0).length;
  return { share: inside / pairs.length, medianMiss: r2(quantile(misses, 0.5)), n: pairs.length };
}

/** "17-19" → [17, 18, 19]; "9-10" → [9, 10]; 20 → [20]. */
export function parseInductions(v: unknown): number[] {
  if (typeof v === "number" && Number.isInteger(v)) return [v];
  if (typeof v !== "string") return [];
  const m = /^\s*(\d{1,3})\s*(?:-{1,2}|–)\s*(\d{1,3})\s*$/.exec(v);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    return a <= b && b - a < 50 ? Array.from({ length: b - a + 1 }, (_, i) => a + i) : [];
  }
  return /^\s*\d{1,3}\s*$/.test(v) ? [Number(v)] : [];
}

/**
 * Earlier inductions sharing this induction's scoring policy. A next-induction
 * prediction in raw marks needs at least two of them.
 */
export function samePolicyInductions(policies: Record<string, { induction?: unknown; label?: string; total_marks?: number }>, induction: number) {
  const entry = Object.entries(policies).find(([, p]) => parseInductions(p.induction).includes(induction));
  if (!entry) return { policy: null as string | null, label: null as string | null, total: null as number | null, earlier: [] as number[] };
  const [key, p] = entry;
  return { policy: key, label: p.label ?? key, total: p.total_marks ?? null, earlier: parseInductions(p.induction).filter((n) => n < induction) };
}
