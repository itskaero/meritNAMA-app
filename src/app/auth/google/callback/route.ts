import { cookies } from "next/headers";
import { checkState, completeGoogleSignIn, OAUTH_COOKIE } from "@/lib/auth/google";
import { sessionFromId } from "@/lib/auth/login";
import { setSessionCookie } from "@/lib/auth/session-cookie";
import { getDb } from "@/lib/db/client";
import { UserFacingError } from "@/lib/errors";

const go = (location: string) => new Response(null, { status: 303, headers: { Location: location, "Cache-Control": "no-store" } });

/** Google sends the browser back here with ?code&state. Relative redirects keep the host the person used. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const jar = await cookies();
  const verifier = checkState(jar.get(OAUTH_COOKIE)?.value, url.searchParams.get("state"));
  jar.delete({ name: OAUTH_COOKIE, path: "/auth/google" });
  if (url.searchParams.get("error")) return go("/sign-in?error=google-cancelled");
  if (!verifier) return go("/sign-in?error=google-expired");
  try {
    const db = getDb();
    const s = await completeGoogleSignIn(db, { code: url.searchParams.get("code") ?? "", verifier, userAgent: req.headers.get("user-agent") });
    await setSessionCookie(s.sessionId, s.expiresAt);
    const session = await sessionFromId(db, s.sessionId);
    return go(session && session.role !== "candidate" ? "/admin" : "/portal");
  } catch (err) {
    if (!(err instanceof UserFacingError)) console.error("google sign-in failed", (err as Error).message);
    const reason = err instanceof UserFacingError && /verified/.test(err.message) ? "google-unverified" : "google";
    return go(`/sign-in?error=${reason}`);
  }
}
