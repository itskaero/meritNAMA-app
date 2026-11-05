import type { LadderRow } from "@/lib/data/insights";

/**
 * "Where merit moved": rows × round transitions, each cell tinted by how far the
 * closing merit fell (teal, darker = bigger drop), amber when it rose, grey when it
 * held. Every cell also prints its change, so colour is never the only signal.
 */
export function MeritMoveHeat({ rows, rounds, caption }: { rows: LadderRow[]; rounds: number[]; caption: string }) {
  if (rows.length === 0 || rounds.length < 2) return null;
  const changes = rows.map((row) => row.marks.slice(1).map((m, i) => m! - row.marks[i]!));
  const scale = Math.max(0.25, ...changes.flat().map(Math.abs));
  return (
    <figure className="m-0 min-w-0">
      <figcaption className="sr-only">{caption}</figcaption>
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[520px] border-separate border-spacing-1 text-sm">
          <thead>
            <tr>
              <th scope="col" className="sr-only">Row</th>
              {rounds.slice(1).map((n, i) => <th key={n} scope="col" className="pb-1 font-mono text-[0.7rem] font-normal text-subtle">R{rounds[i]}→{n}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={row.key}>
                <th scope="row" className="max-w-[12rem] truncate pr-2 text-left font-normal text-muted">{row.label}</th>
                {changes[ri]!.map((d, i) => {
                  const k = Math.min(Math.abs(d) / scale, 1), held = Math.abs(d) < 0.005;
                  const bg = held ? "var(--mn-navy-800)" : d < 0 ? `color-mix(in srgb, var(--mn-cyan) ${Math.round(18 + k * 72)}%, var(--mn-navy-900))` : `color-mix(in srgb, var(--mn-amber) ${Math.round(18 + k * 50)}%, var(--mn-navy-900))`;
                  return (
                    <td key={i} className="h-9 rounded-md text-center font-mono text-xs tabular-nums" style={{ background: bg, color: !held && k > 0.55 ? "var(--mn-cyan-ink)" : "var(--mn-text-muted)" }} title={`${row.label}, round ${rounds[i]} to ${rounds[i + 1]}: ${d.toFixed(2)}`}>
                      {held ? <span aria-label="no change">·</span> : `${d > 0 ? "+" : "−"}${Math.abs(d).toFixed(2)}`}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
