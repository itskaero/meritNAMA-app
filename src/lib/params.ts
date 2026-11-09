/** Route and query parameter parsing shared by pages. */

/** A whole number of at most `digits` digits, or null (callers usually notFound()). */
export function intParam(value: string | string[] | undefined, digits = 3): number | null {
  return typeof value === "string" && new RegExp(`^\\d{1,${digits}}$`).test(value) ? Number(value) : null;
}

/** A query value only if it is one of the allowed options. */
export function oneOf<T extends string>(value: string | string[] | undefined, allowed: readonly T[]): T | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}
