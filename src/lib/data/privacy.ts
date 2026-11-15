import "server-only";
import { eq } from "drizzle-orm";
import { assertCan, isStaff, type Session } from "@/lib/auth/roles";
import { candidatePrivacy } from "@/lib/db/schema";
import { UserFacingError } from "@/lib/errors";
import { verifiedApplicant } from "./candidates";
import { writeAudit, type Db } from "./shared";
import { ensureUser } from "./users";

/**
 * What a linked candidate keeps to themselves: their record notes (PHF's verification remarks
 * and any corrections). What PHF publishes (name, PMDC number, marks, seats on the gazette and
 * merit lists), preferences and estimates always show. Staff, and the candidate, see everything.
 */

export type Privacy = { hideRecord: boolean };
export const OPEN: Privacy = { hideRecord: false };

/** The rules for one viewer: what to hide of each applicant id. */
export type Mask = (applicantId: string) => Privacy;

export async function privacyMask(db: Db, session: Session | null): Promise<Mask> {
  if (!session || isStaff(session)) return () => OPEN;
  const rows = await db.select().from(candidatePrivacy).where(eq(candidatePrivacy.hideRecord, true));
  if (!rows.length) return () => OPEN;
  const me = await verifiedApplicant(db, (await ensureUser(db, session)).id);
  const by = new Map(rows.map((r) => [r.applicantId, { hideRecord: r.hideRecord }]));
  return (id) => (id === me ? OPEN : by.get(id) ?? OPEN);
}

/** The signed-in candidate's own switches (all off until they change one). Null when not linked. */
export async function myPrivacy(db: Db, session: Session | null): Promise<Privacy | null> {
  assertCan(session, "portal");
  const me = await verifiedApplicant(db, (await ensureUser(db, session)).id);
  if (!me) return null;
  const [r] = await db.select().from(candidatePrivacy).where(eq(candidatePrivacy.applicantId, me)).limit(1);
  return r ? { hideRecord: r.hideRecord } : OPEN;
}

export async function setMyPrivacy(db: Db, session: Session | null, next: Privacy) {
  assertCan(session, "portal");
  const me = await verifiedApplicant(db, (await ensureUser(db, session)).id);
  if (!me) throw new UserFacingError("Link your merit record first: these switches are about your own record.");
  const v = { hideRecord: Boolean(next.hideRecord) };
  await db.insert(candidatePrivacy).values({ applicantId: me, ...v, updatedAt: new Date() })
    .onConflictDoUpdate({ target: candidatePrivacy.applicantId, set: { ...v, updatedAt: new Date() } });
  await writeAudit(db, session.email, { action: "candidate.privacy", entityType: "candidate_privacy", entityId: me, after: v, reason: "Candidate changed what others see" });
}
