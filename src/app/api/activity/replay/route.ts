import { getSession } from "@/lib/auth/session";
import { appendReplay, REPLAY_CHUNK_MAX_BYTES } from "@/lib/data/activity-log";
import { getDb } from "@/lib/db/client";
import { requestClient, sameOrigin } from "@/lib/http/client";
import { jsonProblem, withAuthErrors } from "@/lib/http/json-download";

export const dynamic = "force-dynamic";

/**
 * A batch of recorded events for one tab: ?id=<tab uuid>&path=<first page>&n=<events>, body =
 * the events as a JSON array. Answers { stop } so the browser stops when replay is off or full.
 */
export const POST = withAuthErrors(async (req: Request) => {
  if (!sameOrigin(req)) return jsonProblem(403, "forbidden");
  if (Number(req.headers.get("content-length") ?? 0) > REPLAY_CHUNK_MAX_BYTES) return Response.json({ stop: true });
  const u = new URL(req.url);
  const events = await req.text();
  if (!events.startsWith("[")) return jsonProblem(400, "Send the events as a JSON array.");
  const r = await appendReplay(getDb(), await getSession(), {
    ...(await requestClient()), id: u.searchParams.get("id") ?? "", path: u.searchParams.get("path") ?? "/", count: Number(u.searchParams.get("n") ?? 0), events,
  });
  return Response.json(r, { headers: { "Cache-Control": "no-store" } });
});
