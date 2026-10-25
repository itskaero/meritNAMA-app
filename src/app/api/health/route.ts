import { checkDatabase } from "@/lib/db/client";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Liveness/readiness for Docker and the public site's availability notice.
 * Unauthenticated, so it reports coarse states only — no versions, hosts or errors.
 * 503 when a configured database is unreachable.
 */
export async function GET() {
  const database = await checkDatabase();
  const ok = database !== "unreachable";
  const headers = new Headers({ "Cache-Control": "no-store" });
  const origin = env().PUBLIC_SITE_ORIGIN;
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  return Response.json({ status: ok ? "ok" : "degraded", database }, { status: ok ? 200 : 503, headers });
}
