import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import type { Database } from "@/lib/db/client";
import { newSecret, normalizeEmail } from "@/lib/domain/identity";
import { env } from "@/lib/env";
import { UserFacingError } from "@/lib/errors";
import { createSessionFor } from "./login";

/**
 * "Continue with Google": OAuth 2.0 authorisation code flow with PKCE and a
 * `state` check, no library. Only an email Google marks as verified is accepted;
 * after that it is the same sign-in as a one-time link (createSessionFor).
 *
 * The ID token is read from Google's token endpoint over TLS, server to server,
 * so its signature need not be checked (OpenID Connect Core §3.1.3.7); its
 * issuer, audience and expiry still are.
 */

export const OAUTH_COOKIE = "mn_oauth";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

export function googleConfig() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, APP_URL } = env();
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return null;
  return { clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET, redirectUri: `${APP_URL.replace(/\/$/, "")}/auth/google/callback` };
}

export const pkceChallenge = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

/** Where to send the browser, and what to keep in the short-lived cookie. */
export function startGoogleSignIn(cfg: NonNullable<ReturnType<typeof googleConfig>>) {
  const state = newSecret(24), verifier = newSecret(48);
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: "openid email",
    state,
    code_challenge: pkceChallenge(verifier),
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return { url: url.toString(), cookie: `${state}.${verifier}` };
}

/** The cookie's state matches the one Google sent back (constant time). Returns the PKCE verifier. */
export function checkState(cookie: string | undefined, returned: string | null): string | null {
  const [state, verifier] = (cookie ?? "").split(".");
  if (!state || !verifier || !returned) return null;
  const a = Buffer.from(state), b = Buffer.from(returned);
  return a.length === b.length && timingSafeEqual(a, b) ? verifier : null;
}

type Claims = { iss?: string; aud?: string | string[]; exp?: number; email?: string; email_verified?: boolean | string };

function decodeIdToken(idToken: unknown): Claims {
  if (typeof idToken !== "string") throw new UserFacingError("Google did not return an identity.");
  const part = idToken.split(".")[1];
  if (!part) throw new UserFacingError("Google did not return an identity.");
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Claims;
  } catch {
    throw new UserFacingError("Google did not return an identity.");
  }
}

/** The verified email in Google's ID token, or an error that says what was wrong. */
export function verifiedEmail(claims: Claims, clientId: string, now = new Date()): string {
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!claims.iss || !ISSUERS.has(claims.iss) || !aud.includes(clientId)) throw new UserFacingError("That Google sign-in was not meant for meritNAMA.");
  if (!claims.exp || claims.exp * 1000 < now.getTime()) throw new UserFacingError("That Google sign-in expired. Try again.");
  if (claims.email_verified !== true && claims.email_verified !== "true") throw new UserFacingError("Google has not verified that email address. Use an email link instead.");
  const email = normalizeEmail(claims.email);
  if (!email) throw new UserFacingError("Your Google account has no email address.");
  return email;
}

/** Exchange the code, check the identity, and sign in. `fetchImpl` is injectable for tests. */
export async function completeGoogleSignIn(
  db: Database,
  input: { code: string; verifier: string; userAgent?: string | null; now?: Date },
  fetchImpl: typeof fetch = fetch,
) {
  const cfg = googleConfig();
  if (!cfg) throw new UserFacingError("Google sign-in is not set up on this server.");
  if (!input.code || input.code.length > 2000) throw new UserFacingError("Google did not return a sign-in code.");
  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: input.code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
      grant_type: "authorization_code",
      code_verifier: input.verifier,
    }),
  });
  if (!res.ok) throw new UserFacingError("Google refused the sign-in. Try again.");
  const body = (await res.json()) as { id_token?: unknown };
  const email = verifiedEmail(decodeIdToken(body.id_token), cfg.clientId, input.now);
  return createSessionFor(db, { email, userAgent: input.userAgent, now: input.now, via: "google" });
}
