import type { Stat } from "@/components/charts/stat-tiles";

type RoundRow = { roundNo: number; allocations: number; accepted: number; applicants: number; medianClosing: number | null };

/**
 * Headline tiles for the latest round, each with its change since the round before.
 * A falling closing merit is good news for candidates (easier to get in).
 */
export function latestRoundStats(change: { induction: number; now: RoundRow; before: RoundRow | null } | null, maxMarks?: number): Stat[] {
  if (!change) return [];
  const { now, before, induction } = change;
  const vs = before ? `vs round ${before.roundNo}` : "";
  const d = (a: number | null, b: number | null | undefined) => (before && a != null && b != null ? a - b : undefined);
  const mk = (value: number | undefined, better: "up" | "down" | "neutral", format?: (v: number) => string) =>
    value === undefined ? undefined : { value, label: vs, better, format };
  // A list published without consent replies reads 0 accepted: leave the tile out rather than show a misleading zero.
  const consentKnown = now.accepted > 0 || (before?.accepted ?? 0) > 0;
  const stats: (Stat | null)[] = [
    { label: `Induction ${induction} · round ${now.roundNo} allocations`, value: now.allocations, delta: mk(d(now.allocations, before?.allocations), "neutral") },
    consentKnown ? { label: "Accepted seats", value: now.accepted, delta: mk(d(now.accepted, before?.accepted), "up") } : null,
    // Fewer candidates holding seats between rounds is normal (they decline and leave), so not marked good or bad.
    { label: "Candidates with a seat", value: now.applicants, delta: mk(d(now.applicants, before?.applicants), "neutral") },
    {
      label: `Median closing merit${maxMarks ? ` (of ${maxMarks})` : ""}`,
      value: now.medianClosing ?? 0,
      format: (v) => v.toFixed(2),
      delta: mk(d(now.medianClosing, before?.medianClosing), "down", (v) => v.toFixed(2)),
    },
  ];
  return stats.filter((x): x is Stat => x !== null);
}
