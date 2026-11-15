import { cookies, headers } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth/login";
import { clientAddress } from "@/lib/domain/device";
import { sha256 } from "@/lib/domain/identity";

/** The requesting browser: its sign-in (hashed, as sessions stores it), User-Agent and address. */
export async function requestClient() {
  const [h, jar] = await Promise.all([headers(), cookies()]);
  const sid = jar.get(SESSION_COOKIE)?.value;
  return { sessionHash: sid ? sha256(sid) : null, userAgent: h.get("user-agent")?.slice(0, 300) ?? null, ip: clientAddress(h) };
}

/** A write from another site, even with our cookie, is refused. */
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  return !origin || new URL(origin).host === req.headers.get("host");
}
