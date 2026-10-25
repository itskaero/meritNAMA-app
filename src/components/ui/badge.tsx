import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * Tone carries meaning: data provenance (historical / current / simulated) must
 * always be labelled so simulations are never mistaken for official results.
 */
export type BadgeTone = "neutral" | "historical" | "current" | "simulated" | "warning" | "success" | "danger";

const tones: Record<BadgeTone, string> = {
  neutral: "border-line-strong text-muted",
  historical: "border-line-strong text-muted",
  current: "border-signal/40 bg-signal/10 text-signal",
  simulated: "border-amber/40 bg-amber/10 text-amber",
  warning: "border-amber/40 bg-amber/10 text-amber",
  success: "border-success/40 bg-success/10 text-success",
  danger: "border-danger/40 bg-danger/10 text-danger",
};

export function Badge({ tone = "neutral", children, className }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[0.7rem] font-semibold uppercase tracking-wide",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
