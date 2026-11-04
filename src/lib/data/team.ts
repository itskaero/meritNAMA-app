import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { assertCan, normalizeRole, ROLES, type Role, type Session } from "@/lib/auth/roles";
import type { Database } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { defaultDisplayName } from "@/lib/domain/community";
import { UserFacingError } from "@/lib/errors";
import { requireReason, writeAudit } from "./shared";

/**
 * The team: who has which role. Owners only. Roles are stored on users rows, so an
 * owner can give someone a role before they first sign in (by email).
 */

export async function listTeam(db: Database, session: Session | null) {
  assertCan(session, "roles.manage");
  const rows = await db
    .select({ id: users.id, email: users.email, role: users.role, displayName: users.displayName, createdAt: users.createdAt })
    .from(users)
    .where(sql`${users.role} <> 'candidate'`)
    .orderBy(asc(users.email));
  return rows.map((r) => ({ ...r, role: normalizeRole(r.role) ?? "candidate" }));
}

const inputSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  role: z.enum(ROLES),
  reason: z.string(),
});

/**
 * Set a person's role (creating their account row if needed). The last owner
 * cannot be demoted, so the team can never lock itself out.
 */
export async function setUserRole(db: Database, session: Session | null, input: { email: string; role: Role | string; reason: string }) {
  assertCan(session, "roles.manage");
  const v = inputSchema.parse(input);
  const reason = requireReason(v.reason, "role changes");
  return db.transaction(async (tx) => {
    const [prev] = await tx.select({ id: users.id, role: users.role }).from(users).where(eq(users.email, v.email)).limit(1);
    const before = prev ? normalizeRole(prev.role) : null;
    if (before === v.role) return { changed: false };
    if (before === "owner" && v.role !== "owner") {
      const [{ n }] = (await tx.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(users).where(sql`${users.role} in ('owner', 'admin')`)) as [{ n: number }];
      if (n <= 1) throw new UserFacingError("This is the last owner. Make someone else an owner first.");
    }
    if (prev) await tx.update(users).set({ role: v.role }).where(eq(users.id, prev.id));
    else await tx.insert(users).values({ email: v.email, role: v.role, displayName: defaultDisplayName(v.email) });
    await writeAudit(tx, session.email, {
      action: "user.set_role",
      entityType: "user",
      entityId: v.email,
      before: before ? { role: before } : null,
      after: { role: v.role },
      reason,
    });
    return { changed: true };
  });
}
