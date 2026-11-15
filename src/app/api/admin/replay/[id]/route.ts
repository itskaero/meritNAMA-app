import { getSession } from "@/lib/auth/session";
import { readReplay } from "@/lib/data/activity-log";
import { getDb } from "@/lib/db/client";
import { jsonProblem, withAuthErrors } from "@/lib/http/json-download";

export const dynamic = "force-dynamic";

/** A recording's events for the player on Admin → Activity (owner only). */
export const GET = withAuthErrors(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const r = await readReplay(getDb(), await getSession(), id);
  if (!r) return jsonProblem(404, "That recording is gone.");
  return Response.json(r.events, { headers: { "Cache-Control": "no-store" } });
});
