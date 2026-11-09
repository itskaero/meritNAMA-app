/**
 * Score finder rules. Inductions are scored out of different totals, so every
 * comparison is made in percent of the induction's total marks.
 *
 * For one option (programme, quota, speciality, hospital) in a past induction:
 * - safe:       your score reaches its closing merit in its first round
 * - borderline: below the first-round closing, but reaching the final-round closing
 *               (seats that freed up in later rounds would have reached you)
 * - out:        below the final-round closing
 */

export type FinderStatus = "safe" | "borderline" | "out";

export const STATUS_LABEL: Record<FinderStatus, string> = {
  safe: "Safe",
  borderline: "Borderline",
  out: "Out of reach",
};

export function toPercent(marks: number, total: number): number {
  return (marks / total) * 100;
}

export function classify(mePct: number, firstPct: number, lastPct: number): FinderStatus {
  // The final round can only be at or below the first; guard against odd data.
  const last = Math.min(firstPct, lastPct);
  if (mePct >= firstPct) return "safe";
  if (mePct >= last) return "borderline";
  return "out";
}

/** Percentage points between your score and the final-round closing (positive = above). */
export function margin(mePct: number, lastPct: number): number {
  return mePct - lastPct;
}

/** Stable key for one option, used in URLs (compare) and the shortlist. */
export function optionKey(o: { speciality: string; hospital: string }): string {
  return `${o.speciality}|${o.hospital}`;
}

export function parseOptionKey(v: string | undefined): { speciality: string; hospital: string } | null {
  if (!v) return null;
  const i = v.indexOf("|");
  if (i <= 0 || i === v.length - 1) return null;
  return { speciality: v.slice(0, i), hospital: v.slice(i + 1) };
}
