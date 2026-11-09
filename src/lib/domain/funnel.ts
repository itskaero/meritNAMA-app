/**
 * Geometry for the round funnel: a horizontal band per layer whose height per
 * round column is given, joined by smooth S-curves at column edges. Pure so it is
 * unit-tested; the component only draws the returned path.
 */
export function bandPath(heights: number[], o: { width: number; mid: number; ease?: number }): string {
  const n = heights.length;
  if (n === 0) return "";
  const cw = o.width / n, ease = Math.min(o.ease ?? 34, cw / 3);
  const r = (v: number) => Math.round(v * 10) / 10;
  const top = heights.map((h) => r(o.mid - h / 2)), bot = heights.map((h) => r(o.mid + h / 2));
  let p = `M0,${top[0]}`;
  for (let i = 0; i < n; i++) {
    const xe = (i + 1) * cw;
    p += ` L${r(i === n - 1 ? o.width : xe - ease)},${top[i]}`;
    if (i < n - 1) p += ` C${r(xe - 8)},${top[i]} ${r(xe + 8)},${top[i + 1]} ${r(xe + ease)},${top[i + 1]}`;
  }
  p += ` L${r(o.width)},${bot[n - 1]}`;
  for (let i = n - 1; i >= 0; i--) {
    const xs = i * cw;
    p += ` L${r(i === 0 ? 0 : xs + ease)},${bot[i]}`;
    if (i > 0) p += ` C${r(xs + 8)},${bot[i]} ${r(xs - 8)},${bot[i - 1]} ${r(xs - ease)},${bot[i - 1]}`;
  }
  return `${p} Z`;
}

/** Share still moving, in whole percent (0 when nobody is in the final round). */
export const movingPct = (moving: number, final: number) => (final > 0 ? Math.round((moving / final) * 100) : 0);

/** The round transition that settled the most candidates, as [fromRound, toRound, points]. */
export function biggestSettle(moving: number[], final: number): [number, number, number] | null {
  let best: [number, number, number] | null = null;
  for (let i = 1; i < moving.length; i++) {
    const pts = final > 0 ? ((moving[i - 1]! - moving[i]!) / final) * 100 : 0;
    if (!best || pts > best[2]) best = [i, i + 1, Math.round(pts)];
  }
  return best;
}
