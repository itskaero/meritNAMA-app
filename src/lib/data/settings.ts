import "server-only";
import { readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { and, eq, inArray, isNotNull, lt, or, sql } from "drizzle-orm";
import { cache } from "react";
import { assertCan, can, type Session } from "@/lib/auth/roles";
import type { Database } from "@/lib/db/client";
import { appSettings, candidateLinks, devOutbox, loginTokens, notifications, roundRoomMessages, sessions, simulationRuns } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { sendMail } from "@/lib/mail";
import { UserFacingError } from "@/lib/errors";
import { FEATURES, RETENTION, type Feature, type FeatureFlags, type Retention, type RetentionKey } from "@/lib/domain/settings";
import { requireReason, writeAudit, type Db } from "./shared";

export { FEATURES, RETENTION, type Feature, type FeatureFlags, type Retention, type RetentionKey };

/**
 * Workspace settings on Team & roles (owners only): which candidate features are
 * switched on, how long short-lived data is kept, and whether backups are running.
 */

// ── Feature switches ───────────────────────────────────────────────────────────

const ALL_ON: FeatureFlags = { community: true, calculator: true, planner: true, simulation: true };

async function readSetting<T>(db: Db, key: string): Promise<{ value: T; updatedBy: string; updatedAt: Date } | null> {
  const [r] = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
  return r ? { value: r.value as T, updatedBy: r.updatedBy, updatedAt: r.updatedAt } : null;
}

async function writeSetting(db: Db, session: Session, key: string, value: unknown, reason: string, before: unknown) {
  await db.insert(appSettings).values({ key, value, updatedBy: session.email, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedBy: session.email, updatedAt: new Date() } });
  await writeAudit(db, session.email, { action: `settings.${key}`, entityType: "settings", entityId: key, before, after: value, reason });
}

/** Feature switches in force. Anything not stored is on. Cached per request. */
export const loadFeatures = cache(async (db: Database): Promise<FeatureFlags> => {
  const stored = (await readSetting<Partial<FeatureFlags>>(db, "features"))?.value ?? {};
  return { ...ALL_ON, ...Object.fromEntries(Object.entries(stored).filter(([k]) => k in ALL_ON)) };
});

/** For pages and navigation: the switches, read by anyone signed in. */
export async function featureFlags(db: Database, session: Session | null): Promise<FeatureFlags> {
  assertCan(session, "portal");
  return loadFeatures(db);
}

/**
 * Refuse a candidate's write to a switched-off feature. Staff keep access, so they
 * can try a feature before switching it on.
 */
export async function assertFeature(db: Database, session: Session | null, feature: Feature) {
  assertCan(session, "portal");
  if (can(session, "staff")) return;
  if (!(await loadFeatures(db))[feature]) throw new UserFacingError(`${FEATURES[feature].label} is switched off for now.`);
}

export async function setFeatures(db: Database, session: Session | null, input: { flags: Partial<FeatureFlags>; reason: string }) {
  assertCan(session, "roles.manage");
  const reason = requireReason(input.reason, "changing feature switches");
  const before = await loadFeatures(db);
  const next = { ...before, ...Object.fromEntries(Object.entries(input.flags).filter(([k, v]) => k in ALL_ON && typeof v === "boolean")) } as FeatureFlags;
  await db.transaction((tx) => writeSetting(tx, session, "features", next, reason, before));
  return next;
}

// ── Data retention ─────────────────────────────────────────────────────────────

const DEFAULT_RETENTION = Object.fromEntries(Object.entries(RETENTION).map(([k, v]) => [k, v.default])) as Retention;

export async function loadRetention(db: Db) {
  const s = await readSetting<Partial<Retention> & { lastRun?: string; lastResult?: Record<RetentionKey, number> }>(db, "retention");
  const days = { ...DEFAULT_RETENTION };
  for (const k of Object.keys(RETENTION) as RetentionKey[]) {
    const v = s?.value[k];
    if (typeof v === "number" && Number.isInteger(v)) days[k] = v;
  }
  return { days, lastRun: s?.value.lastRun ? new Date(s.value.lastRun) : null, lastResult: s?.value.lastResult ?? null, updatedBy: s?.updatedBy ?? null };
}

export async function retentionSettings(db: Database, session: Session | null) {
  assertCan(session, "roles.manage");
  return loadRetention(db);
}

export async function setRetention(db: Database, session: Session | null, input: { days: Partial<Record<RetentionKey, number>>; reason: string }) {
  assertCan(session, "roles.manage");
  const reason = requireReason(input.reason, "changing data retention");
  const current = await loadRetention(db);
  const days = { ...current.days };
  for (const [k, v] of Object.entries(input.days) as [RetentionKey, number][]) {
    const r = RETENTION[k];
    if (!r) continue;
    if (!Number.isInteger(v) || v < r.min || v > r.max) throw new UserFacingError(`${r.label}: keep between ${r.min} and ${r.max} days.`);
    days[k] = v;
  }
  await db.transaction((tx) => writeSetting(tx, session, "retention", { ...days, lastRun: current.lastRun?.toISOString(), lastResult: current.lastResult }, reason, current.days));
  return days;
}

