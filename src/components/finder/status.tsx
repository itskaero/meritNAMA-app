import type { FinderStatus } from "@/lib/domain/finder";
import { STATUS_LABEL } from "@/lib/domain/finder";
import { cn } from "../ui/cn";

export const STATUS_STYLE: Record<FinderStatus, { pill: string; cell: string; text: string }> = {
  safe: { pill: "border-success/40 bg-success/10 text-success", cell: "bg-success/70 hover:bg-success", text: "text-success" },
  borderline: { pill: "border-amber/50 bg-surface text-amber", cell: "bg-amber/70 hover:bg-amber", text: "text-amber" },
  out: { pill: "border-line-strong text-subtle", cell: "bg-elevated hover:bg-hover", text: "text-subtle" },
};

/** Filled, half and empty circles: the status reads by shape as well as colour. */
export function StatusIcon({ status, className = "h-2.5 w-2.5" }: { status: FinderStatus; className?: string }) {
  return (
    <svg viewBox="0 0 10 10" aria-hidden className={className}>
      <circle cx="5" cy="5" r="4" fill={status === "safe" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" />
      {status === "borderline" ? <path d="M5 1a4 4 0 0 1 0 8z" fill="currentColor" /> : null}
    </svg>
  );
}

/** Status shown with words and a shape, not colour alone. */
export function StatusPill({ status, className }: { status: FinderStatus; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold", STATUS_STYLE[status].pill, className)}>
      <StatusIcon status={status} />
      {STATUS_LABEL[status]}
    </span>
  );
}
