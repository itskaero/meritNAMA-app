import { cookies } from "next/headers";
import { googleConfig, OAUTH_COOKIE, startGoogleSignIn } from "@/lib/auth/google";
import { secureCookies } from "@/lib/auth/session-cookie";

/** Begin "Continue with Google": remember state + PKCE verifier for 10 minutes, then go to Google. */
export async function GET() {
  const cfg = googleConfig();
  if (!cfg) return new Response(null, { status: 303, headers: { Location: "/sign-in" } });
  const { url, cookie } = startGoogleSignIn(cfg);
  (await cookies()).set(OAUTH_COOKIE, cookie, { httpOnly: true, sameSite: "lax", secure: secureCookies(), path: "/auth/google", maxAge: 600 });
  return new Response(null, { status: 303, headers: { Location: url, "Cache-Control": "no-store" } });
}
