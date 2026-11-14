import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, count, desc, eq, gt, isNotNull, isNull, max, min, ne, sql } from "drizzle-orm";
import { assertCan, type Session } from "@/lib/auth/roles";
import type { Database } from "@/lib/db/client";
import { accessRequests, accessVouchers, appSettings, inductionSchedule, meritRounds, notifications, payments, users } from "@/lib/db/schema";
import {
  ACCESS_DENIED,
  ACCESS_EXPIRED,
  accessDecision,
  accessRequestSchema,
  accessSettingsSchema,
  DEFAULT_ACCESS,
  type AccessDecision,
  type AccessSettings,
} from "@/lib/domain/access";
import { normalizeEmail, parseEmailList } from "@/lib/domain/identity";
import { accessEnds, AUTO_LABELS, dueForReminder, matchPayment, normalizeVoucher, voucherCode, type AutoResult } from "@/lib/domain/payments";
import { env } from "@/lib/env";
import { UserFacingError } from "@/lib/errors";
import { sendMail } from "@/lib/mail";
import { normalizeTid, parseStatement, type Channel } from "@/lib/payments/parse";
import { requireReason, writeAudit } from "./shared";

/*
 * The paywall. Settings live in app_settings ("access"); requests in access_requests.
 * Signing in checks mayEnter() (login.ts). A request whose transaction ID is in an imported
 * statement with the right amount is approved by the system at once; a voucher code too.
 * Everything else waits for a person, with the reason the automatic check gave. Access
 * lasts one induction cycle when perInduction is on.
 */

const KEY = "access";
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export async function loadAccessSettings(db: Database): Promise<AccessSettings> {
  const [r] = await db.select().from(appSettings).where(eq(appSettings.key, KEY)).limit(1);
  return { ...DEFAULT_ACCESS, ...((r?.value as Partial<AccessSettings> | undefined) ?? {}) };
}

/** The running induction and its dates: PHF's schedule when in, else the merit rounds' cycle dates. */
export async function currentCycle(db: Database): Promise<{ induction: number | null; start: Date | null; end: Date | null }> {
  const [[s], [r]] = await Promise.all([
    db.select({ id: max(inductionSchedule.inductionId) }).from(inductionSchedule),
    db.select({ id: max(meritRounds.inductionId) }).from(meritRounds),
  ]);
  const induction = Math.max(s?.id ?? -1, r?.id ?? -1);
  if (induction < 0) return { induction: null, start: null, end: null };
  const [sched] = await db.select({ start: min(inductionSchedule.startsAt), end: max(inductionSchedule.endsAt) }).from(inductionSchedule).where(eq(inductionSchedule.inductionId, induction));
  if (sched?.end) return { induction, start: sched.start ?? null, end: sched.end };
  const [rounds] = await db.select({ start: min(meritRounds.startsOn), end: max(meritRounds.endsOn) }).from(meritRounds).where(eq(meritRounds.inductionId, induction));
  const day = (d: string | null | undefined) => (d ? new Date(`${d}T18:59:59Z`) : null); // end of the day in Pakistan
  return { induction, start: day(rounds?.start), end: day(rounds?.end) };
}

async function entryDecision(db: Database, rawEmail: string): Promise<AccessDecision> {
  const settings = await loadAccessSettings(db);
  if (!settings.paywall) return { allowed: true };
  const email = normalizeEmail(rawEmail);
  if (!email) return { allowed: false, reason: "paywall" };
  const [u] = await db.select({ role: users.role, createdAt: users.createdAt }).from(users).where(eq(users.email, email)).limit(1);
  const [req] = await db.select({ status: accessRequests.status, expiresAt: accessRequests.expiresAt }).from(accessRequests).where(eq(accessRequests.email, email)).limit(1);
  return accessDecision({
    settings,
    ownerEmail: parseEmailList(env().OWNER_EMAILS).has(email),
    existingRole: u?.role ?? null,
    existingSince: u?.createdAt ?? null,
    approved: req?.status === "approved",
    expiresAt: req?.expiresAt ?? null,
  });
}

