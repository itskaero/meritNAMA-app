/**
 * Activity counts: "N viewing now" and "searched right now". Pure rules; the data layer
 * stores pings and hourly search counts. Only counts leave the database, and small
 * counts are hidden so nobody can be singled out.
 */

/** A member counts as viewing a page for this long after their last view. */
export const VIEWING_WINDOW_MS = 5 * 60_000;
/** Below this, "viewing now" is not shown (a count of 1 or 2 could point at a person). */
export const MIN_SHOWN = 3;
/** "Searched right now" covers the last 24 hours. */
export const SEARCH_WINDOW_MS = 24 * 3_600_000;
/** Pings are dropped after a day, search counts after a week (daily retention run). */
export const PING_KEEP_MS = 24 * 3_600_000;
export const SEARCH_KEEP_MS = 7 * 24 * 3_600_000;

/** Page keys, so every page counts the same way. */
export const pageKey = {
  round: (induction: number, round: number) => `round:${induction}:${round}`,
  hospital: (id: number) => `hospital:${id}`,
  speciality: (id: number) => `speciality:${id}`,
  lists: () => "lists",
  candidates: (induction: number) => `candidates:${induction}`,
  jobs: () => "jobs",
  community: (id: string) => `community:${id}`,
} as const;

/** A count to show, or null when it is too small to show. */
export function shownCount(n: number | null | undefined): number | null {
  return n != null && n >= MIN_SHOWN ? n : null;
}

/** The start of the hour a time falls in (search counts are kept per hour). */
export function hourOf(at: Date): Date {
  const d = new Date(at);
  d.setUTCMinutes(0, 0, 0);
  return d;
}

/** Page and search keys are short, plain and safe to store: lower case, a-z 0-9 : _ - only. */
export function cleanKey(key: string): string | null {
  const k = key.trim().toLowerCase();
  return /^[a-z0-9:_-]{1,120}$/.test(k) ? k : null;
}
