import { getSession } from "@/lib/auth/session";
import { listMessages } from "@/lib/data/chats";
import { getDb } from "@/lib/db/client";
import { isUuid } from "@/lib/format";
import { jsonProblem, withAuthErrors } from "@/lib/http/json-download";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** One stream lives this long, then the browser reconnects from the last seq it saw. */
const LIFETIME_MS = 55_000;
const EVERY_MS = 2_500;

/**
 * Live messages for one chat as server-sent events: `?room=<id>&after=<seq>`. Each
 * check reads only messages after the last seq, so an idle chat costs one cheap query
 * every few seconds. Membership and blocks are enforced by listMessages. Clients that
 * cannot hold a stream fall back to polling (see ChatRoom).
 */
export const GET = withAuthErrors(async (req: Request) => {
  const url = new URL(req.url);
  const room = url.searchParams.get("room");
  if (!isUuid(room)) return jsonProblem(404, "That chat is not here.");
  let after = Math.max(0, Number(url.searchParams.get("after")) || 0);
  const session = await getSession();
  const db = getDb();
  // Fail with the normal auth/feature responses before the stream starts.
  await listMessages(db, session, room!, { after: Number.MAX_SAFE_INTEGER });

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const started = Date.now();
      const send = (event: string, data: unknown) => controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      controller.enqueue(enc.encode("retry: 3000\n\n"));
      try {
        while (!req.signal.aborted && Date.now() - started < LIFETIME_MS) {
          const fresh = await listMessages(db, session, room!, { after });
          if (fresh.length) {
            after = Math.max(after, ...fresh.map((m) => m.seq));
            send("messages", fresh);
          } else {
            controller.enqueue(enc.encode(": keep-alive\n\n"));
          }
          await new Promise((r) => setTimeout(r, EVERY_MS));
        }
      } catch {
        // The client reconnects or polls.
      } finally {
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
});