const before = (days: number) => new Date(Date.now() - days * 86_400_000);

function retentionScopes(days: Retention) {
  return {
    signInLinks: or(lt(loginTokens.expiresAt, before(days.signInLinks)), and(isNotNull(loginTokens.usedAt), lt(loginTokens.usedAt, before(days.signInLinks))))!,
    sessions: lt(sessions.expiresAt, before(days.sessions)),
    devMailbox: lt(devOutbox.createdAt, before(days.devMailbox)),
    readNotifications: and(isNotNull(notifications.readAt), lt(notifications.readAt, before(days.readNotifications)))!,
    whatIfRuns: and(isNotNull(simulationRuns.ownerUserId), lt(simulationRuns.createdAt, before(days.whatIfRuns)), inArray(simulationRuns.status, ["done", "failed"]))!,
    roomMessages: and(eq(roundRoomMessages.kind, "message"), lt(roundRoomMessages.createdAt, before(days.roomMessages)))!,
    evidence: and(isNotNull(candidateLinks.evidenceFile), inArray(candidateLinks.status, ["verified", "rejected"]), lt(candidateLinks.reviewedAt, before(days.evidence)))!,
  };
}

const count = sql<number>`count(*)`.mapWith(Number);

/** How much each rule would remove now. */
export async function retentionPreview(db: Database, session: Session | null): Promise<Record<RetentionKey, number>> {
  assertCan(session, "roles.manage");
  const w = retentionScopes((await loadRetention(db)).days);
  const [a] = await db.select({ n: count }).from(loginTokens).where(w.signInLinks);
  const [b] = await db.select({ n: count }).from(sessions).where(w.sessions);
  const [c] = await db.select({ n: count }).from(devOutbox).where(w.devMailbox);
  const [d] = await db.select({ n: count }).from(notifications).where(w.readNotifications);
  const [e] = await db.select({ n: count }).from(simulationRuns).where(w.whatIfRuns);
  const [f] = await db.select({ n: count }).from(candidateLinks).where(w.evidence);
  const [g] = await db.select({ n: count }).from(roundRoomMessages).where(w.roomMessages);
  return { signInLinks: a?.n ?? 0, sessions: b?.n ?? 0, devMailbox: c?.n ?? 0, readNotifications: d?.n ?? 0, whatIfRuns: e?.n ?? 0, evidence: f?.n ?? 0, roomMessages: g?.n ?? 0 };
}

/**
 * Remove what is past its retention period. `actor` is "system" for the daily run.
 * Evidence files are deleted from storage and their reference cleared; the decision
 * itself (status, reviewer, reason) stays.
 */
async function purge(db: Database, actor: string, reason: string, opts: { root?: string } = {}) {
  const r = await loadRetention(db);
  const w = retentionScopes(r.days);
  const evidence = await db.select({ id: candidateLinks.id, file: candidateLinks.evidenceFile }).from(candidateLinks).where(w.evidence);
  const dir = path.resolve(/* turbopackIgnore: true */ opts.root ?? env().APP_STORAGE_DIR, "evidence");
  for (const e of evidence) {
    const file = path.resolve(/* turbopackIgnore: true */ dir, path.basename(e.file ?? ""));
    if (file.startsWith(dir + path.sep)) await unlink(file).catch(() => {});
  }
  const result = await db.transaction(async (tx) => {
    const n = async (p: Promise<unknown[]>) => (await p).length;
    const out: Record<RetentionKey, number> = {
      signInLinks: await n(tx.delete(loginTokens).where(w.signInLinks).returning({ id: loginTokens.id })),
      sessions: await n(tx.delete(sessions).where(w.sessions).returning({ id: sessions.idHash })),
      devMailbox: await n(tx.delete(devOutbox).where(w.devMailbox).returning({ id: devOutbox.id })),
      readNotifications: await n(tx.delete(notifications).where(w.readNotifications).returning({ id: notifications.id })),
      whatIfRuns: await n(tx.delete(simulationRuns).where(w.whatIfRuns).returning({ id: simulationRuns.id })),
      roomMessages: await n(tx.delete(roundRoomMessages).where(w.roomMessages).returning({ id: roundRoomMessages.id })),
      evidence: evidence.length
        ? await n(tx.update(candidateLinks).set({ evidenceFile: null }).where(inArray(candidateLinks.id, evidence.map((e) => e.id))).returning({ id: candidateLinks.id }))
        : 0,
    };
    const value = { ...r.days, lastRun: new Date().toISOString(), lastResult: out };
    await tx.insert(appSettings).values({ key: "retention", value, updatedBy: r.updatedBy ?? actor }).onConflictDoUpdate({ target: appSettings.key, set: { value } });
    await writeAudit(tx, actor, { action: "settings.retention_run", entityType: "settings", entityId: "retention", after: out, reason });
    return out;
  });
  return result;
}

