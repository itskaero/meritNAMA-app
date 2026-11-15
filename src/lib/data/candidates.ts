import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, asc, count, desc, eq, gt, inArray, ne, sql } from "drizzle-orm";
import { assertCan, can, type Session } from "@/lib/auth/roles";
import type { Database } from "@/lib/db/client";
import { accessRequests, auditLog, candidateIdentities, candidateLinks, meritAllocations, meritRounds, sessions, users } from "@/lib/db/schema";
import { sendMail } from "@/lib/mail";
import { identityHmac, normalizeCnic, normalizeEmail, normalizePmdc } from "@/lib/domain/identity";
import type { MeritRoundFile } from "@/lib/domain/merit-round";
import { env } from "@/lib/env";
import { UserFacingError } from "@/lib/errors";
import { requireReason, writeAudit, type Db } from "./shared";
import { ensureUser } from "./users";

/**
 * Candidate identities and account links.
 *
 * Merit-round and gazette files carry each applicant's email, PMDC number and CNIC. At
 * import only keyed HMACs of them are kept (candidate_identities), so the app can answer
 * "is this the applicant's email / CNIC?" without storing any of them. A signed-in account
 * whose email matches is linked automatically; otherwise the candidate types their
 * applicant ID and CNIC and is linked at once when it matches. A document for a verifier
 * is the fallback when the record has no CNIC.
 */

const DEV_SECRET = "development-only-candidate-index-secret-0000";
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

function indexSecret(): string {
  const { CANDIDATE_INDEX_SECRET, NODE_ENV } = env();
  if (CANDIDATE_INDEX_SECRET) return CANDIDATE_INDEX_SECRET;
  if (NODE_ENV === "production") throw new Error("CANDIDATE_INDEX_SECRET is not configured");
  return DEV_SECRET;
}

const emailHmac = (email: string) => identityHmac(indexSecret(), "email", email);
const pmdcHmac = (pmdc: string) => identityHmac(indexSecret(), "pmdc", pmdc);
const cnicHmac = (cnic: string) => identityHmac(indexSecret(), "cnic", cnic);

// ── Index (written at merit-round and gazette intake) ──────────────────────────

/**
 * Record the HMACs of each applicant's email, PMDC number and CNIC from a merit-round
 * file. Reads the raw fields once, in memory; nothing raw is written. Returns how many
 * applicants were indexed.
 */
export async function indexCandidates(db: Db, file: MeritRoundFile): Promise<number> {
  return indexIdentityRows(db, file.Table[0]!.inductionId, file.Table5 as unknown[]);
}

/**
 * The same for a gazette file ({ Table: [cycle], Table5: [applicants] }), which lists every
 * applicant of the induction with their CNIC (merit files only list people with a seat).
 */
export async function indexGazette(db: Db, file: unknown): Promise<number> {
  const f = file as { Table?: { inductionId?: unknown }[]; Table5?: unknown };
  const induction = f?.Table?.[0]?.inductionId;
  if (typeof induction !== "number" || !Number.isInteger(induction) || !Array.isArray(f.Table5)) return 0;
  return indexIdentityRows(db, induction, f.Table5);
}

