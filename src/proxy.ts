import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic check only: with no session cookie, /portal and /admin go straight to
 * /sign-in instead of rendering (pages render alongside their layout, so they would
 * otherwise start loading data before the layout's guard redirects). The real checks
 * stay in the layouts and the data layer; a cookie here proves nothing.
 */
export default function proxy(req: NextRequest) {
  const stub = process.env.DEV_AUTH_STUB_ROLE && process.env.NODE_ENV !== "production";
  if (!stub && !req.cookies.has("mn_session")) {
    return NextResponse.redirect(new URL("/sign-in", req.nextUrl));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/portal/:path*", "/admin/:path*"] };
