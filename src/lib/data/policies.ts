import "server-only";
import { desc, eq } from "drizzle-orm";
import { assertRole, type Session } from "@/lib/auth/roles";
import type { Database } from "@/lib/db/client";
import { auditLog, scoringPolicies } from "@/lib/db/schema";
import { policyKeySchema, policySchema } from "@/lib/domain/scoring-policy";

/**
 * Data-access boundary for scoring policies. Every function takes the caller's
 * session and checks it here, on the server — UI visibility is never the guard.
 */

export async function listPolicyVersions(db: Database, session: Session | null) {
  assertRole(session, "admin");
  return db
    .select({
      id: scoringPolicies.id,
      policyKey: scoringPolicies.policyKey,
      version: scoringPolicies.version,
      status: scoringPolicies.status,
      createdAt: scoringPolicies.createdAt,
    })
    .from(scoringPolicies)
    .orderBy(desc(scoringPolicies.createdAt));
}

/** Store a new draft version. Activation is a separate, explicit step (delivery 3). */
export async function createPolicyDraft(
  db: Database,
  session: Session | null,
  input: { policyKey: string; definition: unknown; reason: string },
) {
  assertRole(session, "admin");
  const policyKey = policyKeySchema.parse(input.policyKey);
  const definition = policySchema.parse(input.definition);
  const reason = input.reason.trim();
  if (!reason) throw new Error("A reason is required for policy changes");

  return db.transaction(async (tx) => {
    const [latest] = await tx
      .select({ version: scoringPolicies.version })
      .from(scoringPolicies)
      .where(eq(scoringPolicies.policyKey, policyKey))
      .orderBy(desc(scoringPolicies.version))
      .limit(1);
    const version = (latest?.version ?? 0) + 1;

    const [row] = await tx
      .insert(scoringPolicies)
      .values({ policyKey, version, definition, status: "draft" })
      .returning({ id: scoringPolicies.id, version: scoringPolicies.version });

    await tx.insert(auditLog).values({
      actorEmail: session.email,
      action: "scoring_policy.create_draft",
      entityType: "scoring_policy",
      entityId: `${policyKey}@v${version}`,
      after: definition,
      reason,
      result: "success",
    });
    return row!;
  });
}