/** Whether this email may sign in right now. Called before an account or a link is created. */
export async function mayEnter(db: Database, rawEmail: string): Promise<boolean> {
  return (await entryDecision(db, rawEmail)).allowed;
}

export async function assertMayEnter(db: Database, email: string) {
  const d = await entryDecision(db, email);
  if (!d.allowed) throw new UserFacingError(d.reason === "expired" ? ACCESS_EXPIRED : ACCESS_DENIED);
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

// ── Telling people ───────────────────────────────────────────────────────────

const appUrl = (p: string) => `${env().APP_URL.replace(/\/$/, "")}${p}`;
const dayText = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Karachi" });

/** An inbox notice, when the person already has an account. */
async function notice(db: Database, email: string, title: string, href: string) {
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (u) await db.insert(notifications).values({ userId: u.id, kind: "access", title, href }).catch(() => {});
}

async function tellApproved(db: Database, email: string, expiresAt: Date | null) {
  await sendMail(db, {
    to: email,
    subject: "Your meritNAMA access is approved",
    text: [
      "Your payment was checked and your access to meritNAMA is approved.",
      ...(expiresAt ? ["", `It lasts until ${dayText(expiresAt)}, the end of this induction.`] : []),
      "", `Sign in here with this email address: ${appUrl("/sign-in")}`, "", "You will get a one-time link by email.",
    ].join("\n"),
  }).catch(() => {});
  await notice(db, email, expiresAt ? `Access approved until ${dayText(expiresAt)}` : "Access approved", "/portal");
}

async function tellRejected(db: Database, email: string, note: string) {
  await sendMail(db, {
    to: email,
    subject: "Your meritNAMA access request needs a look",
    text: ["We could not approve your access request yet.", "", `Why: ${note}`, "", `You can send it again, corrected, from ${appUrl("/access")}.`].join("\n"),
  }).catch(() => {});
}

// ── Approving ────────────────────────────────────────────────────────────────

async function expiryNow(db: Database, settings: AccessSettings) {
  const cycle = await currentCycle(db);
  return { induction: cycle.induction, expiresAt: settings.perInduction ? accessEnds(cycle.end, new Date()) : null };
}

async function approveTx(tx: Tx, id: string, by: string, fields: { note: string | null; autoResult?: AutoResult | null; induction: number | null; expiresAt: Date | null }) {
  const [row] = await tx.update(accessRequests)
    .set({ status: "approved", note: fields.note, reviewedBy: by, reviewedAt: new Date(), induction: fields.induction, expiresAt: fields.expiresAt, remindedAt: null, ...(fields.autoResult !== undefined ? { autoResult: fields.autoResult } : {}) })
    .where(and(eq(accessRequests.id, id), eq(accessRequests.status, "pending")))
    .returning({ email: accessRequests.email, amountPkr: accessRequests.amountPkr, reference: accessRequests.reference });
  return row ?? null;
}

const tidSql = sql`upper(regexp_replace(coalesce(${accessRequests.reference}, ''), '[^A-Za-z0-9]', '', 'g'))`;

/**
 * Run the automatic check on one waiting request. Approves it (as "system") when the
 * transaction ID is in an imported statement and everything adds up; otherwise records why not.
 */
async function checkOne(db: Database, id: string, settings: AccessSettings, cycle: { induction: number | null; start: Date | null; expiresAt: Date | null }): Promise<AutoResult | null> {
  const [req] = await db.select({ id: accessRequests.id, email: accessRequests.email, reference: accessRequests.reference, status: accessRequests.status }).from(accessRequests).where(eq(accessRequests.id, id)).limit(1);
  if (!req || req.status !== "pending") return null;
  const tid = req.reference ? normalizeTid(req.reference) : null;
  const [pay] = tid ? await db.select().from(payments).where(eq(payments.tid, tid)).limit(1) : [];
  const [matched] = pay?.matchedRequestId ? await db.select({ email: accessRequests.email }).from(accessRequests).where(eq(accessRequests.id, pay.matchedRequestId)).limit(1) : [];
  const [others] = tid ? await db.select({ n: count() }).from(accessRequests).where(and(eq(accessRequests.status, "pending"), ne(accessRequests.id, id), sql`${tidSql} = ${tid}`)) : [];
  // A payment from before the cycle began (with 30 days' grace) bought the previous induction.
  const notBefore = cycle.start ? new Date(cycle.start.getTime() - 30 * 86_400_000) : null;
  const m = matchPayment({ request: { id: req.id, email: req.email, tid }, payment: pay ?? null, matchedEmail: matched?.email ?? null, othersWithTid: others?.n ?? 0, priceMinPkr: settings.priceMinPkr, notBefore });
  if (!m.approve || !pay) {
    await db.update(accessRequests).set({ autoResult: m.result }).where(eq(accessRequests.id, id));
    return m.result;
  }
  const done = await db.transaction(async (tx) => {
    const [claimed] = await tx.update(payments).set({ matchedRequestId: id })
      .where(and(eq(payments.id, pay.id), sql`(${payments.matchedRequestId} is null or ${payments.matchedRequestId} = ${id})`)).returning({ id: payments.id });
    if (!claimed) return null;
    const row = await approveTx(tx, id, "system", { note: `${AUTO_LABELS.matched.label} · PKR ${pay.amountPkr.toLocaleString("en-US")}`, autoResult: "matched", induction: cycle.induction, expiresAt: cycle.expiresAt });
    if (row) await writeAudit(tx, "system", { action: "access.auto_payment", entityType: "access_request", entityId: id, after: { email: row.email, channel: pay.channel, amountPkr: pay.amountPkr }, reason: "Transaction ID found in an imported statement" });
    return row;
  });
  if (done) await tellApproved(db, done.email, cycle.expiresAt);
  return done ? "matched" : "tid_reused";
}

/** The check for every waiting request (after an import, and by the worker). Returns how many were approved. */
export async function autoMatchPending(db: Database): Promise<number> {
  const settings = await loadAccessSettings(db);
  if (!settings.paywall) return 0;
  const [c, exp] = [await currentCycle(db), await expiryNow(db, settings)];
  const cycle = { induction: c.induction, start: c.start, expiresAt: exp.expiresAt };
  const waiting = await db.select({ id: accessRequests.id }).from(accessRequests).where(and(eq(accessRequests.status, "pending"), isNotNull(accessRequests.reference))).orderBy(accessRequests.createdAt).limit(500);
  let approved = 0;
  for (const w of waiting) if ((await checkOne(db, w.id, settings, cycle)) === "matched") approved++;
  return approved;
}

// ── Asking ───────────────────────────────────────────────────────────────────

export type AccessInput = { email: string; applicantId: string; channel?: string; amountPkr: number | null; reference: string; voucher?: string; message: string };
export type AccessOutcome = { status: "approved" | "pending"; autoResult: AutoResult | null; expiresAt: Date | null };

const hashCode = (code: string) => createHash("sha256").update(normalizeVoucher(code)).digest("hex");

/**
 * Ask for access (no sign-in needed). Everything is checked against the current settings.
 * A voucher, or a transaction ID already in an imported statement, lets the person in at once.
 */
export async function submitAccessRequest(db: Database, input: AccessInput): Promise<AccessOutcome> {
  const settings = await loadAccessSettings(db);
  if (!settings.paywall) throw new UserFacingError("Access is open. Sign in with an email link.");
  if (!settings.requestsOpen) throw new UserFacingError(settings.closedMessage);
  const data = accessRequestSchema(settings).parse({ ...input, channel: input.channel ?? null, voucher: input.voucher ?? "" });

  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(accessRequests).where(gt(accessRequests.createdAt, new Date(Date.now() - 3_600_000)));
  if (n >= 300) throw new UserFacingError("Many requests are coming in. Try again in a little while.");

  const [existing] = await db.select({ status: accessRequests.status, expiresAt: accessRequests.expiresAt }).from(accessRequests).where(eq(accessRequests.email, data.email)).limit(1);
  const live = existing?.status === "approved" && (!existing.expiresAt || existing.expiresAt > new Date());
  if (live) throw new UserFacingError("This email is already approved. Sign in with an email link.");
  if (existing?.status === "pending") throw new UserFacingError("A request for this email is already waiting. Check its status with your transaction ID, or wait for our email.");

  const exp = await expiryNow(db, settings);
  const row = {
    email: data.email, applicantId: data.applicantId, amountPkr: data.amountPkr, reference: data.voucher ? null : data.reference, message: data.message,
    channel: data.voucher ? "voucher" : data.channel, status: "pending", note: null, reviewedBy: null, reviewedAt: null, createdAt: new Date(),
    autoResult: null, induction: null, expiresAt: null, remindedAt: null,
  };

  if (data.voucher) {
    const codeHash = hashCode(data.voucher);
    const ok = await db.transaction(async (tx) => {
      const [v] = await tx.update(accessVouchers).set({ usedBy: data.email, usedAt: new Date() })
        .where(and(eq(accessVouchers.codeHash, codeHash), isNull(accessVouchers.usedAt), isNull(accessVouchers.revokedAt))).returning({ id: accessVouchers.id, hint: accessVouchers.hint });
      if (!v) return false;
      const [req] = await tx.insert(accessRequests).values(row).onConflictDoUpdate({ target: accessRequests.email, set: row }).returning({ id: accessRequests.id });
      await approveTx(tx, req!.id, "system", { note: `Voucher …${v.hint}`, autoResult: "voucher", induction: exp.induction, expiresAt: exp.expiresAt });
      await writeAudit(tx, "system", { action: "access.voucher", entityType: "access_request", entityId: req!.id, after: { email: data.email, voucher: v.id }, reason: "Voucher code" });
      return true;
    });
    if (!ok) throw new UserFacingError("That code is not valid, or it was already used.");
    await tellApproved(db, data.email, exp.expiresAt);
    return { status: "approved", autoResult: "voucher", expiresAt: exp.expiresAt };
  }

  const [req] = await db.insert(accessRequests).values(row).onConflictDoUpdate({ target: accessRequests.email, set: row }).returning({ id: accessRequests.id });
  const c = await currentCycle(db);
  const result = await checkOne(db, req!.id, settings, { induction: c.induction, start: c.start, expiresAt: exp.expiresAt });
  return result === "matched" ? { status: "approved", autoResult: result, expiresAt: exp.expiresAt } : { status: "pending", autoResult: result, expiresAt: null };
}

/**
 * Where a request stands, for the person who sent it. Needs the email and the transaction ID
 * (or voucher) together, so nobody can look up someone else's request by email alone.
 */
export async function accessStatus(db: Database, input: { email: string; reference: string }) {
  const email = normalizeEmail(input.email);
  const tid = normalizeTid(input.reference);
  if (!email || tid.length < 4) return null;
  const [r] = await db.select({ status: accessRequests.status, reference: accessRequests.reference, channel: accessRequests.channel, autoResult: accessRequests.autoResult, note: accessRequests.note, expiresAt: accessRequests.expiresAt, createdAt: accessRequests.createdAt })
    .from(accessRequests).where(eq(accessRequests.email, email)).limit(1);
  if (!r) return null;
  const voucherOk = r.channel === "voucher" && tid.startsWith("MN");
  if (!voucherOk && (!r.reference || normalizeTid(r.reference) !== tid)) return null;
  const expired = r.status === "approved" && r.expiresAt != null && r.expiresAt <= new Date();
  return {
    status: expired ? ("expired" as const) : (r.status as "pending" | "approved" | "rejected"),
    autoResult: (r.autoResult as AutoResult | null) ?? null,
    note: r.status === "rejected" ? r.note : null,
    expiresAt: r.expiresAt,
    createdAt: r.createdAt,
  };
}

// ── Staff ────────────────────────────────────────────────────────────────────

export async function listAccessRequests(db: Database, session: Session | null, opts: { status?: "pending" | "approved" | "rejected" } = {}) {
  assertCan(session, "candidates.verify");
  return db
    .select()
    .from(accessRequests)
    .where(opts.status ? eq(accessRequests.status, opts.status) : undefined)
    .orderBy(sql`case ${accessRequests.status} when 'pending' then 0 else 1 end`, desc(accessRequests.createdAt))
    .limit(300);
}

export async function pendingAccessCount(db: Database, session: Session | null) {
  assertCan(session, "candidates.verify");
  const [r] = await db.select({ n: count() }).from(accessRequests).where(eq(accessRequests.status, "pending"));
  return r?.n ?? 0;
}

/** Approve or reject a request. Rejection needs a note the person can be told. */
export async function reviewAccessRequest(db: Database, session: Session | null, input: { id: string; decision: "approve" | "reject"; note: string }) {
  assertCan(session, "candidates.verify");
  const note = input.note.trim();
  if (input.decision === "reject" && note.length < 3) throw new UserFacingError("Say why, in a few words, so it can be corrected.");
  const settings = await loadAccessSettings(db);
  const exp = input.decision === "approve" ? await expiryNow(db, settings) : { induction: null, expiresAt: null };
  const done = await db.transaction(async (tx) => {
    let row: { email: string; amountPkr: number | null; reference: string | null } | null | undefined;
    if (input.decision === "approve") {
      row = await approveTx(tx, input.id, session!.email, { note: note || null, ...exp });
      // A payment with this transaction ID counts as used from now on.
      if (row?.reference) await tx.update(payments).set({ matchedRequestId: input.id }).where(and(eq(payments.tid, normalizeTid(row.reference)), isNull(payments.matchedRequestId)));
    } else {
      [row] = await tx.update(accessRequests).set({ status: "rejected", note, reviewedBy: session!.email, reviewedAt: new Date() })
        .where(and(eq(accessRequests.id, input.id), eq(accessRequests.status, "pending")))
        .returning({ email: accessRequests.email, amountPkr: accessRequests.amountPkr, reference: accessRequests.reference });
    }
    if (!row) throw new UserFacingError("That request was already decided.");
    await writeAudit(tx, session!.email, { action: `access.${input.decision}`, entityType: "access_request", entityId: input.id, after: { email: row.email, amountPkr: row.amountPkr, reference: row.reference }, reason: note || "Payment checked" });
    return row;
  });
  if (input.decision === "approve") await tellApproved(db, done.email, exp.expiresAt);
  else await tellRejected(db, done.email, note);
  return { status: input.decision === "approve" ? "approved" : "rejected", email: done.email };
}

/** Approve (or reject) several waiting requests with one note. Skips any already decided. */
export async function bulkReviewAccess(db: Database, session: Session | null, input: { ids: string[]; decision: "approve" | "reject"; note: string }) {
  assertCan(session, "candidates.verify");
  if (!input.ids.length) throw new UserFacingError("Tick at least one request.");
  if (input.ids.length > 200) throw new UserFacingError("At most 200 at a time.");
  let done = 0;
  for (const id of input.ids) {
    try {
      await reviewAccessRequest(db, session, { id, decision: input.decision, note: input.note });
      done++;
    } catch (e) {
      if (!(e instanceof UserFacingError) || input.decision === "reject") throw e;
    }
  }
  return done;
}

/** Approve an email directly (someone who paid another way, or a friend of the project). */
export async function grantAccess(db: Database, session: Session | null, input: { email: string; note: string }) {
  assertCan(session, "candidates.verify");
  const email = normalizeEmail(input.email);
  if (!email) throw new UserFacingError("Enter a valid email address.");
  const note = input.note.trim() || "Granted by staff";
  const exp = await expiryNow(db, await loadAccessSettings(db));
  const row = { email, status: "approved", note, reviewedBy: session!.email, reviewedAt: new Date(), induction: exp.induction, expiresAt: exp.expiresAt, remindedAt: null };
  await db.transaction(async (tx) => {
    await tx.insert(accessRequests).values(row).onConflictDoUpdate({ target: accessRequests.email, set: row });
    await writeAudit(tx, session!.email, { action: "access.grant", entityType: "access_request", entityId: email, reason: note });
  });
  await tellApproved(db, email, exp.expiresAt);
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

// ── Payments ─────────────────────────────────────────────────────────────────

/**
 * Paste Easypaisa / JazzCash / bank SMS, or a statement CSV. Only TID, amount and time are
 * kept. Then every waiting request is checked against the payments.
 */
export async function importPayments(db: Database, session: Session | null, input: { text: string; channel: Channel }) {
  assertCan(session, "candidates.verify");
  if (input.text.length > 2_000_000) throw new UserFacingError("That is more than 2 MB of text. Split the statement.");
  const parsed = parseStatement(input.text, input.channel);
  if (!parsed.payments.length) throw new UserFacingError(`No received payments found${parsed.skipped ? ` (${parsed.skipped} part${parsed.skipped === 1 ? "" : "s"} could not be read)` : ""}. Paste the SMS as they are, or a CSV with a transaction ID and amount column.`);
  const added = await db.insert(payments)
    .values(parsed.payments.map((p) => ({ ...p, source: parsed.format, importedBy: session!.email })))
    .onConflictDoNothing({ target: payments.tid }).returning({ id: payments.id });
  await writeAudit(db, session!.email, { action: "payments.import", entityType: "payments", entityId: parsed.format, after: { found: parsed.payments.length, added: added.length, skipped: parsed.skipped }, reason: `${input.channel} ${parsed.format}` });
  const approved = await autoMatchPending(db);
  return { found: parsed.payments.length, added: added.length, already: parsed.payments.length - added.length, skipped: parsed.skipped, approved };
}

export async function listPayments(db: Database, session: Session | null) {
  assertCan(session, "candidates.verify");
  return db.select({ id: payments.id, channel: payments.channel, tid: payments.tid, amountPkr: payments.amountPkr, paidAt: payments.paidAt, importedAt: payments.importedAt, matchedEmail: accessRequests.email })
    .from(payments).leftJoin(accessRequests, eq(accessRequests.id, payments.matchedRequestId))
    .orderBy(sql`case when ${payments.matchedRequestId} is null then 0 else 1 end`, desc(payments.importedAt)).limit(300);
}

// ── Vouchers ─────────────────────────────────────────────────────────────────

/** Make single-use codes. The codes are returned once; only their hash is kept. */
export async function createVouchers(db: Database, session: Session | null, input: { count: number; note: string }) {
  assertCan(session, "candidates.verify");
  const n = Math.floor(input.count);
  if (!(n >= 1 && n <= 100)) throw new UserFacingError("Make between 1 and 100 codes at a time.");
  const note = input.note.trim();
  if (note.length < 3) throw new UserFacingError("Say what the codes are for, e.g. paid in cash at the desk.");
  const { induction } = await currentCycle(db);
  const codes = Array.from({ length: n }, () => voucherCode(randomBytes(8)));
  await db.transaction(async (tx) => {
    await tx.insert(accessVouchers).values(codes.map((c) => ({ codeHash: hashCode(c), hint: c.slice(-4), induction, note, createdBy: session!.email })));
    await writeAudit(tx, session!.email, { action: "access.vouchers", entityType: "access_voucher", entityId: String(n), after: { count: n, induction }, reason: note });
  });
  return codes;
}

export async function listVouchers(db: Database, session: Session | null) {
  assertCan(session, "candidates.verify");
  return db.select({ id: accessVouchers.id, hint: accessVouchers.hint, induction: accessVouchers.induction, note: accessVouchers.note, createdBy: accessVouchers.createdBy, createdAt: accessVouchers.createdAt, usedBy: accessVouchers.usedBy, usedAt: accessVouchers.usedAt, revokedAt: accessVouchers.revokedAt })
    .from(accessVouchers).orderBy(desc(accessVouchers.createdAt)).limit(300);
}

export async function revokeVoucher(db: Database, session: Session | null, input: { id: string }) {
  assertCan(session, "candidates.verify");
  const [v] = await db.update(accessVouchers).set({ revokedAt: new Date() }).where(and(eq(accessVouchers.id, input.id), isNull(accessVouchers.usedAt), isNull(accessVouchers.revokedAt))).returning({ hint: accessVouchers.hint });
  if (!v) throw new UserFacingError("That code was already used or cancelled.");
  await writeAudit(db, session!.email, { action: "access.voucher_revoke", entityType: "access_voucher", entityId: input.id, reason: `…${v.hint}` });
}

// ── Expiry ───────────────────────────────────────────────────────────────────

const REMIND_KEY = "access_reminders";

/**
 * Once a day (worker): give approvals without an end the running cycle's end, and email
 * people whose access ends within 7 days, once.
 */
export async function accessRemindersIfDue(db: Database, now = new Date()): Promise<number> {
  const [r] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, REMIND_KEY)).limit(1);
  const last = (r?.value as { lastRun?: string } | undefined)?.lastRun;
  if (last && now.getTime() - Date.parse(last) < 86_400_000) return 0;
  const value = { lastRun: now.toISOString() };
  await db.insert(appSettings).values({ key: REMIND_KEY, value, updatedBy: "worker" }).onConflictDoUpdate({ target: appSettings.key, set: { value, updatedBy: "worker", updatedAt: now } });

  const settings = await loadAccessSettings(db);
  if (!settings.paywall || !settings.perInduction) return 0;
  const exp = await expiryNow(db, settings);
  if (exp.expiresAt) {
    await db.update(accessRequests).set({ expiresAt: exp.expiresAt, induction: exp.induction })
      .where(and(eq(accessRequests.status, "approved"), isNull(accessRequests.expiresAt)));
  }
  const soon = await db.select({ id: accessRequests.id, email: accessRequests.email, expiresAt: accessRequests.expiresAt, remindedAt: accessRequests.remindedAt })
    .from(accessRequests).where(and(eq(accessRequests.status, "approved"), isNotNull(accessRequests.expiresAt), isNull(accessRequests.remindedAt), sql`${accessRequests.expiresAt} <= ${new Date(now.getTime() + 7 * 86_400_000)}`)).limit(1000);
  let sent = 0;
  for (const s of soon) {
    if (!dueForReminder(s.expiresAt, s.remindedAt, now)) continue;
    await sendMail(db, {
      to: s.email,
      subject: "Your meritNAMA access ends soon",
      text: [`Your access ends on ${dayText(s.expiresAt!)}, with this induction.`, "", `To keep it for the next induction, renew at ${appUrl("/access?renew=1")} with the same email. Your account, shortlist and follows stay as they are.`].join("\n"),
    }).catch(() => {});
    await notice(db, s.email, `Access ends ${dayText(s.expiresAt!)}: renew for the next induction`, "/access?renew=1");
    await db.update(accessRequests).set({ remindedAt: now }).where(eq(accessRequests.id, s.id));
    sent++;
  }
  return sent;
}

/** Counts for the Access tab and Needs you: waiting, of which near misses, and unmatched payments. */
export async function accessCounts(db: Database, session: Session | null) {
  assertCan(session, "candidates.verify");
  const [[p], [u]] = await Promise.all([
    db.select({ waiting: count(), nearMiss: sql<number>`count(*) filter (where ${accessRequests.autoResult} in ('amount_short', 'tid_reused', 'duplicate_tid', 'stale'))`.mapWith(Number) }).from(accessRequests).where(eq(accessRequests.status, "pending")),
    db.select({ n: count() }).from(payments).where(isNull(payments.matchedRequestId)),
  ]);
  return { waiting: p?.waiting ?? 0, nearMiss: p?.nearMiss ?? 0, unmatchedPayments: u?.n ?? 0 };
}