async function indexIdentityRows(db: Db, induction: number, table: unknown[]): Promise<number> {
  const byApplicant = new Map<string, { applicantId: string; emailHmac: string | null; pmdcHmac: string | null; cnicHmac: string | null; lastInduction: number }>();
  for (const r of table) {
    const raw = (r ?? {}) as Record<string, unknown>;
    if (raw.applicantId == null) continue;
    const email = normalizeEmail(raw.emailId);
    const pmdc = normalizePmdc(raw.pmdcNo);
    const cnic = normalizeCnic(raw.cnic);
    if (!email && !pmdc && !cnic) continue;
    const applicantId = String(raw.applicantId);
    byApplicant.set(applicantId, {
      applicantId,
      emailHmac: email ? emailHmac(email) : null,
      pmdcHmac: pmdc ? pmdcHmac(pmdc) : null,
      cnicHmac: cnic ? cnicHmac(cnic) : null,
      lastInduction: induction,
    });
  }
  const rows = [...byApplicant.values()];
  for (let i = 0; i < rows.length; i += 1000) {
    await db
      .insert(candidateIdentities)
      .values(rows.slice(i, i + 1000))
      .onConflictDoUpdate({
        target: candidateIdentities.applicantId,
        // A newer induction's file wins; an older file only fills gaps.
        set: {
          emailHmac: sql`case when excluded.last_induction >= ${candidateIdentities.lastInduction} then coalesce(excluded.email_hmac, ${candidateIdentities.emailHmac}) else coalesce(${candidateIdentities.emailHmac}, excluded.email_hmac) end`,
          pmdcHmac: sql`case when excluded.last_induction >= ${candidateIdentities.lastInduction} then coalesce(excluded.pmdc_hmac, ${candidateIdentities.pmdcHmac}) else coalesce(${candidateIdentities.pmdcHmac}, excluded.pmdc_hmac) end`,
          cnicHmac: sql`case when excluded.last_induction >= ${candidateIdentities.lastInduction} then coalesce(excluded.cnic_hmac, ${candidateIdentities.cnicHmac}) else coalesce(${candidateIdentities.cnicHmac}, excluded.cnic_hmac) end`,
          lastInduction: sql`greatest(${candidateIdentities.lastInduction}, excluded.last_induction)`,
          updatedAt: sql`now()`,
        },
      });
  }
  return rows.length;
}

// ── Links ──────────────────────────────────────────────────────────────────────

export type LinkState =
  | { status: "none" }
  | { status: "pending" | "rejected"; applicantId: string; createdAt: Date; reason: string | null }
  | { status: "verified"; applicantId: string; method: "email" | "manual" | "cnic"; createdAt: Date };

async function linksFor(db: Db, userId: string) {
  return db.select().from(candidateLinks).where(eq(candidateLinks.userId, userId)).orderBy(desc(candidateLinks.createdAt)).limit(10);
}

function stateOf(links: (typeof candidateLinks.$inferSelect)[]): LinkState {
  const v = links.find((l) => l.status === "verified");
  if (v) return { status: "verified", applicantId: v.applicantId, method: v.method, createdAt: v.createdAt };
  const latest = links[0];
  if (!latest) return { status: "none" };
  return { status: latest.status as "pending" | "rejected", applicantId: latest.applicantId, createdAt: latest.createdAt, reason: latest.reason };
}

/** The signed-in person's link to an applicant record. */
export async function myLink(db: Db, session: Session | null): Promise<LinkState> {
  assertCan(session, "portal");
  const me = await ensureUser(db, session);
  return stateOf(await linksFor(db, me.id));
}

/** The verified applicant id of a user, or null. */
export async function verifiedApplicant(db: Db, userId: string): Promise<string | null> {
  const [l] = await db
    .select({ applicantId: candidateLinks.applicantId })
    .from(candidateLinks)
    .where(and(eq(candidateLinks.userId, userId), eq(candidateLinks.status, "verified")))
    .limit(1);
  return l?.applicantId ?? null;
}

/** Users (by id) among `ids` that have a verified link: for the "Verified" badge. */
export async function verifiedUserIds(db: Db, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await db
    .select({ id: candidateLinks.userId })
    .from(candidateLinks)
    .where(and(inArray(candidateLinks.userId, [...new Set(ids)]), eq(candidateLinks.status, "verified")));
  return new Set(rows.map((r) => r.id));
}

/**
 * After sign-in: link the account when its email matches exactly one applicant's
 * email in the official records, and that applicant is not linked to someone else.
 */
export async function autoLink(db: Database, user: { id: string; email: string }): Promise<string | null> {
  const email = normalizeEmail(user.email);
  if (!email) return null;
  return db.transaction(async (tx) => {
    if (await verifiedApplicant(tx, user.id)) return null;
    const matches = await tx
      .select({ applicantId: candidateIdentities.applicantId })
      .from(candidateIdentities)
      .where(eq(candidateIdentities.emailHmac, emailHmac(email)))
      .limit(2);
    if (matches.length !== 1) return null;
    const applicantId = matches[0]!.applicantId;
    const [taken] = await tx
      .select({ id: candidateLinks.id })
      .from(candidateLinks)
      .where(and(eq(candidateLinks.applicantId, applicantId), eq(candidateLinks.status, "verified")))
      .limit(1);
    if (taken) return null;
    // A pending manual request is superseded by the automatic match.
    await tx.delete(candidateLinks).where(and(eq(candidateLinks.userId, user.id), eq(candidateLinks.status, "pending")));
    await tx.insert(candidateLinks).values({ userId: user.id, applicantId, status: "verified", method: "email", reviewedBy: "system", reviewedAt: new Date() });
    await writeAudit(tx, user.email, { action: "candidate_link.auto", entityType: "candidate_link", entityId: applicantId, after: { method: "email" }, reason: "Sign-in email matches the official record" });
    return applicantId;
  });
}

