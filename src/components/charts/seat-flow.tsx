import type { FlowPanel } from "@/lib/data/insights";

/**
 * Small multiples: per panel, one stacked column per round — accepted (teal) and
 * released (amber: declined or not available, offered again next round).
 */
export function SeatFlow({ panels, caption }: { panels: FlowPanel[]; caption: string }) {
  if (panels.length === 0) return null;
  return (
    <figure className="m-0 grid min-w-0 gap-4">
      <figcaption className="sr-only">
        {caption}. {panels.map((p) => `${p.label}: ${p.rounds.map((r) => `round ${r.roundNo} ${r.accepted} accepted, ${r.released} released`).join("; ")}`).join(". ")}
      </figcaption>
      <p className="flex flex-wrap gap-4 text-xs text-muted" aria-hidden>
        <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-[3px] bg-signal" />Accepted</span>
        <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-[3px] bg-amber" />Released (declined or not available)</span>
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-hidden>
        {panels.map((p) => {
          const max = Math.max(...p.rounds.map((r) => r.accepted + r.released), 1);
          return (
            <div key={p.key} className="grid min-w-0 gap-2.5 rounded-2xl border border-line bg-canvas p-4">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-semibold">{p.label}</span>
                <span className="flex-none font-mono text-xs text-amber">{p.released} released</span>
              </div>
              <div className="grid h-28 items-end gap-1.5" style={{ gridTemplateColumns: `repeat(${p.rounds.length}, minmax(0, 1fr))` }}>
                {p.rounds.map((r, i) => (
                  <div key={r.roundNo} className="mn-grow-y flex h-full flex-col justify-end gap-0.5" style={{ animationDelay: `${i * 50}ms` }} title={`Round ${r.roundNo}: ${r.accepted} accepted, ${r.released} released`}>
                    <span className="rounded-[4px] bg-amber shadow-[0_0_8px_color-mix(in_srgb,var(--mn-amber)_45%,transparent)]" style={{ height: `${Math.max((r.released / max) * 100, r.released ? 3 : 0)}%` }} />
                    <span className="rounded-[4px] bg-[linear-gradient(180deg,var(--mn-cyan),color-mix(in_srgb,var(--mn-cyan)_45%,var(--mn-teal-deep)))]" style={{ height: `${(r.accepted / max) * 100}%` }} />
                  </div>
                ))}
              </div>
              <div className="grid gap-1.5 text-center font-mono text-[0.68rem] text-subtle" style={{ gridTemplateColumns: `repeat(${p.rounds.length}, minmax(0, 1fr))` }}>
                {p.rounds.map((r) => <span key={r.roundNo}>R{r.roundNo}</span>)}
              </div>
            </div>
          );
        })}
      </div>
    </figure>
  );
}
