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
