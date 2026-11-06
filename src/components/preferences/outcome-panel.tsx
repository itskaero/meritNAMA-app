import type { ListAnalysis } from "@/lib/domain/preferences";
import { Notice } from "../ui/notice";

/** Where the list most likely places you, and anything to fix. */
export function OutcomePanel({ summary, analysis, marks }: { summary: string; analysis: ListAnalysis; marks: { pct: number | null; from: "list" | "record" } | null }) {
  const warnings = analysis.warnings.filter((w) => w.kind !== "empty");
  return (
    <section aria-label="Likely outcome" className="grid gap-3 rounded-2xl border border-signal/30 bg-signal/[0.05] p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-subtle">Likely outcome{marks?.pct != null ? ` · your marks ${marks.pct.toFixed(1)}%${marks.from === "record" ? " (verified record)" : ""}` : ""}</p>
      <p className="text-lg font-semibold leading-snug">{summary}</p>
      {warnings.map((w) => (
        <Notice key={w.kind} tone={w.kind === "below-safe" || w.kind === "no-marks" ? "info" : "warning"} title={w.message} />
      ))}
      <p className="text-xs text-subtle">Based on how each option closed in the latest induction; seats and closings change every cycle. A planning aid, not an official PHF submission.</p>
    </section>
  );
}
