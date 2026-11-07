import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy, newNonce } from "@/lib/csp";

/**
 * Runs before every page:
 * - Sets the Content Security Policy with a fresh nonce (src/lib/csp.ts). Next.js reads
 *   it from the request headers and puts the nonce on its scripts; the root layout
 *   renders per request so every page gets one.
 * - Optimistic sign-in check: with no session cookie, /portal and /admin go straight to
 *   /sign-in instead of rendering. The real checks stay in the layouts and the data
 *   layer; a cookie here proves nothing.
 */
export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const guarded = pathname.startsWith("/portal") || pathname.startsWith("/admin");
  const stub = process.env.DEV_AUTH_STUB_ROLE && process.env.NODE_ENV !== "production";
  if (guarded && !stub && !req.cookies.has("mn_session")) {
    return NextResponse.redirect(new URL("/sign-in", req.nextUrl));
  }

  const csp = contentSecurityPolicy(newNonce(), process.env.NODE_ENV === "development");
  const headers = new Headers(req.headers);
  headers.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = {
  matcher: [
    // Pages only: not API routes, static files, image optimisation, the favicon, or
    // link prefetches (which do not render a document).
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
