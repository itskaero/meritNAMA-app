import type { ReactNode } from "react";

/**
 * Pill-shaped figure card. Pass `value={null}` when the data does not exist yet —
 * it renders an em dash, never a made-up number.
 */
export function Metric({ label, value, unit, hint, badge }: {
  label: string;
  value: ReactNode | null;
  unit?: string;
  hint?: string;
  badge?: ReactNode;
}) {
  return (
    <section className="flex min-h-28 flex-col justify-between gap-3 rounded-xl border border-line bg-surface p-4 shadow-[var(--mn-shadow-1)]">
      <div className="flex items-start justify-between gap-3">
        <p className="max-w-[12rem] text-xs leading-snug text-muted">{label}</p>
        {badge}
      </div>
      <div>
        <p className="flex items-baseline gap-1.5">
          <span className="text-3xl font-semibold tabular-nums tracking-tight text-heading">
            {value ?? (
              <>
                <span aria-hidden className="text-subtle">—</span>
                <span className="sr-only">Not available</span>
              </>
            )}
          </span>
          {value !== null && unit ? <span className="text-sm text-muted">{unit}</span> : null}
        </p>
        {hint ? <p className="mt-1 text-xs text-subtle">{hint}</p> : null}
      </div>
    </section>
  );
}
