import "server-only";
import { and, desc, gte, inArray, lt, sql } from "drizzle-orm";
import { assertCan, type Session } from "@/lib/auth/roles";
import type { Database } from "@/lib/db/client";
import { activityPings, searchCounts } from "@/lib/db/schema";
import { cleanKey, hourOf, MIN_SHOWN, PING_KEEP_MS, SEARCH_KEEP_MS, SEARCH_WINDOW_MS, VIEWING_WINDOW_MS } from "@/lib/domain/activity";
import type { Db } from "./shared";
import { ensureUser } from "./users";

/**
 * "N viewing now" and "searched right now". Pages record a view or a search; readers get
 * counts only (never who), and counts below MIN_SHOWN come back as null.
 */

/** Note that the signed-in member is looking at a page. Cheap: one upsert. */
export async function recordView(db: Database, session: Session | null, rawKey: string) {
  assertCan(session, "portal");
  const key = cleanKey(rawKey);
  if (!key || session!.isStub) return;
  const me = await ensureUser(db, session);
  await db.insert(activityPings).values({ key, userId: me.id }).onConflictDoUpdate({ target: [activityPings.key, activityPings.userId], set: { seenAt: new Date() } });
}

/** How many members viewed each page in the last few minutes; null when too few to show. */
export async function viewingNow(db: Database, session: Session | null, rawKeys: string[], now = new Date()): Promise<Map<string, number | null>> {
  assertCan(session, "portal");
  const keys = [...new Set(rawKeys.map(cleanKey).filter((k): k is string => Boolean(k)))];
  const out = new Map<string, number | null>(keys.map((k) => [k, null]));
  if (!keys.length) return out;
  const rows = await db
    .select({ key: activityPings.key, n: sql<number>`count(*)`.mapWith(Number) })
    .from(activityPings)
    .where(and(inArray(activityPings.key, keys), gte(activityPings.seenAt, new Date(now.getTime() - VIEWING_WINDOW_MS))))
    .groupBy(activityPings.key);
  for (const r of rows) out.set(r.key, r.n >= MIN_SHOWN ? r.n : null);
  return out;
}

/** Count one search for a seat, hospital or speciality. The label is what to show ("Anaesthesia · Jinnah"). */
export async function recordSearch(db: Database, session: Session | null, input: { key: string; label: string }, now = new Date()) {
  assertCan(session, "portal");
  const key = cleanKey(input.key);
  const label = input.label.replace(/\s+/g, " ").trim().slice(0, 120);
  if (!key || !label) return;
  await db.insert(searchCounts).values({ key, label, hour: hourOf(now), n: 1 })
    .onConflictDoUpdate({ target: [searchCounts.key, searchCounts.hour], set: { n: sql`${searchCounts.n} + 1`, label } });
}

/** The most searched keys in the last 24 hours, with their counts (only counts of MIN_SHOWN or more). */
export async function topSearches(db: Database, session: Session | null, opts: { prefix?: string; limit?: number } = {}, now = new Date()) {
  assertCan(session, "portal");
  const since = new Date(now.getTime() - SEARCH_WINDOW_MS);
  const prefix = opts.prefix ? cleanKey(opts.prefix) : null;
  const rows = await db
    .select({ key: searchCounts.key, label: sql<string>`max(${searchCounts.label})`, n: sql<number>`sum(${searchCounts.n})`.mapWith(Number) })
    .from(searchCounts)
    .where(and(gte(searchCounts.hour, hourOf(since)), prefix ? sql`${searchCounts.key} like ${`${prefix}%`}` : undefined))
    .groupBy(searchCounts.key)
    .having(sql`sum(${searchCounts.n}) >= ${MIN_SHOWN}`)
    .orderBy(desc(sql`sum(${searchCounts.n})`))
    .limit(Math.min(Math.max(opts.limit ?? 5, 1), 20));
  return rows;
}

/** Drop old pings and search counts. Called by the daily retention run. */
export async function pruneActivity(db: Db, now = new Date()) {
  const pings = await db.delete(activityPings).where(lt(activityPings.seenAt, new Date(now.getTime() - PING_KEEP_MS))).returning({ k: activityPings.key });
  const searches = await db.delete(searchCounts).where(lt(searchCounts.hour, new Date(now.getTime() - SEARCH_KEEP_MS))).returning({ k: searchCounts.key });
  return { pings: pings.length, searches: searches.length };
}
