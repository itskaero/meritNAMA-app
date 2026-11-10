import "server-only";
import { and, count, desc, eq, gt, sql } from "drizzle-orm";
import { assertCan, type Session } from "@/lib/auth/roles";
import type { Database } from "@/lib/db/client";
import { accessRequests, appSettings, users } from "@/lib/db/schema";
import {
  ACCESS_DENIED,
  accessDecision,
  accessRequestSchema,
  accessSettingsSchema,
  DEFAULT_ACCESS,
  type AccessSettings,
} from "@/lib/domain/access";
import { normalizeEmail, parseEmailList } from "@/lib/domain/identity";
import { env } from "@/lib/env";
import { UserFacingError } from "@/lib/errors";
import { sendMail } from "@/lib/mail";
import { requireReason, writeAudit } from "./shared";

/*
 * The paywall. Settings live in app_settings ("access"); requests in access_requests.
 * Signing in checks mayEnter() (login.ts); staff approve a request after checking the
 * payment by hand, or grant access to an email directly.
 */

const KEY = "access";

export async function loadAccessSettings(db: Database): Promise<AccessSettings> {
  const [r] = await db.select().from(appSettings).where(eq(appSettings.key, KEY)).limit(1);
  return { ...DEFAULT_ACCESS, ...((r?.value as Partial<AccessSettings> | undefined) ?? {}) };
}

/** Whether this email may sign in right now. Called before an account or a link is created. */
export async function mayEnter(db: Database, rawEmail: string): Promise<boolean> {
  const settings = await loadAccessSettings(db);
  if (!settings.paywall) return true;
  const email = normalizeEmail(rawEmail);
  if (!email) return false;
  const [u] = await db.select({ role: users.role, createdAt: users.createdAt }).from(users).where(eq(users.email, email)).limit(1);
  const [req] = await db.select({ status: accessRequests.status }).from(accessRequests).where(eq(accessRequests.email, email)).limit(1);
  return accessDecision({
    settings,
    ownerEmail: parseEmailList(env().OWNER_EMAILS).has(email),
    existingRole: u?.role ?? null,
    existingSince: u?.createdAt ?? null,
    approved: req?.status === "approved",
  }).allowed;
}

export async function assertMayEnter(db: Database, email: string) {
  if (!(await mayEnter(db, email))) throw new UserFacingError(ACCESS_DENIED);
}

/** Staff and the settings page read the full settings. */
export async function accessSettings(db: Database, session: Session | null) {
  assertCan(session, "staff");
  return loadAccessSettings(db);
}

export async function saveAccessSettings(db: Database, session: Session | null, input: Omit<AccessSettings, "since"> & { reason: string }) {
  assertCan(session, "roles.manage");
  const { reason, ...rest } = input;
  const next = accessSettingsSchema.parse(rest);
  requireReason(reason);
  const before = await loadAccessSettings(db);
  const value: AccessSettings = { ...before, ...next, since: next.paywall ? (before.paywall ? before.since : new Date().toISOString()) : before.since };
  await db.transaction(async (tx) => {
    await tx.insert(appSettings).values({ key: KEY, value, updatedBy: session!.email, updatedAt: new Date() })
      .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedBy: session!.email, updatedAt: new Date() } });
    await writeAudit(tx, session!.email, { action: "settings.access", entityType: "settings", entityId: KEY, before, after: value, reason });
  });
  return value;
}

export type AccessInput = { email: string; applicantId: string; amountPkr: number | null; reference: string; message: string };

/**
 * Ask for access (no sign-in needed). Everything is checked against the current
 * settings; the answer says only what the person needs to know about their own email.
 */
export async function submitAccessRequest(db: Database, input: AccessInput) {
  const settings = await loadAccessSettings(db);
  if (!settings.paywall) throw new UserFacingError("Access is open. Sign in with an email link.");
  if (!settings.requestsOpen) throw new UserFacingError(settings.closedMessage);
  const data = accessRequestSchema(settings).parse(input);

  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(accessRequests).where(gt(accessRequests.createdAt, new Date(Date.now() - 3_600_000)));
  if (n >= 300) throw new UserFacingError("Many requests are coming in. Try again in a little while.");

  const [existing] = await db.select({ status: accessRequests.status }).from(accessRequests).where(eq(accessRequests.email, data.email)).limit(1);
  if (existing?.status === "approved") throw new UserFacingError("This email is already approved. Sign in with an email link.");
  if (existing?.status === "pending") throw new UserFacingError("A request for this email is already waiting. We will email you when it is approved.");

  const row = { email: data.email, applicantId: data.applicantId, amountPkr: data.amountPkr, reference: data.reference, message: data.message, status: "pending", note: null, reviewedBy: null, reviewedAt: null, createdAt: new Date() };
  await db.insert(accessRequests).values(row).onConflictDoUpdate({ target: accessRequests.email, set: row });
}

