/** Small formatting and parsing helpers shared by pages and routes. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for a canonical UUID (the id format of versioned rows). */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/** "2026-11-04 12:45" in UTC, or an em dash for a missing date. Label columns "(UTC)". */
export function formatUtc(date: Date | null | undefined): string {
  return date ? date.toISOString().slice(0, 16).replace("T", " ") : "—";
}

/** Merit marks with two decimals ("23.76"), or an em dash. */
export function formatMarks(v: number | null | undefined): string {
  return v == null ? "—" : v.toFixed(2);
}

/** Signed change with two decimals ("+0.42", "−1.10"), or an em dash. */
export function formatDelta(v: number | null | undefined): string {
  if (v == null) return "—";
  if (Math.abs(v) < 0.005) return "0.00";
  return `${v > 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}`;
}