// ── CNIC check ─────────────────────────────────────────────────────────────────

/** Wrong CNICs allowed per applicant record, and per person or address, in a day. */
export const CNIC_TRIES = { perApplicant: 5, perActor: 10, windowMs: 24 * 60 * 60_000 } as const;
const MISS = "candidate_link.cnic_miss";

function cleanApplicantId(v: string) {
  const id = v.trim();
  if (!/^[A-Za-z0-9-]{1,32}$/.test(id)) throw new UserFacingError("Enter your applicant ID as it appears on the merit list.");
  return id;
}

/**
 * Does this CNIC belong to this applicant record? Counts wrong answers (in the audit log,
 * by record and by actor) and stops after CNIC_TRIES in a day, so a CNIC cannot be guessed.
 */
async function checkCnic(db: Database, input: { applicantId: string; cnic: string; actor: string }) {
  const cnic = normalizeCnic(input.cnic);
  if (!cnic) throw new UserFacingError("Enter your CNIC: 13 digits, with or without dashes.");
  const since = new Date(Date.now() - CNIC_TRIES.windowMs);
  const misses = (where: ReturnType<typeof eq>) => db.select({ n: count() }).from(auditLog).where(and(eq(auditLog.action, MISS), gt(auditLog.createdAt, since), where));
  const [[byRecord], [byActor]] = await Promise.all([misses(eq(auditLog.entityId, input.applicantId)), misses(eq(auditLog.actorEmail, input.actor))]);
  if ((byRecord?.n ?? 0) >= CNIC_TRIES.perApplicant || (byActor?.n ?? 0) >= CNIC_TRIES.perActor) {
    throw new UserFacingError("Too many wrong tries today. Try again tomorrow, or send a document for a verifier instead.");
  }
  const [identity] = await db.select({ cnic: candidateIdentities.cnicHmac }).from(candidateIdentities).where(eq(candidateIdentities.applicantId, input.applicantId)).limit(1);
  if (!identity?.cnic) {
    const [seen] = await db.select({ n: count() }).from(meritAllocations).where(eq(meritAllocations.applicantId, input.applicantId));
    throw new UserFacingError(seen?.n || identity
      ? "We have no CNIC for that record in PHF's files. Send a document for a verifier instead."
      : "That applicant ID is not in any merit list or gazette imported so far.");
  }
  if (identity.cnic !== cnicHmac(cnic)) {
    await writeAudit(db, input.actor, { action: MISS, entityType: "candidate_link", entityId: input.applicantId, reason: "CNIC did not match the record" });
    throw new UserFacingError("That CNIC does not match the record for this applicant ID. Check both and try again.");
  }
}

/** Take a verified link away from its old account (the record moves to a new one) and tell that account. */
async function releaseLink(tx: Tx, applicantId: string, toUserId: string, actor: string) {
  const [old] = await tx.update(candidateLinks)
    .set({ status: "rejected", reason: "Moved to another account after a CNIC check", reviewedBy: "system", reviewedAt: new Date() })
    .where(and(eq(candidateLinks.applicantId, applicantId), eq(candidateLinks.status, "verified"), ne(candidateLinks.userId, toUserId)))
    .returning({ userId: candidateLinks.userId });
  if (!old) return null;
  const [u] = await tx.select({ email: users.email }).from(users).where(eq(users.id, old.userId)).limit(1);
  await writeAudit(tx, actor, { action: "candidate_link.move", entityType: "candidate_link", entityId: applicantId, after: { method: "cnic" }, reason: "CNIC matched; record moved from another account" });
  return u?.email ?? null;
}

