import "server-only";
import type { Database } from "@/lib/db/client";
import { auditLog } from "@/lib/db/schema";
import { UserFacingError } from "@/lib/errors";

/** Helpers shared by every data-access module under src/lib/data. */

export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type Db = Database | Tx;

/** Every change needs a reason for the audit log. Returns it trimmed. */
export function requireReason(reason: string, what = "changes"): string {
  const r = reason.trim();
  if (!r) throw new UserFacingError(`A reason is required for ${what}`);
  return r;
}

export type AuditEntry = {
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  reason: string;
};

/** Record a successful change. Call inside the same transaction as the change. */
export async function writeAudit(db: Db, actorEmail: string, entry: AuditEntry) {
  await db.insert(auditLog).values({
    actorEmail,
    result: "success",
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    before: entry.before ?? null,
    after: entry.after ?? null,
    reason: entry.reason,
  });
}