export async function listAccessRequests(db: Database, session: Session | null, opts: { status?: "pending" | "approved" | "rejected" } = {}) {
  assertCan(session, "candidates.verify");
  return db
    .select()
    .from(accessRequests)
    .where(opts.status ? eq(accessRequests.status, opts.status) : undefined)
    .orderBy(sql`case ${accessRequests.status} when 'pending' then 0 else 1 end`, desc(accessRequests.createdAt))
    .limit(200);
}

export async function pendingAccessCount(db: Database, session: Session | null) {
  assertCan(session, "candidates.verify");
  const [r] = await db.select({ n: count() }).from(accessRequests).where(eq(accessRequests.status, "pending"));
  return r?.n ?? 0;
}

async function tellApproved(db: Database, email: string) {
  const url = `${env().APP_URL.replace(/\/$/, "")}/sign-in`;
  await sendMail(db, {
    to: email,
    subject: "Your meritNAMA access is approved",
    text: ["Your payment was checked and your access to meritNAMA is approved.", "", `Sign in here with this email address: ${url}`, "", "You will get a one-time link by email."].join("\n"),
  }).catch(() => {});
}

/** Approve or reject a request, after checking the payment by hand. Rejection needs a note the person can be told. */
export async function reviewAccessRequest(db: Database, session: Session | null, input: { id: string; decision: "approve" | "reject"; note: string }) {
  assertCan(session, "candidates.verify");
  const note = input.note.trim();
  if (input.decision === "reject" && note.length < 3) throw new UserFacingError("Say why, in a few words, so it can be corrected.");
  const status = input.decision === "approve" ? "approved" : "rejected";
  const done = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(accessRequests)
      .set({ status, note: note || null, reviewedBy: session!.email, reviewedAt: new Date() })
      .where(and(eq(accessRequests.id, input.id), eq(accessRequests.status, "pending")))
      .returning({ email: accessRequests.email, amountPkr: accessRequests.amountPkr, reference: accessRequests.reference });
    if (!row) throw new UserFacingError("That request was already decided.");
    await writeAudit(tx, session!.email, { action: `access.${input.decision}`, entityType: "access_request", entityId: input.id, after: { email: row.email, amountPkr: row.amountPkr, reference: row.reference }, reason: note || "Payment checked" });
    return row;
  });
  if (input.decision === "approve") await tellApproved(db, done.email);
  return { status, email: done.email };
}

/** Approve an email directly (someone who paid another way, or a friend of the project). */
export async function grantAccess(db: Database, session: Session | null, input: { email: string; note: string }) {
  assertCan(session, "candidates.verify");
  const email = normalizeEmail(input.email);
  if (!email) throw new UserFacingError("Enter a valid email address.");
  const note = input.note.trim() || "Granted by staff";
  const row = { email, status: "approved", note, reviewedBy: session!.email, reviewedAt: new Date() };
  await db.transaction(async (tx) => {
    await tx.insert(accessRequests).values(row).onConflictDoUpdate({ target: accessRequests.email, set: row });
    await writeAudit(tx, session!.email, { action: "access.grant", entityType: "access_request", entityId: email, reason: note });
  });
  await tellApproved(db, email);
  return { email };
}

/** Take access away from an approved email (the request becomes rejected). */
export async function revokeAccess(db: Database, session: Session | null, input: { id: string; note: string }) {
  assertCan(session, "candidates.verify");
  const note = input.note.trim();
  if (note.length < 3) throw new UserFacingError("Say why, in a few words.");
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(accessRequests)
      .set({ status: "rejected", note, reviewedBy: session!.email, reviewedAt: new Date() })
      .where(and(eq(accessRequests.id, input.id), eq(accessRequests.status, "approved")))
      .returning({ email: accessRequests.email });
    if (!row) throw new UserFacingError("That request is not approved.");
    await writeAudit(tx, session!.email, { action: "access.revoke", entityType: "access_request", entityId: input.id, after: { email: row.email }, reason: note });
  });
}