const tellMoved = (db: Db, email: string | null) => email
  ? sendMail(db, {
      to: email,
      subject: "Your meritNAMA record moved to another account",
      text: [
        "Someone who entered your applicant ID and CNIC linked your merit record to a different meritNAMA account.",
        "",
        "If that was you, nothing else to do. If it was not, reply to this email so we can put it back.",
      ].join("\n"),
    }).catch(() => {})
  : Promise.resolve();

/**
 * Link the signed-in account by applicant ID and CNIC: verified at once, no document. If
 * the record was linked to another account (an email the person lost), it moves here and
 * the old account is told.
 */
export async function linkByCnic(db: Database, session: Session | null, input: { applicantId: string; cnic: string }) {
  assertCan(session, "portal");
  const applicantId = cleanApplicantId(input.applicantId);
  const me = await ensureUser(db, session);
  if (await verifiedApplicant(db, me.id)) throw new UserFacingError("Your account is already linked.");
  await checkCnic(db, { applicantId, cnic: input.cnic, actor: session.email });
  const moved = await db.transaction(async (tx) => {
    const from = await releaseLink(tx, applicantId, me.id, session.email);
    await tx.delete(candidateLinks).where(and(eq(candidateLinks.userId, me.id), eq(candidateLinks.status, "pending")));
    await tx.insert(candidateLinks).values({ userId: me.id, applicantId, status: "verified", method: "cnic", reviewedBy: "system", reviewedAt: new Date() });
    await writeAudit(tx, session.email, { action: "candidate_link.cnic", entityType: "candidate_link", entityId: applicantId, after: { method: "cnic", moved: Boolean(from) }, reason: "CNIC matches the official record" });
    return from;
  });
  await tellMoved(db, moved);
  return { applicantId, moved: Boolean(moved) };
}

export type RecoverOutcome = { movedAccount: boolean; movedAccess: boolean };

/**
 * Lost email, signed out: applicant ID + CNIC prove who it is, and the account (or, when
 * there is none, the paid access) moves to a new email. The person then signs in with it.
 * Moving paid access also needs the transaction ID it was paid with, when there was one.
 */
export async function recoverAccount(db: Database, input: { applicantId: string; cnic: string; newEmail: string; reference?: string; ip?: string | null }): Promise<RecoverOutcome> {
  const applicantId = cleanApplicantId(input.applicantId);
  const newEmail = normalizeEmail(input.newEmail);
  if (!newEmail) throw new UserFacingError("Enter the new email address you can reach.");
  const actor = input.ip ? `ip:${createHash("sha256").update(input.ip).digest("hex").slice(0, 16)}` : "recovery";
  await checkCnic(db, { applicantId, cnic: input.cnic, actor });

  const [link] = await db.select({ userId: candidateLinks.userId, email: users.email }).from(candidateLinks)
    .innerJoin(users, eq(users.id, candidateLinks.userId))
    .where(and(eq(candidateLinks.applicantId, applicantId), eq(candidateLinks.status, "verified"))).limit(1);
  const oldEmail = link?.email ?? null;
  if (oldEmail === newEmail) throw new UserFacingError("That is already the email on this account. Sign in with it.");
  const [access] = await db.select({ id: accessRequests.id, email: accessRequests.email, reference: accessRequests.reference, channel: accessRequests.channel }).from(accessRequests)
    .where(and(eq(accessRequests.status, "approved"), oldEmail ? sql`(${accessRequests.email} = ${oldEmail} or ${accessRequests.applicantId} = ${applicantId})` : eq(accessRequests.applicantId, applicantId)))
    .orderBy(desc(accessRequests.reviewedAt)).limit(1);
  if (access?.reference && access.channel !== "voucher") {
    const tid = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!input.reference || tid(input.reference) !== tid(access.reference)) throw new UserFacingError("Enter the transaction ID you paid for access with, to move it to the new email.");
  }
  if (!link && !access) throw new UserFacingError("Nothing to move: no account is linked to this record yet. Sign in with the new email and link your record from Me.");

  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, newEmail)).limit(1);
  if (link && taken && (await verifiedApplicant(db, taken.id))) throw new UserFacingError("The account with that new email is already linked to another record. Use a different email.");
  const out = await db.transaction(async (tx) => {
    let movedAccount = false;
    if (link && !taken) {
      // The whole account (shortlist, saved views, posts) takes the new email; old sessions end.
      await tx.update(users).set({ email: newEmail }).where(eq(users.id, link.userId));
      await tx.delete(sessions).where(eq(sessions.userId, link.userId));
      movedAccount = true;
    } else if (link && taken) {
      // The new email already has an account: the record moves to it.
      await releaseLink(tx, applicantId, taken.id, actor);
      await tx.delete(candidateLinks).where(and(eq(candidateLinks.userId, taken.id), eq(candidateLinks.status, "pending")));
      if (!(await verifiedApplicant(tx, taken.id))) await tx.insert(candidateLinks).values({ userId: taken.id, applicantId, status: "verified", method: "cnic", reviewedBy: "system", reviewedAt: new Date() });
      movedAccount = true;
    }
    let movedAccess = false;
    if (access) {
      await tx.delete(accessRequests).where(and(eq(accessRequests.email, newEmail), ne(accessRequests.id, access.id)));
      await tx.update(accessRequests).set({ email: newEmail }).where(eq(accessRequests.id, access.id));
      movedAccess = true;
    }
    await writeAudit(tx, actor, { action: "account.recover", entityType: "candidate_link", entityId: applicantId, after: { movedAccount, movedAccess, intoExisting: Boolean(taken) }, reason: "Lost email: CNIC matched the record" });
    return { movedAccount, movedAccess };
  });
  await tellMoved(db, oldEmail);
  await sendMail(db, {
    to: newEmail,
    subject: "Your meritNAMA account now uses this email",
    text: ["Your applicant ID and CNIC matched, so your meritNAMA account now uses this email address.", "", `Sign in here: ${env().APP_URL.replace(/\/$/, "")}/sign-in`].join("\n"),
  }).catch(() => {});
  return out;
}

