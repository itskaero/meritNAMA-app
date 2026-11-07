import { ChartCrosshair } from "./chart-crosshair";

export type Series = {
  label: string;
  /** One value per x label; null leaves a gap. */
  values: (number | null)[];
  tone?: "ember" | "teal" | "muted";
  /** Optional extra text per point for the tooltip, e.g. the raw marks behind a percent. */
  details?: (string | null)[];
};

const STROKE = { ember: "var(--mn-ember)", teal: "var(--mn-cyan)", muted: "var(--mn-text-subtle)" } as const;

function niceTicks(lo: number, hi: number, count = 4) {
  const span = hi - lo || 1;
  const step = 10 ** Math.floor(Math.log10(span / count));
  const unit = [1, 2, 2.5, 5, 10].map((m) => m * step).find((s) => span / s <= count) ?? step * 10;
  const start = Math.floor(lo / unit) * unit, end = Math.ceil(hi / unit) * unit;
  const ticks: number[] = [];
  for (let t = start; t <= end + unit / 2; t += unit) ticks.push(Number(t.toFixed(6)));
  return ticks;
}

/**
 * Multi-series line chart, drawn to one scale. Lines draw in on load (CSS), the last
 * point of the first series is emphasised. A data table follows for screen readers.
 */
export function LineChart({ xLabels, series, format = (v) => v.toFixed(2), title, height = 220 }: {
  xLabels: string[];
  series: Series[];
  format?: (v: number) => string;
  title: string;
  height?: number;
}) {
  const W = 640, H = height, L = 52, R = 18, T = 14, B = 34;
  const all = series.flatMap((s) => s.values.filter((v): v is number => v != null));
  if (all.length === 0) return null;
  const ticks = niceTicks(Math.min(...all), Math.max(...all));
  const lo = ticks[0]!, hi = ticks[ticks.length - 1]!;
  const x = (i: number) => L + (xLabels.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (xLabels.length - 1));
  const y = (v: number) => T + ((hi - v) / (hi - lo || 1)) * (H - T - B);
  const every = Math.max(1, Math.ceil(xLabels.length / 10));

  const paths = series.map((s) => {
    let d = "", pen = false;
    s.values.forEach((v, i) => {
      if (v == null) { pen = false; return; }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
      pen = true;
    });
    return d.trim();
  });
  const first = series[0]!;
  // Area under the first series, one closed shape per unbroken run of points.
  const areas: string[] = [];
  let run: number[] = [];
  const flush = () => {
    if (run.length > 1) areas.push(`M${x(run[0]!)} ${y(first.values[run[0]!]!)} ${run.slice(1).map((k) => `L${x(k)} ${y(first.values[k]!)}`).join(" ")} L${x(run.at(-1)!)} ${H - B} L${x(run[0]!)} ${H - B}Z`);
    run = [];
  };
  first.values.forEach((v, k) => (v == null ? flush() : run.push(k)));
  flush();
  const lastIdx = first.values.reduce<number>((acc, v, i) => (v != null ? i : acc), -1);

  return (
    <figure className="m-0 min-w-0">
      <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={title}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--mn-border)" strokeWidth="1" />
            <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--mn-text-subtle)" fontFamily="var(--mn-font-mono)">{format(t)}</text>
          </g>
        ))}
        {xLabels.map((l, i) => (i % every === 0 || i === xLabels.length - 1 ? (
          <text key={i} x={x(i)} y={H - 10} textAnchor="middle" fontSize="11" fill="var(--mn-text-muted)" fontFamily="var(--mn-font-mono)">{l}</text>
        ) : null))}
        {areas.map((d, k) => <path key={`area-${k}`} d={d} fill={STROKE[first.tone ?? "ember"]} fillOpacity="0.1" />)}
        {series.map((s, si) => (
          <path
            key={s.label}
            d={paths[si]}
            pathLength={1}
            className="mn-draw"
            style={{ animationDelay: `${si * 120}ms` }}
            fill="none"
            stroke={STROKE[s.tone ?? (si === 0 ? "ember" : "muted")]}
            strokeWidth={si === 0 ? 2.5 : 2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {series.map((s, si) => s.values.map((v, i) => (v == null ? null : (
          <circle key={`${si}-${i}`} cx={x(i)} cy={y(v)} r={si === 0 && i === lastIdx ? 5 : 2.5} fill={si === 0 && i === lastIdx ? "var(--mn-ember-hot)" : STROKE[s.tone ?? (si === 0 ? "ember" : "muted")]} />
        ))))}
        {lastIdx >= 0 ? (
          <text x={Math.min(x(lastIdx), W - R)} y={y(first.values[lastIdx]!) - 12} textAnchor={x(lastIdx) > W - 80 ? "end" : "middle"} fontSize="12" fontWeight="600" fill="var(--mn-ember-hot)" fontFamily="var(--mn-font-mono)">
            {format(first.values[lastIdx]!)}
          </text>
        ) : null}
      </svg>
      <ChartCrosshair
        title={title}
        plotTopPct={(T / H) * 100}
        plotBottomPct={((H - B) / H) * 100}
        points={xLabels.map((l, i) => ({
          xPct: (x(i) / W) * 100,
          label: l,
          rows: series
            .map((s, si) => ({ s, si }))
            .filter(({ s }) => s.values[i] != null)
            .map(({ s, si }) => ({ name: s.label, value: format(s.values[i]!), detail: s.details?.[i] ?? undefined, color: STROKE[s.tone ?? (si === 0 ? "ember" : "muted")] })),
        }))}
      />
      </div>
      {series.length > 1 ? (
        <figcaption className="mt-2 flex flex-wrap gap-4 text-xs text-muted">
          {series.map((s, si) => (
            <span key={s.label} className="inline-flex items-center gap-2">
              <span aria-hidden className="h-0.5 w-5 rounded" style={{ background: STROKE[s.tone ?? (si === 0 ? "ember" : "muted")] }} />
              {s.label}
            </span>
          ))}
        </figcaption>
      ) : null}
      <details className="mt-2 text-xs text-subtle">
        <summary className="cursor-pointer">Show values</summary>
        <div tabIndex={0} role="region" aria-label={`${title}: values`} className="relative mt-2 overflow-x-auto">
          <table className="text-left">
            <thead><tr><th className="pr-4 font-medium">Point</th>{series.map((s) => <th key={s.label} className="pr-4 font-medium">{s.label}</th>)}</tr></thead>
            <tbody>{xLabels.map((l, i) => <tr key={i}><td className="pr-4">{l}</td>{series.map((s) => <td key={s.label} className="pr-4 tabular-nums">{s.values[i] == null ? "—" : format(s.values[i]!)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
