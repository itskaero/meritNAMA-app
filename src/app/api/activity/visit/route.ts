import { getSession } from "@/lib/auth/session";
import { recordVisit } from "@/lib/data/activity-log";
import { getDb } from "@/lib/db/client";
import { requestClient, sameOrigin } from "@/lib/http/client";
import { jsonProblem, withAuthErrors } from "@/lib/http/json-download";

export const dynamic = "force-dynamic";

/** The portal reports each page a candidate opens (Admin → Activity). */
export const POST = withAuthErrors(async (req: Request) => {
  if (!sameOrigin(req)) return jsonProblem(403, "forbidden");
  const body = (await req.json().catch(() => null)) as { path?: unknown } | null;
  if (typeof body?.path !== "string") return jsonProblem(400, "Send the path.");
  await recordVisit(getDb(), await getSession(), { ...(await requestClient()), path: body.path });
  return new Response(null, { status: 204 });
});
