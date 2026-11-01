import type { ReactNode } from "react";
import { Icon, type IconName } from "../icon";

/**
 * Figure card. Pass `value={null}` when the data does not exist yet —
 * it renders an em dash, never a made-up number.
 */
export function Metric({ label, value, unit, hint, badge, icon }: {
  label: string;
  value: ReactNode | null;
  unit?: string;
  hint?: string;
  badge?: ReactNode;
  icon?: IconName;
}) {
  return (
    <section className="glass flex min-h-32 items-start gap-4 rounded-[1.5rem] p-5">
      {icon ? (
        <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-gradient-to-br from-signal/25 to-signal-deep/10 text-signal-strong ring-1 ring-signal/25">
          <Icon name={icon} className="h-6 w-6" />
        </span>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-xs leading-snug text-muted">{label}</h3>
          {badge}
        </div>
        <div>
          <p className="flex items-baseline gap-1.5">
            <span className="text-3xl font-semibold tabular-nums tracking-tight">
              {value ?? <span className="text-subtle" aria-label="Not available">—</span>}
            </span>
            {value !== null && unit ? <span className="text-sm text-muted">{unit}</span> : null}
          </p>
          {hint ? <p className="mt-1 text-xs text-subtle">{hint}</p> : null}
        </div>
      </div>
    </section>
  );
}
