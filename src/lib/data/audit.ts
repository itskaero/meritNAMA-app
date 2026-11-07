import "server-only";
import { and, desc, eq, ilike, notInArray, or, sql, type SQL } from "drizzle-orm";
import { assertCan, can, type Capability, type Session } from "@/lib/auth/roles";
import type { Database } from "@/lib/db/client";
import { auditLog } from "@/lib/db/schema";

/**
 * Audit history: who changed what, when and why. Read-only. Every staff member sees
 * it, except entry types that carry more personal detail than their role needs:
 * record verifications (applicant ids, reasons) for verifiers, user and role changes
 * for owners.
 */
const RESTRICTED: Record<string, Capability> = {
  candidate_link: "candidates.verify",
  user: "roles.manage",
};

export const AUDIT_PAGE = 50;

export type AuditFilters = { q?: string; type?: string; result?: "success" | "failure"; page?: number };

function visibleTypes(session: Session) {
  return Object.entries(RESTRICTED)
    .filter(([, cap]) => !can(session, cap))
    .map(([type]) => type);
}

export async function listAudit(db: Database, session: Session | null, f: AuditFilters = {}) {
  assertCan(session, "staff");
  const hidden = visibleTypes(session);
  const where: SQL[] = [];
  if (hidden.length) where.push(notInArray(auditLog.entityType, hidden));
  if (f.type) where.push(eq(auditLog.entityType, f.type));
  if (f.result) where.push(eq(auditLog.result, f.result));
  const q = f.q?.trim();
  if (q) {
    const like = `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    where.push(or(ilike(auditLog.actorEmail, like), ilike(auditLog.action, like), ilike(auditLog.entityId, like), ilike(auditLog.reason, like))!);
  }
  const page = Math.max(0, f.page ?? 0);
  const cond = where.length ? and(...where) : undefined;
  const rows = await db.select().from(auditLog).where(cond).orderBy(desc(auditLog.createdAt), desc(auditLog.id)).limit(AUDIT_PAGE).offset(page * AUDIT_PAGE);
  const [n] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(auditLog).where(cond);
  const types = await db
    .selectDistinct({ type: auditLog.entityType })
    .from(auditLog)
    .where(hidden.length ? notInArray(auditLog.entityType, hidden) : undefined)
    .orderBy(auditLog.entityType);
  return { rows, total: n?.n ?? 0, page, types: types.map((t) => t.type) };
}

