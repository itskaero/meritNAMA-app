import { drizzle } from "drizzle-orm/postgres-js";
import { eq, like } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";

// env() is read lazily: configure Google before anything calls it.
process.env.GOOGLE_CLIENT_ID = "test-client.apps.googleusercontent.com";
process.env.GOOGLE_CLIENT_SECRET = "test-secret-value";
process.env.APP_URL = "https://app.example.org";

const { checkState, completeGoogleSignIn, pkceChallenge, startGoogleSignIn, googleConfig, verifiedEmail } = await import("@/lib/auth/google");
const { sessionFromId } = await import("@/lib/auth/login");

const CLIENT = "test-client.apps.googleusercontent.com";
const idToken = (claims: Record<string, unknown>) => `x.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;
const good = (email: string) => ({ iss: "https://accounts.google.com", aud: CLIENT, exp: Math.floor(Date.now() / 1000) + 300, email, email_verified: true });
const fakeFetch = (claims: Record<string, unknown>, ok = true) =>
  (async (_url: unknown, init?: RequestInit) => {
    const body = new URLSearchParams(String(init?.body));
    // The exchange must carry the PKCE verifier and our redirect URI.
    if (body.get("code_verifier") !== "the-verifier" || body.get("redirect_uri") !== "https://app.example.org/auth/google/callback") return new Response("bad", { status: 400 });
    return new Response(JSON.stringify({ id_token: idToken(claims) }), { status: ok ? 200 : 400 });
  }) as typeof fetch;

describe("Google sign-in rules", () => {
  it("builds the authorisation URL with state, PKCE and our redirect", () => {
    const { url, cookie } = startGoogleSignIn(googleConfig()!);
    const u = new URL(url), [state, verifier] = cookie.split(".");
    expect(u.origin + u.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(u.searchParams.get("state")).toBe(state);
    expect(u.searchParams.get("code_challenge")).toBe(pkceChallenge(verifier!));
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("redirect_uri")).toBe("https://app.example.org/auth/google/callback");
    expect(u.searchParams.get("scope")).toBe("openid email");
  });

  it("checks state and the ID token's issuer, audience, expiry and verification", () => {
    expect(checkState("abc.ver", "abc")).toBe("ver");
    expect(checkState("abc.ver", "abd")).toBeNull();
    expect(checkState(undefined, "abc")).toBeNull();
    expect(verifiedEmail(good(" Doc@Example.org "), CLIENT)).toBe("doc@example.org");
    expect(() => verifiedEmail({ ...good("a@b.co"), aud: "someone-else" }, CLIENT)).toThrow("not meant for meritNAMA");
    expect(() => verifiedEmail({ ...good("a@b.co"), iss: "https://evil.example" }, CLIENT)).toThrow("not meant for meritNAMA");
    expect(() => verifiedEmail({ ...good("a@b.co"), exp: 1 }, CLIENT)).toThrow("expired");
    expect(() => verifiedEmail({ ...good("a@b.co"), email_verified: false }, CLIENT)).toThrow("not verified");
  });
});

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("Google sign-in (integration)", () => {
  const sql = postgres(url ?? "postgres://unused", { max: 2, onnotice: () => {} });
  const db = drizzle(sql, { schema });
  afterAll(async () => {
    await db.delete(schema.users).where(like(schema.users.email, "%-google@test.local"));
    await sql.end();
  });

  it("signs a verified Google email in, and refuses an unverified one", async () => {
    const s = await completeGoogleSignIn(db, { code: "c", verifier: "the-verifier" }, fakeFetch(good("Ok-Google@test.local")));
    expect(await sessionFromId(db, s.sessionId)).toMatchObject({ email: "ok-google@test.local", role: "candidate" });
    const [audit] = await db.select().from(schema.auditLog).where(eq(schema.auditLog.actorEmail, "ok-google@test.local"));
    expect(audit!.after).toMatchObject({ via: "google" });
    await expect(completeGoogleSignIn(db, { code: "c", verifier: "the-verifier" }, fakeFetch({ ...good("no-google@test.local"), email_verified: false }))).rejects.toThrow("not verified");
    await expect(completeGoogleSignIn(db, { code: "c", verifier: "wrong" }, fakeFetch(good("x-google@test.local")))).rejects.toThrow("refused");
    expect(await db.select().from(schema.users).where(eq(schema.users.email, "no-google@test.local"))).toHaveLength(0);
  });
});
