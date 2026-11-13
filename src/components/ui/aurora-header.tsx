import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * The v4 navy aurora container (teal, slate and amber blobs drifting behind ivory text,
 * one faint violet blob). Used for page headers and the one hero card on a page.
 * The blobs are decoration only; under reduced motion they stay still.
 */
export function AuroraHeader({ children, className, as: Tag = "div" }: { children: ReactNode; className?: string; as?: "div" | "section" | "header" }) {
  return (
    <Tag className={cn("mn-head rounded-2xl", className)}>
      <span aria-hidden className="mn-head-blob b1" />
      <span aria-hidden className="mn-head-blob b2" />
      <span aria-hidden className="mn-head-blob b3" />
      <span aria-hidden className="mn-head-blob b4" />
      {children}
    </Tag>
  );
}

/** A figure inside an aurora header: big number, small label in ivory. */
export function AuroraStat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-[#F3EEE5]/65">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-[#F3EEE5]">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-[#F3EEE5]/70">{hint}</p> : null}
    </div>
  );
}
