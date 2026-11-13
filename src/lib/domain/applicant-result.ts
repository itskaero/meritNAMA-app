/**
 * One applicant's result in a list (an estimate or a published round), preference by
 * preference, as the legacy simulator showed it: placed, fell short, clears the cutoff,
 * skipped (below the seat they got) or no seats (the seat is not in this list).
 * Pure; the data layer supplies the applicant's preferences and the list's seats.
 */

export type ResultStatus = "placed" | "fell_short" | "clears_cutoff" | "skipped" | "no_seats";

export const RESULT_LABELS: Record<ResultStatus, string> = {
  placed: "Placed",
  fell_short: "Fell short",
  clears_cutoff: "Clears cutoff",
  skipped: "Skipped",
  no_seats: "No seats",
};

export type ResultPreference = { preferenceNo: number; quota: string; speciality: string; hospital: string; mark: number | null };
export type ListSeat = { cutoff: number; filled: number };

export type ResultRow = ResultPreference & {
  status: ResultStatus;
  cutoff: number | null;
  filled: number | null;
  /** mark − cutoff, rounded to 2 places; null when either is unknown. */
  delta: number | null;
};

/** Seat key shared by preferences and list rows: quota, speciality and hospital, compared loosely. */
export function seatKey(quota: string, speciality: string, hospital: string): string {
  const k = (s: string) => s.normalize("NFKD").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "");
  return `${k(quota)}|${k(speciality)}|${k(hospital)}`;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Classify each preference of one programme. `placedPreferenceNo` is the preference the
 * applicant got in this list (null when unplaced); `seats` maps seatKey → the lowest mark
 * placed there and how many were placed.
 */
export function applicantResults(prefs: ResultPreference[], seats: Map<string, ListSeat>, placedPreferenceNo: number | null): ResultRow[] {
  return [...prefs]
    .sort((a, b) => a.preferenceNo - b.preferenceNo)
    .map((p) => {
      const seat = seats.get(seatKey(p.quota, p.speciality, p.hospital));
      const cutoff = seat ? seat.cutoff : null;
      const delta = cutoff != null && p.mark != null ? r2(p.mark - cutoff) : null;
      let status: ResultStatus;
      if (placedPreferenceNo != null && p.preferenceNo === placedPreferenceNo) status = "placed";
      else if (!seat) status = "no_seats";
      else if (placedPreferenceNo != null && p.preferenceNo > placedPreferenceNo) status = "skipped";
      else if (delta != null && delta >= 0) status = "clears_cutoff";
      else status = "fell_short";
      return { ...p, status, cutoff, filled: seat ? seat.filled : null, delta };
    });
}

/** The margin as the legacy simulator worded it. */
export function marginText(row: Pick<ResultRow, "status" | "delta">): string {
  const d = row.delta;
  if (d == null) return "—";
  const v = Math.abs(d).toFixed(2);
  if (row.status === "skipped") return d >= 0 ? `Would clear +${v}` : `Would be short ${v}`;
  if (row.status === "fell_short") return `Short ${v}`;
  return `Clears +${v}`;
}

/** A one-line summary for the track card: where they were placed, or the closest miss. */
export function trackSummary(rows: ResultRow[]): { placed: ResultRow | null; closestMiss: ResultRow | null } {
  const placed = rows.find((r) => r.status === "placed") ?? null;
  const misses = rows.filter((r) => r.status === "fell_short" && r.delta != null).sort((a, b) => Math.abs(a.delta!) - Math.abs(b.delta!));
  return { placed, closestMiss: placed ? null : (misses[0] ?? null) };
}