// ── Manual requests ────────────────────────────────────────────────────────────

const EVIDENCE_TYPES = [
  { type: "application/pdf", ext: "pdf", magic: [0x25, 0x50, 0x44, 0x46] },
  { type: "image/png", ext: "png", magic: [0x89, 0x50, 0x4e, 0x47] },
  { type: "image/jpeg", ext: "jpg", magic: [0xff, 0xd8, 0xff] },
] as const;
export const EVIDENCE_MAX_BYTES = 5 * 1024 * 1024;

const evidenceDir = (root?: string) => path.resolve(/* turbopackIgnore: true */ root ?? env().APP_STORAGE_DIR, "evidence");

/** The document type from its first bytes; the browser's claimed type is not trusted. */
export function sniffEvidence(bytes: Uint8Array) {
  return EVIDENCE_TYPES.find((t) => t.magic.every((b, i) => bytes[i] === b)) ?? null;
}

/** A candidate asks to be linked to an applicant record. */
export async function requestLink(
  db: Database,
  session: Session | null,
  input: { applicantId: string; pmdcNo: string; evidence: Uint8Array },
  opts: { root?: string } = {},
) {
  assertCan(session, "portal");
  const applicantId = input.applicantId.trim();
  if (!/^[A-Za-z0-9-]{1,32}$/.test(applicantId)) throw new UserFacingError("Enter your applicant ID as it appears on the merit list.");
  const pmdc = normalizePmdc(input.pmdcNo);
  if (!pmdc) throw new UserFacingError("Enter your PMDC registration number.");
  if (input.evidence.byteLength === 0) throw new UserFacingError("Attach a document that shows your applicant ID (PDF, JPG or PNG).");
  if (input.evidence.byteLength > EVIDENCE_MAX_BYTES) throw new UserFacingError("The document is larger than 5 MB.");
  const kind = sniffEvidence(input.evidence);
  if (!kind) throw new UserFacingError("The document must be a PDF, JPG or PNG file.");

  const me = await ensureUser(db, session);
  const state = stateOf(await linksFor(db, me.id));
  if (state.status === "verified") throw new UserFacingError("Your account is already verified.");
  if (state.status === "pending") throw new UserFacingError("You already have a request waiting for review.");
  const [seen] = await db.select({ n: count() }).from(meritAllocations).where(eq(meritAllocations.applicantId, applicantId));
  if (!seen?.n) throw new UserFacingError("That applicant ID is not in any merit list imported so far.");
  const [taken] = await db.select({ id: candidateLinks.id }).from(candidateLinks)
    .where(and(eq(candidateLinks.applicantId, applicantId), eq(candidateLinks.status, "verified"))).limit(1);
  if (taken) throw new UserFacingError("That applicant record is already linked to an account. Contact the team if this is wrong.");
  const [identity] = await db.select({ pmdc: candidateIdentities.pmdcHmac }).from(candidateIdentities).where(eq(candidateIdentities.applicantId, applicantId)).limit(1);
  const pmdcMatches = identity?.pmdc ? identity.pmdc === pmdcHmac(pmdc) : null;

  const dir = evidenceDir(opts.root);
  await mkdir(dir, { recursive: true });
  const fileName = `${randomUUID()}.${kind.ext}`;
  await writeFile(path.join(/* turbopackIgnore: true */ dir, fileName), input.evidence, { flag: "wx", mode: 0o600 });

  await db.transaction(async (tx) => {
    await tx.insert(candidateLinks).values({ userId: me.id, applicantId, status: "pending", method: "manual", evidenceFile: fileName, evidenceType: kind.type, pmdcMatches });
    await writeAudit(tx, session.email, { action: "candidate_link.request", entityType: "candidate_link", entityId: applicantId, after: { pmdcMatches }, reason: "Candidate asked to link their record" });
  });
}

