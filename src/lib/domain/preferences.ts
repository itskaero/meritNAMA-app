import type { FinderStatus } from "./finder";

/**
 * Reading a preference list the way PHF allocates: candidates are placed in merit
 * order, each getting the highest preference whose closing their merit reaches.
 * So the first Safe option is where you most likely land; Borderline options above
 * it can still come in later rounds; options below it are effectively never used;
 * and a list with no Safe option risks no allocation at all.
 */

export const LIST_LIMITS = { lists: 10, items: 150, name: 60 } as const;

export type PlannedItem = {
  position: number;
  speciality: string;
  hospital: string;
  /** null when there are no marks to compare, or the option was not offered. */
  status: FinderStatus | null;
  offered: boolean;
};

export type ListWarning = { kind: "empty" | "no-marks" | "no-safe" | "all-out" | "below-safe" | "not-offered"; positions: number[]; message: string };

export type ListAnalysis = {
  likely: number | null;
  possible: number[];
  unreached: number[];
  warnings: ListWarning[];
};

const ranges = (ns: number[]) => {
  const out: string[] = [];
  for (let i = 0; i < ns.length; i++) {
    let j = i;
    while (j + 1 < ns.length && ns[j + 1] === ns[j]! + 1) j++;
    out.push(j > i ? `#${ns[i]}–#${ns[j]}` : `#${ns[i]}`);
    i = j;
  }
  return out.join(", ");
};

export function analyseList(items: PlannedItem[], o: { hasMarks: boolean; induction: number | null }): ListAnalysis {
  const sorted = [...items].sort((a, b) => a.position - b.position);
  const warnings: ListWarning[] = [];
  if (sorted.length === 0) return { likely: null, possible: [], unreached: [], warnings: [{ kind: "empty", positions: [], message: "This list is empty. Add options from your shortlist or the search below." }] };

  const notOffered = sorted.filter((i) => !i.offered).map((i) => i.position);
  if (notOffered.length) {
    warnings.push({ kind: "not-offered", positions: notOffered, message: `${ranges(notOffered)} ${notOffered.length === 1 ? "was" : "were"} not offered${o.induction ? ` in induction ${o.induction}` : ""}; check they still exist before relying on them.` });
  }
  if (!o.hasMarks) {
    warnings.push({ kind: "no-marks", positions: [], message: "Add your marks to see where this list is likely to place you." });
    return { likely: null, possible: [], unreached: [], warnings };
  }

  const firstSafe = sorted.find((i) => i.status === "safe");
  const likely = firstSafe?.position ?? null;
  const possible = sorted.filter((i) => i.status === "borderline" && (likely === null || i.position < likely)).map((i) => i.position);
  const unreached = likely === null ? [] : sorted.filter((i) => i.position > likely).map((i) => i.position);

  if (sorted.every((i) => i.status === "out" || i.status === null) && sorted.some((i) => i.status === "out")) {
    warnings.push({ kind: "all-out", positions: sorted.map((i) => i.position), message: "Every option is Out of reach for your marks: last time each closed above them." });
  } else if (likely === null) {
    warnings.push({ kind: "no-safe", positions: [], message: "No option on this list is Safe for your marks, so you might not be placed. Add at least one Safe option near the end." });
  }
  if (unreached.length) {
    warnings.push({ kind: "below-safe", positions: unreached, message: `Options below #${likely} are unlikely to be used: #${likely} is Safe, so you would be placed there first.` });
  }
  return { likely, possible, unreached, warnings };
}

/** One sentence: where this list most likely places you. */
export function outcomeSummary(a: ListAnalysis, items: PlannedItem[]): string {
  const at = (p: number) => items.find((i) => i.position === p)!;
  const name = (p: number) => `#${p} ${at(p).speciality}, ${at(p).hospital}`;
  if (items.length === 0) return "Nothing on this list yet.";
  if (a.warnings.some((w) => w.kind === "no-marks")) return "Add your marks to see the likely outcome.";
  const later = a.possible.length ? ` ${ranges(a.possible)} ${a.possible.length === 1 ? "is" : "are"} Borderline and could come in later rounds.` : "";
  if (a.likely !== null) return `Most likely: ${name(a.likely)} (Safe).${later}`;
  if (a.possible.length) return `No Safe option. Best hope: ${ranges(a.possible)} (Borderline), which could come in later rounds.`;
  return "No option on this list is within reach of your marks on last induction's closings.";
}
