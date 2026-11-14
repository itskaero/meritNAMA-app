import { timingSafeEqual } from "node:crypto";
import { checkDatabase, getDb } from "@/lib/db/client";
import { accessRemindersIfDue, autoMatchPending } from "@/lib/data/access";
import { recordWorkerTick } from "@/lib/data/admin-today";
import { autoImportDataFolder } from "@/lib/data/datastore";
import { jobsSyncIfDue } from "@/lib/data/jobs";
import { failInterruptedRuns, processQueuedRuns } from "@/lib/data/simulation";
import { syncIfDue } from "@/lib/data/sync";
import { retentionIfDue } from "@/lib/data/settings";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Background work, called once a minute by the worker container (docker-compose.yml,
 * service "worker") over the internal Docker network:
 *   - start simulation runs that were queued but never started (e.g. after a restart),
 *   - mark runs that died mid-way as failed, so they can be run again,
 *   - apply data retention once a day, without waiting for a staff visit,
 *   - refresh doctor job adverts every 6 hours (src/lib/data/jobs.ts),
 *   - approve access requests whose transaction ID is now in an imported statement; send expiry reminders daily,
 *   - sync the data repository (at most hourly, when one is set), then rescan the data folder
 *     and publish new files when auto-publish is on. Replacements are never applied here.
 * Off unless INTERNAL_TOKEN is set. Requests that came through a proxy or tunnel are
 * refused, so it is never reachable from the internet even with the token.
 */
export async function POST(req: Request) {
  const token = env().INTERNAL_TOKEN;
  if (!token) return new Response(null, { status: 404 });
  // Next adds X-Forwarded-For to every request, so look for headers only a proxy adds:
  // Cloudflare's (tunnel), X-Real-IP (Synology/nginx), Via. Caddy blocks the path itself.
  if (["cf-ray", "cf-connecting-ip", "x-real-ip", "via"].some((h) => req.headers.has(h))) {
    return new Response(null, { status: 404 });
  }
  const given = Buffer.from((req.headers.get("authorization") ?? "").replace(/^Bearer /, ""));
  const want = Buffer.from(token);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return new Response(null, { status: 401 });
  if ((await checkDatabase()) !== "ok") return Response.json({ ok: false, database: "unreachable" }, { status: 503 });

  const db = getDb();
  await recordWorkerTick(db).catch((e) => console.error("worker: tick record", e));
  const started = await processQueuedRuns(db).catch((e) => { console.error("worker: queued runs", e); return -1; });
  await failInterruptedRuns(db).catch((e) => console.error("worker: interrupted runs", e));
  const synced = await syncIfDue(db).catch((e) => { console.error("worker: data sync", e); return false; });
  const data = await autoImportDataFolder(db).catch((e) => { console.error("worker: data folder", e); return null; });
  const jobsRan = await jobsSyncIfDue(db).catch((e) => { console.error("worker: jobs", e); return false; });
  // Access: re-check waiting requests against imported payments; once a day, expiry reminders.
  const accessApproved = await autoMatchPending(db).catch((e) => { console.error("worker: access match", e); return 0; });
  await accessRemindersIfDue(db).catch((e) => console.error("worker: access reminders", e));
  const retention = await retentionIfDue(db).catch((e) => { console.error("worker: retention", e); return false; });
  return Response.json({ ok: true, startedRuns: started, retentionRan: retention, dataSynced: synced, jobsSynced: jobsRan, dataApplied: data?.applied ?? 0, accessApproved }, { headers: { "Cache-Control": "no-store" } });
}