// ── Verifier queue ─────────────────────────────────────────────────────────────

export async function pendingLinkCount(db: Db) {
  const [r] = await db.select({ n: count() }).from(candidateLinks).where(eq(candidateLinks.status, "pending"));
  return r?.n ?? 0;
}

/** Requests waiting for a verifier, each with the applicant's rounds (aggregates). */
export async function listLinkRequests(db: Database, session: Session | null) {
  assertCan(session, "candidates.verify");
  const pending = await db
    .select({ id: candidateLinks.id, applicantId: candidateLinks.applicantId, email: users.email, pmdcMatches: candidateLinks.pmdcMatches, evidenceType: candidateLinks.evidenceType, createdAt: candidateLinks.createdAt })
    .from(candidateLinks)
    .innerJoin(users, eq(users.id, candidateLinks.userId))
    .where(eq(candidateLinks.status, "pending"))
    .orderBy(asc(candidateLinks.createdAt))
    .limit(100);
  const ids = [...new Set(pending.map((p) => p.applicantId))];
  const rounds = ids.length
    ? await db
        .select({ applicantId: meritAllocations.applicantId, induction: meritRounds.inductionId, roundNo: meritRounds.roundNo, program: meritAllocations.program, quota: meritAllocations.quota, speciality: meritAllocations.speciality, marks: meritAllocations.marks })
        .from(meritAllocations)
        .innerJoin(meritRounds, eq(meritRounds.id, meritAllocations.roundId))
        .where(inArray(meritAllocations.applicantId, ids))
        .orderBy(desc(meritRounds.inductionId), desc(meritRounds.roundNo))
    : [];
  const recent = await db
    .select({ id: candidateLinks.id, applicantId: candidateLinks.applicantId, email: users.email, status: candidateLinks.status, method: candidateLinks.method, reviewedBy: candidateLinks.reviewedBy, reviewedAt: candidateLinks.reviewedAt, reason: candidateLinks.reason })
    .from(candidateLinks)
    .innerJoin(users, eq(users.id, candidateLinks.userId))
    .where(sql`${candidateLinks.status} <> 'pending'`)
    .orderBy(desc(candidateLinks.reviewedAt))
    .limit(20);
  return {
    pending: pending.map((p) => ({ ...p, rounds: rounds.filter((r) => r.applicantId === p.applicantId).slice(0, 6) })),
    recent,
  };
}

