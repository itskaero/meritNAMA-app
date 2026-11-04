export type RoundColumn = { label: string; parts: { label: string; value: number; tone: "teal" | "danger" | "muted" }[] };

const FILL = { teal: "var(--mn-cyan)", danger: "var(--mn-danger)", muted: "var(--mn-border-strong)" } as const;

/** Stacked columns per round (e.g. accepted / rejected / not available); columns rise in. */
export function RoundColumns({ columns, title }: { columns: RoundColumn[]; title: string }) {
  const W = 640, H = 200, L = 40, R = 8, T = 10, B = 28;
  const top = Math.max(...columns.map((c) => c.parts.reduce((s, p) => s + p.value, 0)), 1);
  const band = (W - L - R) / columns.length;
  const bw = Math.min(46, band * 0.6);
  const y = (v: number) => (v / top) * (H - T - B);
  const legend = columns[0]?.parts ?? [];
  return (
    <figure className="m-0 min-w-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={title}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={L} x2={W - R} y1={H - B - f * (H - T - B)} y2={H - B - f * (H - T - B)} stroke="var(--mn-border)" />
            <text x={L - 6} y={H - B - f * (H - T - B) + 4} textAnchor="end" fontSize="10" fill="var(--mn-text-subtle)" fontFamily="var(--mn-font-mono)">{Math.round(top * f)}</text>
          </g>
        ))}
        {columns.map((c, i) => {
          let acc = 0;
          const cx = L + band * i + (band - bw) / 2;
          return (
            <g key={c.label} className="mn-grow-y" style={{ animationDelay: `${i * 70}ms` }}>
              {c.parts.map((p) => {
                const h = y(p.value);
                const rect = <rect key={p.label} x={cx} y={H - B - acc - h} width={bw} height={Math.max(h, 0)} rx="3" fill={FILL[p.tone]}><title>{`${c.label} · ${p.label}: ${p.value}`}</title></rect>;
                acc += h;
                return rect;
              })}
              <text x={cx + bw / 2} y={H - 9} textAnchor="middle" fontSize="11" fill="var(--mn-text-muted)" fontFamily="var(--mn-font-mono)">{c.label}</text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-4 text-xs text-muted">
        {legend.map((p) => (
          <span key={p.label} className="inline-flex items-center gap-2"><span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: FILL[p.tone] }} />{p.label}</span>
        ))}
      </figcaption>
    </figure>
  );
}
