import { useId } from "react";

/**
 * Placement-chance gauge. `value` is a simulated percentage (0–100) or null when no
 * simulation has run — then the track is dashed and the centre shows an em dash.
 */
export function ChanceRing({ value, size = 136 }: { value: number | null; size?: number }) {
  const id = useId();
  const r = 42;
  const c = 2 * Math.PI * r;
  const pct = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--mn-accent)" />
            <stop offset="1" stopColor="var(--mn-success)" />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--mn-border-strong)" strokeWidth="7" strokeDasharray={value === null ? "2 4" : undefined} />
        {value !== null ? (
          <circle cx="50" cy="50" r={r} fill="none" stroke={`url(#${id})`} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${(pct / 100) * c} ${c}`} />
        ) : null}
      </svg>
      <span className="text-3xl font-semibold tabular-nums">
        {value === null ? <span className="text-subtle" aria-label="Not available">—</span> : `${Math.round(pct)}%`}
      </span>
    </div>
  );
}