export async function reviewLink(db: Database, session: Session | null, input: { id: string; decision: "approve" | "reject"; reason: string }) {
  assertCan(session, "candidates.verify");
  const reason = requireReason(input.reason, "decisions");
  return db.transaction(async (tx) => {
    const [link] = await tx.select().from(candidateLinks).where(eq(candidateLinks.id, input.id)).for("update").limit(1);
    if (!link || link.status !== "pending") throw new UserFacingError("That request has already been decided.");
    if (input.decision === "approve") {
      const [taken] = await tx.select({ id: candidateLinks.id }).from(candidateLinks)
        .where(and(eq(candidateLinks.applicantId, link.applicantId), eq(candidateLinks.status, "verified"))).limit(1);
      if (taken) throw new UserFacingError("That applicant record is already linked to another account.");
    }
    const status = input.decision === "approve" ? "verified" : "rejected";
    await tx.update(candidateLinks).set({ status, reviewedBy: session.email, reviewedAt: new Date(), reason }).where(eq(candidateLinks.id, link.id));
    await writeAudit(tx, session.email, { action: `candidate_link.${input.decision}`, entityType: "candidate_link", entityId: link.applicantId, before: { status: "pending" }, after: { status }, reason });
    return status;
  });
}

/** The evidence document of a request, for verifiers only. */
export async function readEvidence(db: Database, session: Session | null, id: string, opts: { root?: string } = {}) {
  assertCan(session, "candidates.verify");
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new UserFacingError("Unknown request.");
  const [link] = await db.select({ file: candidateLinks.evidenceFile, type: candidateLinks.evidenceType }).from(candidateLinks).where(eq(candidateLinks.id, id)).limit(1);
  if (!link?.file || !link.type || path.basename(link.file) !== link.file) throw new UserFacingError("This request has no document.");
  return { bytes: await readFile(path.join(/* turbopackIgnore: true */ evidenceDir(opts.root), link.file)), type: link.type };
}

// ── What verification unlocks ──────────────────────────────────────────────────

export type MyAllocation = {
  induction: number;
  roundNo: number;
  program: string;
  quota: string;
  speciality: string;
  hospital: string;
  marks: number;
  preferenceNo: number;
  consent: string;
  /** Lowest marks allocated to the same programme, quota, speciality and hospital in that round. */
  closing: number | null;
};

/**
 * The signed-in person's own allocations, only when their account is verified.
 * Nobody else's rows are ever returned.
 */
export async function myMerit(db: Database, session: Session | null): Promise<{ applicantId: string; rows: MyAllocation[] } | null> {
  assertCan(session, "portal");
  const me = await ensureUser(db, session);
  const applicantId = await verifiedApplicant(db, me.id);
  if (!applicantId) return null;
  const rows = await db
    .select({
      roundId: meritAllocations.roundId, induction: meritRounds.inductionId, roundNo: meritRounds.roundNo, program: meritAllocations.program, quota: meritAllocations.quota,
      speciality: meritAllocations.speciality, hospital: meritAllocations.hospital, marks: meritAllocations.marks, preferenceNo: meritAllocations.preferenceNo, consent: meritAllocations.consent,
    })
    .from(meritAllocations)
    .innerJoin(meritRounds, eq(meritRounds.id, meritAllocations.roundId))
    .where(eq(meritAllocations.applicantId, applicantId))
    .orderBy(desc(meritRounds.inductionId), desc(meritRounds.roundNo));
  const closings = rows.length
    ? await db
        .select({ roundId: meritAllocations.roundId, program: meritAllocations.program, quota: meritAllocations.quota, speciality: meritAllocations.speciality, hospital: meritAllocations.hospital, closing: sql<number>`min(${meritAllocations.marks})`.mapWith(Number) })
        .from(meritAllocations)
        .where(inArray(meritAllocations.roundId, [...new Set(rows.map((r) => r.roundId))]))
        .groupBy(meritAllocations.roundId, meritAllocations.program, meritAllocations.quota, meritAllocations.speciality, meritAllocations.hospital)
    : [];
  const key = (r: { roundId: number; program: string; quota: string; speciality: string; hospital: string }) => `${r.roundId}|${r.program}|${r.quota}|${r.speciality}|${r.hospital}`;
  const closing = new Map(closings.map((c) => [key(c), c.closing]));
  return { applicantId, rows: rows.map(({ roundId, ...r }) => ({ ...r, closing: closing.get(key({ roundId, ...r })) ?? null })) };
}

/** Community posting: staff, or a candidate with a verified record. */
export async function mayPost(db: Db, session: Session | null): Promise<boolean> {
  if (!can(session, "portal")) return false;
  if (can(session, "staff")) return true;
  const me = await ensureUser(db, session);
  return Boolean(await verifiedApplicant(db, me.id));
}
