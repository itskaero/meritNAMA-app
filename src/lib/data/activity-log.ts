import "server-only";
import { mkdir, open, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { and, count, countDistinct, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { assertCan, isStaff, type Session } from "@/lib/auth/roles";
import type { Database } from "@/lib/db/client";
import { candidateLinks, pageVisits, replays, sessions, users } from "@/lib/db/schema";
import { deviceLabel, networkOf, parseDevice, sharingSignals, type SharingSignal } from "@/lib/domain/device";
import { identityHmac } from "@/lib/domain/identity";
import { env } from "@/lib/env";
import { UserFacingError } from "@/lib/errors";
import { isUuid } from "@/lib/format";
import { indexSecret } from "./candidates";
import { loadFeatures } from "./settings";
import { writeAudit, type Db } from "./shared";
import { ensureUser } from "./users";

/**
 * The owner's view of how candidates use the site (Admin → Activity): every page opened,
 * on which device and network, live "who is online", account-sharing signals, session
 * replays and the screenshot watermark. Candidates only; staff are never logged. Addresses
 * are kept only as keyed hashes. Visits and replays are removed by the retention run.
 */

export const ONLINE_MS = 5 * 60_000;
export const REPLAY_MAX_BYTES = 25 * 1024 * 1024;
export const REPLAY_CHUNK_MAX_BYTES = 4 * 1024 * 1024;

type Client = { sessionHash: string | null; userAgent: string | null; ip: string | null };

const hashIp = (ip: string | null) => (ip ? identityHmac(indexSecret(), "ip", ip).slice(0, 32) : null);
const hashNet = (ip: string | null) => {
  const n = ip ? networkOf(ip) : null;
  return n ? identityHmac(indexSecret(), "net", n).slice(0, 32) : null;
};
const cleanPath = (p: string) => {
  const s = String(p ?? "").slice(0, 300);
  return s.startsWith("/") && !s.startsWith("//") ? s : null;
};

/** Is this session logged at all? Candidates, not team members. */
const logged = (session: Session) => !isStaff(session);

// ── Recording ────────────────────────────────────────────────────────────────

/** A signed-in candidate opened a page. */
export async function recordVisit(db: Database, session: Session | null, input: Client & { path: string }) {
  assertCan(session, "portal");
  const p = cleanPath(input.path);
  if (!p || !logged(session)) return;
  const me = await ensureUser(db, session);
  await db.insert(pageVisits).values({
    userId: me.id, sessionHash: input.sessionHash, path: p, device: deviceLabel(parseDevice(input.userAgent)),
    ipHmac: hashIp(input.ip), netHmac: hashNet(input.ip),
  });
}

const replayRoot = (root?: string) => path.resolve(/* turbopackIgnore: true */ root ?? env().APP_STORAGE_DIR, "replays");

/**
 * Append a batch of rrweb events (a JSON array, as sent) to a tab's recording. Each batch
 * is its own gzip member, so the file stays a valid gzip stream. Returns stop: true when the
 * recording is full or replay is switched off, so the browser stops sending.
 */
export async function appendReplay(db: Database, session: Session | null, input: Client & { id: string; path: string; events: string; count: number }, opts: { root?: string } = {}) {
  assertCan(session, "portal");
  if (!logged(session) || !(await loadFeatures(db)).replay) return { stop: true };
  if (!isUuid(input.id)) throw new UserFacingError("Bad recording id.");
  if (input.events.length > REPLAY_CHUNK_MAX_BYTES) return { stop: true };
  const me = await ensureUser(db, session);
  const [row] = await db.select().from(replays).where(eq(replays.id, input.id)).limit(1);
  if (row && row.userId !== me.id) throw new UserFacingError("forbidden");
  if (row && row.bytes > REPLAY_MAX_BYTES) return { stop: true };
  const file = row?.file ?? `${new Date().toISOString().slice(0, 10)}/${input.id}.jsonl.gz`;
  const full = path.resolve(/* turbopackIgnore: true */ replayRoot(opts.root), file);
  if (!full.startsWith(replayRoot(opts.root) + path.sep)) throw new UserFacingError("Bad recording id.");
  await mkdir(path.dirname(full), { recursive: true });
  const gz = gzipSync(Buffer.from(input.events.trim() + "\n"));
  const fh = await open(full, "a", 0o600);
  try { await fh.write(gz); } finally { await fh.close(); }
  const n = Math.max(0, Math.min(100_000, Math.floor(input.count) || 0));
  if (!row) {
    await db.insert(replays).values({
      id: input.id, userId: me.id, sessionHash: input.sessionHash, device: deviceLabel(parseDevice(input.userAgent)), netHmac: hashNet(input.ip),
      firstPath: cleanPath(input.path) ?? "/", file, events: n, bytes: gz.length,
    }).onConflictDoNothing();
  } else {
    await db.update(replays).set({ events: sql`${replays.events} + ${n}`, bytes: sql`${replays.bytes} + ${gz.length}`, lastAt: new Date() }).where(eq(replays.id, input.id));
  }
  return { stop: (row?.bytes ?? 0) + gz.length > REPLAY_MAX_BYTES };
}

// ── Watermark ────────────────────────────────────────────────────────────────

const B32 = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/** A short code for an account, the same every time, that only this server can map back. */
export function watermarkCode(userId: string): string {
  const h = Buffer.from(identityHmac(indexSecret(), "mark", userId), "hex");
  return Array.from(h.subarray(0, 6), (b) => B32[b % 32]).join("");
}

/** The watermark text for a page: the account code and when it was opened (Pakistan time). */
export function watermarkText(userId: string, at = new Date()) {
  const t = at.toLocaleString("en-GB", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Karachi" }).replace(",", "");
  return `${watermarkCode(userId)} ${t}`;
}

/** Who a code read off a screenshot belongs to. */
export async function traceWatermark(db: Database, session: Session | null, raw: string) {
  assertCan(session, "roles.manage");
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  if (code.length !== 6) throw new UserFacingError("Enter the 6-character code from the screenshot.");
  const all = await db.select({ id: users.id, email: users.email }).from(users);
  const hit = all.find((u) => watermarkCode(u.id) === code) ?? null;
  await writeAudit(db, session.email, { action: "activity.trace", entityType: "user", entityId: hit?.id ?? code, reason: "Traced a screenshot watermark" });
  return hit;
}

// ── Reading (owner only) ─────────────────────────────────────────────────────

const shortNet = (n: Map<string, string>, h: string | null) => {
  if (!h) return "unknown";
  if (!n.has(h)) n.set(h, `Network ${n.size + 1}`);
  return n.get(h)!;
};

/** Live and today's figures, daily active candidates, top pages and accounts that look shared. */
export async function activityOverview(db: Database, session: Session | null, now = new Date()) {
  assertCan(session, "roles.manage");
  const since = (ms: number) => new Date(now.getTime() - ms);
  const dayStart = new Date(`${now.toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" })}T00:00:00+05:00`);

  const online = await db.execute(sql`
    select distinct on (v.user_id) v.user_id, u.email, u.display_name, v.path, v.device, v.at,
      (select l.applicant_id from candidate_links l where l.user_id = v.user_id and l.status = 'verified' limit 1) as applicant_id
    from page_visits v join users u on u.id = v.user_id
    where v.at > ${since(ONLINE_MS).toISOString()}::timestamptz order by v.user_id, v.at desc`) as unknown as { user_id: string; email: string; display_name: string | null; path: string; device: string; at: Date; applicant_id: string | null }[];

  const [[today], [signIns], daily, pages, recent] = await Promise.all([
    db.select({ views: count(), visitors: countDistinct(pageVisits.userId) }).from(pageVisits).where(gte(pageVisits.at, dayStart)),
    db.select({ n: count() }).from(sessions).where(gte(sessions.createdAt, dayStart)),
    db.execute(sql`select to_char(date_trunc('day', at at time zone 'Asia/Karachi'), 'YYYY-MM-DD') as day, count(distinct user_id)::int as users, count(*)::int as views
      from page_visits where at > ${since(14 * 86_400_000).toISOString()}::timestamptz group by 1 order by 1`) as unknown as Promise<{ day: string; users: number; views: number }[]>,
    db.select({ path: pageVisits.path, n: count() }).from(pageVisits).where(gte(pageVisits.at, dayStart)).groupBy(pageVisits.path).orderBy(desc(count())).limit(8),
    db.select({ id: replays.id, userId: replays.userId, email: users.email, device: replays.device, firstPath: replays.firstPath, startedAt: replays.startedAt, lastAt: replays.lastAt, events: replays.events, bytes: replays.bytes })
      .from(replays).innerJoin(users, eq(users.id, replays.userId)).orderBy(desc(replays.startedAt)).limit(12),
  ]);

  // Sharing: only accounts seen on 2+ devices in the last 14 days need a closer look.
  const multi = await db.select({ userId: pageVisits.userId }).from(pageVisits).where(gte(pageVisits.at, since(14 * 86_400_000)))
    .groupBy(pageVisits.userId).having(sql`count(distinct ${pageVisits.device}) >= 2`).limit(300);
  const flagged: { userId: string; email: string; signals: SharingSignal[] }[] = [];
  if (multi.length) {
    const ids = multi.map((m) => m.userId);
    const rows = await db.select({ userId: pageVisits.userId, at: pageVisits.at, device: pageVisits.device, net: pageVisits.netHmac }).from(pageVisits)
      .where(and(inArray(pageVisits.userId, ids), gte(pageVisits.at, since(14 * 86_400_000))));
    const emails = new Map((await db.select({ id: users.id, email: users.email }).from(users).where(inArray(users.id, ids))).map((u) => [u.id, u.email]));
    const by = new Map<string, typeof rows>();
    for (const r of rows) (by.get(r.userId) ?? by.set(r.userId, []).get(r.userId)!).push(r);
    for (const [userId, v] of by) {
      const signals = sharingSignals(v).filter((s) => s.level !== "ok");
      if (signals.length) flagged.push({ userId, email: emails.get(userId) ?? "", signals });
    }
    flagged.sort((a, b) => (a.signals[0]!.level === "strong" ? 0 : 1) - (b.signals[0]!.level === "strong" ? 0 : 1));
  }

  return {
    online: online.map((o) => ({ userId: o.user_id, email: o.email, name: o.display_name, applicantId: o.applicant_id, path: o.path, device: o.device, at: new Date(o.at) })),
    today: { visitors: today?.visitors ?? 0, views: today?.views ?? 0, signIns: signIns?.n ?? 0 },
    daily, pages, recent, flagged,
  };
}

/** One account in full: devices and networks, the sharing verdict, every recent page, and its replays. */
export async function userActivity(db: Database, session: Session | null, userId: string) {
  assertCan(session, "roles.manage");
  if (!isUuid(userId)) return null;
  const [u] = await db.select({ id: users.id, email: users.email, name: users.displayName, role: users.role, createdAt: users.createdAt }).from(users).where(eq(users.id, userId)).limit(1);
  if (!u) return null;
  const [link] = await db.select({ applicantId: candidateLinks.applicantId }).from(candidateLinks).where(and(eq(candidateLinks.userId, userId), eq(candidateLinks.status, "verified"))).limit(1);
  const visits = await db.select().from(pageVisits).where(eq(pageVisits.userId, userId)).orderBy(desc(pageVisits.at)).limit(500);
  const nets = new Map<string, string>();
  for (const v of [...visits].reverse()) shortNet(nets, v.netHmac);
  const devices = new Map<string, { device: string; nets: Set<string>; first: Date; last: Date; views: number }>();
  for (const v of visits) {
    const d = devices.get(v.device) ?? devices.set(v.device, { device: v.device, nets: new Set(), first: v.at, last: v.at, views: 0 }).get(v.device)!;
    d.nets.add(shortNet(nets, v.netHmac)); d.views++;
    if (v.at < d.first) d.first = v.at;
    if (v.at > d.last) d.last = v.at;
  }
  const signIns = await db.select({ createdAt: sessions.createdAt, lastSeenAt: sessions.lastSeenAt, userAgent: sessions.userAgent }).from(sessions).where(eq(sessions.userId, userId)).orderBy(desc(sessions.createdAt)).limit(20);
  const recs = await db.select().from(replays).where(eq(replays.userId, userId)).orderBy(desc(replays.startedAt)).limit(50);
  return {
    user: { ...u, applicantId: link?.applicantId ?? null, watermark: watermarkCode(u.id) },
    signals: sharingSignals(visits.filter((v) => v.at.getTime() > Date.now() - 14 * 86_400_000).map((v) => ({ at: v.at, device: v.device, net: v.netHmac }))),
    devices: [...devices.values()].map((d) => ({ ...d, nets: [...d.nets] })).sort((a, b) => b.last.getTime() - a.last.getTime()),
    visits: visits.slice(0, 300).map((v) => ({ path: v.path, device: v.device, net: shortNet(nets, v.netHmac), at: v.at })),
    signIns: signIns.map((s) => ({ ...s, device: deviceLabel(parseDevice(s.userAgent)) })),
    replays: recs.map((r) => ({ ...r, net: shortNet(nets, r.netHmac) })),
  };
}

/** A recording's events, in order, for the player. */
export async function readReplay(db: Database, session: Session | null, id: string, opts: { root?: string } = {}) {
  assertCan(session, "roles.manage");
  if (!isUuid(id)) return null;
  const [r] = await db.select({ r: replays, email: users.email }).from(replays).innerJoin(users, eq(users.id, replays.userId)).where(eq(replays.id, id)).limit(1);
  if (!r) return null;
  const full = path.resolve(/* turbopackIgnore: true */ replayRoot(opts.root), r.r.file);
  if (!full.startsWith(replayRoot(opts.root) + path.sep)) return null;
  const buf = await readFile(full).catch(() => null);
  const events: unknown[] = [];
  if (buf) for (const line of gunzipSync(buf).toString("utf8").split("\n")) {
    if (!line.trim()) continue;
    try { const a = JSON.parse(line); if (Array.isArray(a)) events.push(...a); } catch { /* a cut-off batch: skip it */ }
  }
  await writeAudit(db, session.email, { action: "activity.replay_view", entityType: "replay", entityId: id, reason: "Watched a session replay" });
  return { meta: { ...r.r, email: r.email }, events };
}

// ── Retention (called by the daily run) ─────────────────────────────────────

export async function pruneVisits(db: Db, olderThan: Date) {
  return (await db.delete(pageVisits).where(lt(pageVisits.at, olderThan)).returning({ id: pageVisits.id })).length;
}

export async function pruneReplays(db: Db, olderThan: Date, opts: { root?: string } = {}) {
  const old = await db.delete(replays).where(lt(replays.lastAt, olderThan)).returning({ file: replays.file });
  const root = replayRoot(opts.root);
  for (const o of old) {
    const f = path.resolve(/* turbopackIgnore: true */ root, o.file);
    if (f.startsWith(root + path.sep)) await unlink(f).catch(() => {});
  }
  return old.length;
}