export async function applyRetention(db: Database, session: Session | null, input: { reason: string }, opts: { root?: string } = {}) {
  assertCan(session, "roles.manage");
  return purge(db, session.email, requireReason(input.reason, "removing data"), opts);
}

/**
 * The daily run: does nothing unless the last run is more than a day old. Called
 * after responses in the admin workspace, so no scheduler is needed.
 */
export async function retentionIfDue(db: Database): Promise<boolean> {
  const { lastRun } = await loadRetention(db);
  if (lastRun && Date.now() - lastRun.getTime() < 86_400_000) return false;
  await purge(db, "system", "Daily retention run");
  return true;
}

// ── Backups ────────────────────────────────────────────────────────────────────

export type BackupStatus = {
  dir: string;
  readable: boolean;
  backups: { name: string; at: Date; bytes: number; database: boolean; storage: boolean; checksums: boolean }[];
  state: "ok" | "stale" | "missing" | "unreadable";
};

/** Folders scripts/backup.sh wrote (newest first), read from the backups mount. */
export async function backupStatus(session: Session | null, opts: { dir?: string } = {}): Promise<BackupStatus> {
  assertCan(session, "roles.manage");
  const dir = path.resolve(/* turbopackIgnore: true */ opts.dir ?? env().APP_BACKUP_DIR);
  let names: string[];
  try {
    names = (await readdir(dir)).filter((n) => /^meritnama-\d{8}T\d{6}Z$/.test(n)).sort().reverse().slice(0, 7);
  } catch {
    return { dir, readable: false, backups: [], state: "unreadable" };
  }
  const backups = [];
  for (const name of names) {
    const m = /^meritnama-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(name)!;
    const files = await readdir(path.join(dir, name)).catch(() => [] as string[]);
    let bytes = 0;
    for (const f of files) bytes += (await stat(path.join(dir, name, f)).catch(() => ({ size: 0 }))).size;
    backups.push({
      name, at: new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`), bytes,
      database: files.includes("database.dump"), storage: files.includes("storage.tar.gz"), checksums: files.includes("SHA256SUMS"),
    });
  }
  const newest = backups.find((b) => b.database);
  const state = !newest ? "missing" : Date.now() - newest.at.getTime() > 26 * 3_600_000 ? "stale" : "ok";
  return { dir, readable: true, backups, state };
}

// ── Email ──────────────────────────────────────────────────────────────────────

/** Where sign-in emails go out from (never the password), for the Team & roles page. */
export async function mailStatus(session: Session | null) {
  assertCan(session, "roles.manage");
  const { SMTP_URL, MAIL_FROM } = env();
  if (!SMTP_URL) return { configured: false as const, from: MAIL_FROM };
  const u = new URL(SMTP_URL);
  return { configured: true as const, host: u.hostname, port: u.port || (u.protocol === "smtps:" ? "465" : "587"), user: decodeURIComponent(u.username), from: MAIL_FROM };
}

/**
 * Send a test email to the signed-in owner, so the SMTP settings can be checked
 * from the browser. Common failures are explained without echoing secrets.
 */
export async function sendTestEmail(db: Database, session: Session | null) {
  assertCan(session, "roles.manage");
  try {
    await sendMail(db, {
      to: session.email,
      subject: "meritNAMA test email",
      text: `This is a test from meritNAMA at ${env().APP_URL}.\n\nIf you can read it, sign-in emails work.`,
    });
  } catch (e) {
    const err = e as { code?: string; responseCode?: number; message?: string };
    const why =
      err.code === "EAUTH" || err.responseCode === 535 ? "The mail server refused the login. For Gmail: use an App Password (not your normal password), and write the @ in the username as %40 in SMTP_URL."
      : err.code === "ECONNECTION" || err.code === "ETIMEDOUT" || err.code === "ESOCKET" || err.code === "EDNS" ? "Could not reach the mail server. Check the host and port in SMTP_URL, and that the NAS may connect out on that port (465 for smtps)."
      : err.message === "SMTP_URL is not configured" ? "SMTP_URL is not set in .env."
      : "Sending failed. See the app's logs for details.";
    console.error("test email failed", err.code ?? "", err.responseCode ?? "");
    throw new UserFacingError(why);
  }
  return { to: session.email };
}
