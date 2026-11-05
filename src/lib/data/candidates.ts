import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { assertCan, can, type Session } from "@/lib/auth/roles";
import type { Database } from "@/lib/db/client";
import { candidateIdentities, candidateLinks, meritAllocations, meritRounds, users } from "@/lib/db/schema";
import { identityHmac, normalizeEmail, normalizePmdc } from "@/lib/domain/identity";
import type { MeritRoundFile } from "@/lib/domain/merit-round";
import { env } from "@/lib/env";
import { UserFacingError } from "@/lib/errors";
import { requireReason, writeAudit, type Db } from "./shared";
import { ensureUser } from "./users";

/**
 * Candidate identities and account links.
 *
 * Merit-round files carry each applicant's email and PMDC number. At import only
 * keyed HMACs of them are kept (candidate_identities), so the app can answer "is
 * this the applicant's email?" without storing either value. A signed-in account
 * whose email matches is linked automatically; otherwise the candidate asks with
 * their applicant ID, PMDC number and a document, and a verifier decides.
 */

const DEV_SECRET = "development-only-candidate-index-secret-0000";

function indexSecret(): string {
  const { CANDIDATE_INDEX_SECRET, NODE_ENV } = env();
  if (CANDIDATE_INDEX_SECRET) return CANDIDATE_INDEX_SECRET;
  if (NODE_ENV === "production") throw new Error("CANDIDATE_INDEX_SECRET is not configured");
  return DEV_SECRET;
}

const emailHmac = (email: string) => identityHmac(indexSecret(), "email", email);
const pmdcHmac = (pmdc: string) => identityHmac(indexSecret(), "pmdc", pmdc);

// ── Index (written at merit-round intake) ──────────────────────────────────────

/**
 * Record the HMACs of each applicant's email and PMDC number from a round file.
 * Reads the raw fields once, in memory; nothing raw is written. Returns how many
 * applicants were indexed.
 */
export async function indexCandidates(db: Db, file: MeritRoundFile): Promise<number> {
  const induction = file.Table[0]!.inductionId;
  const byApplicant = new Map<string, { applicantId: string; emailHmac: string | null; pmdcHmac: string | null; lastInduction: number }>();
  for (const r of file.Table5) {
    const raw = r as Record<string, unknown>;
    const email = normalizeEmail(raw.emailId);
    const pmdc = normalizePmdc(raw.pmdcNo);
    if (!email && !pmdc) continue;
    byApplicant.set(r.applicantId, {
      applicantId: r.applicantId,
      emailHmac: email ? emailHmac(email) : null,
      pmdcHmac: pmdc ? pmdcHmac(pmdc) : null,
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
  | { status: "verified"; applicantId: string; method: "email" | "manual"; createdAt: Date };

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

// ── Manual requests ────────────────────────────────────────────────────────────

const EVIDENCE_TYPES = [
  { type: "application/pdf", ext: "pdf", magic: [0x25, 0x50, 0x44, 0x46] },
  { type: "image/png", ext: "png", magic: [0x89, 0x50, 0x4e, 0x47] },
  { type: "image/jpeg", ext: "jpg", magic: [0xff, 0xd8, 0xff] },
] as const;
export const EVIDENCE_MAX_BYTES = 5 * 1024 * 1024;

const evidenceDir = (root?: string) => path.resolve(root ?? env().APP_STORAGE_DIR, "evidence");

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
  await writeFile(path.join(dir, fileName), input.evidence, { flag: "wx", mode: 0o600 });

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
  return { bytes: await readFile(path.join(evidenceDir(opts.root), link.file)), type: link.type };
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
