import { createHash, createHmac, randomBytes } from "node:crypto";
import { z } from "zod";

/**
 * Normalising and hashing for sign-in and candidate matching. Pure functions so the
 * rules are unit-tested; nothing here touches the database.
 */

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.").max(254));

/** Lower-cased and trimmed; null when it is not an email address. */
export function normalizeEmail(value: unknown): string | null {
  const r = emailSchema.safeParse(value);
  return r.success ? r.data : null;
}

/** PMDC numbers appear as "12345-P", "12345 p", "12345P": keep letters and digits, upper-cased. */
export function normalizePmdc(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const v = String(value).toUpperCase().replace(/[^0-9A-Z]/g, "");
  return v.length >= 3 ? v : null;
}

/** A random, URL-safe secret (tokens and session ids). */
export const newSecret = (bytes = 32) => randomBytes(bytes).toString("base64url");

/** What is stored for a token or session id: its SHA-256, hex. */
export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/** Keyed hash of a normalised identity value; the kind is mixed in so an email never matches a PMDC number. */
export function identityHmac(secret: string, kind: "email" | "pmdc", normalised: string) {
  return createHmac("sha256", secret).update(`${kind}:${normalised}`).digest("hex");
}

/** Comma/space separated list of emails, normalised. */
export function parseEmailList(value: string): Set<string> {
  return new Set(value.split(/[\s,;]+/).map(normalizeEmail).filter((e): e is string => Boolean(e)));
}

export const LOGIN_TOKEN_TTL_MS = 15 * 60_000;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60_000;
/** A session's expiry is pushed forward at most once per this interval. */
export const SESSION_TOUCH_MS = 24 * 60 * 60_000;
export const LOGIN_LIMITS = { perEmail: 3, perIp: 10, windowMs: 15 * 60_000 } as const;
