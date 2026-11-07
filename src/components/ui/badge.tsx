import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * Tone carries meaning. Provenance is always labelled, so an estimate is never
 * mistaken for an official result:
 *   official    published by PHF
 *   historical  an earlier published record
 *   calculated  worked out by meritNAMA from published data (closing merit, the calculator)
 *   current     the latest / in force
 *   simulated   an estimate or projection (dashed, amber): never official
 */
export type BadgeTone = "neutral" | "official" | "historical" | "calculated" | "current" | "simulated" | "warning" | "success" | "danger";

const tones: Record<BadgeTone, string> = {
  neutral: "border-line-strong text-muted",
  official: "border-navy/30 bg-navy/5 text-heading",
  historical: "border-line-strong text-muted",
  calculated: "border-teal/40 bg-[var(--mn-cyan-soft)] text-signal-strong",
  current: "border-teal/40 bg-[var(--mn-cyan-soft)] text-signal-strong",
  simulated: "border-dashed border-amber/60 bg-[var(--mn-amber-soft)] text-amber",
  warning: "border-amber/40 bg-[var(--mn-amber-soft)] text-amber",
  success: "border-success/30 bg-success/10 text-success",
  danger: "border-danger/30 bg-danger/10 text-danger",
};

export function Badge({ tone = "neutral", children, className }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[0.72rem] font-medium leading-5", tones[tone], className)}>
      {children}
    </span>
  );
}
