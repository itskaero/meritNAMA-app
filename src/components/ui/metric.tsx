import type { ReactNode } from "react";
import { Card } from "./card";

/** A single figure. Pass `value={null}` when the data does not exist yet — never a made-up number. */
export function Metric({ label, value, hint, badge }: { label: string; value: ReactNode | null; hint?: string; badge?: ReactNode }) {
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted">{label}</span>
        {badge}
      </div>
      <span className="text-2xl font-bold tabular-nums tracking-tight">
        {value ?? <span className="text-subtle" aria-label="Not available">—</span>}
      </span>
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </Card>
  );
}
