import type { Confidence } from "@/lib/domain/prediction";
import { cn } from "../ui/cn";

const TONE: Record<Confidence, string> = {
  High: "border-success/40 text-success",
  Medium: "border-amber/40 text-amber",
  Low: "border-line-strong text-muted",
};

/**
 * A predicted range for a closing merit, never a single number. With `actual`
 * (the round already happened) it also says whether the range held.
 */
export function PredictionBadge({ low, high, confidence, n, fallback, actual, inside, compact = false }: {
  low: number; high: number; confidence: Confidence; n: number; fallback?: boolean; actual?: number | null; inside?: boolean | null; compact?: boolean;
}) {
  const method = `Range from the 20th–80th percentile of ${n} past ${fallback ? "programme-wide " : ""}moves at this point of the cycle. Not official.`;
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-1.5" title={method}>
      <span className="font-mono tabular-nums">{low.toFixed(2)}–{high.toFixed(2)}</span>
      {inside != null ? (
        <span className={cn("rounded-full px-1.5 text-[0.68rem] font-semibold", inside ? "bg-success/15 text-success" : "bg-danger/15 text-danger")} aria-label={inside ? "the actual closing fell inside" : "the actual closing fell outside"}>
          {inside ? "✓" : "✗"}
        </span>
      ) : compact ? null : (
        <span className={cn("rounded-full border px-1.5 text-[0.65rem] font-semibold uppercase tracking-wide", TONE[confidence])}>{confidence}</span>
      )}
      <span className="sr-only">{method}{actual != null ? ` Actual: ${actual.toFixed(2)}.` : ""}</span>
    </span>
  );
}

/** One line for method cards: how often the range held on finished inductions. */
export function MethodNote({ share, n, induction }: { share: number | null; n: number; induction: number | null }) {
  return (
    <p className="text-xs text-subtle">
      Ranges come from how closing merit moved at the same point of the cycle in other inductions (20th–80th percentile of those moves, applied to today&apos;s closing).
      {share != null && induction ? ` Checked on induction ${induction}: the range held for ${Math.round(share * 100)}% of ${n} speciality closings.` : ""} Estimates, not official.
    </p>
  );
}
