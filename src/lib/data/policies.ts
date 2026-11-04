import "server-only";
import { desc, eq } from "drizzle-orm";
import { assertCan, type Session } from "@/lib/auth/roles";
import { UserFacingError } from "@/lib/errors";
import type { Database } from "@/lib/db/client";
import { scoringPolicies, scoringPolicyFileMeta } from "@/lib/db/schema";
import { requireReason, writeAudit, type Tx } from "./shared";
import {
  policyKeySchema,
  policySchema,
  scoringPolicyFileSchema,
  type Policy,
  type ScoringPolicyFile,
} from "@/lib/domain/scoring-policy";

/**
 * Data-access boundary for scoring policies. Every function takes the caller's
 * session and checks it here, on the server — UI visibility is never the guard.
 *
 * Round trip with the public scoring_policy.json:
 *   import: file-level fields → scoring_policy_file_meta, each policy → a new
 *           draft version, then the file's `active_policy` is activated.
 *   export: newest meta + per key the active version (else the newest) → file.
 * Definitions are stored as the validated input (not zod's output, which reorders
 * keys) in `json` columns, so an export is byte-for-byte the imported file.
 */

const reasonFor = (reason: string) => requireReason(reason, "policy changes");

export async function listPolicyVersions(db: Database, session: Session | null) {
  assertCan(session, "staff");
  return db
    .select({
      id: scoringPolicies.id,
      policyKey: scoringPolicies.policyKey,
      version: scoringPolicies.version,
      status: scoringPolicies.status,
      createdAt: scoringPolicies.createdAt,
      activatedAt: scoringPolicies.activatedAt,
    })
    .from(scoringPolicies)
    .orderBy(desc(scoringPolicies.policyKey), desc(scoringPolicies.version));
}

export async function getPolicyVersion(db: Database, session: Session | null, id: string) {
  assertCan(session, "staff");
  const [row] = await db.select().from(scoringPolicies).where(eq(scoringPolicies.id, id)).limit(1);
  return row ?? null;
}

async function insertDraft(tx: Tx, actorEmail: string, policyKey: string, definition: Policy, reason: string) {
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

  await writeAudit(tx, actorEmail, {
    action: "scoring_policy.create_draft",
    entityType: "scoring_policy",
    entityId: `${policyKey}@v${version}`,
    after: definition,
    reason,
  });
  return row!;
}

async function activate(tx: Tx, actorEmail: string, id: string, reason: string) {
  const [target] = await tx.select().from(scoringPolicies).where(eq(scoringPolicies.id, id)).limit(1);
  if (!target) throw new UserFacingError("Policy version not found");
  if (target.status === "active") return target;

  // Retire the current active version first: the partial unique index allows one active row.
  const [previous] = await tx
    .update(scoringPolicies)
    .set({ status: "retired" })
    .where(eq(scoringPolicies.status, "active"))
    .returning({ policyKey: scoringPolicies.policyKey, version: scoringPolicies.version });

  const [row] = await tx
    .update(scoringPolicies)
    .set({ status: "active", activatedAt: new Date() })
    .where(eq(scoringPolicies.id, id))
    .returning();

  await writeAudit(tx, actorEmail, {
    action: "scoring_policy.activate",
    entityType: "scoring_policy",
    entityId: `${target.policyKey}@v${target.version}`,
    before: previous ? { active: `${previous.policyKey}@v${previous.version}` } : null,
    after: { active: `${target.policyKey}@v${target.version}` },
    reason,
  });
  return row!;
}

/** Store a new draft version. */
export async function createPolicyDraft(
  db: Database,
  session: Session | null,
  input: { policyKey: string; definition: unknown; reason: string },
) {
  assertCan(session, "policy.edit");
  const policyKey = policyKeySchema.parse(input.policyKey);
  policySchema.parse(input.definition); // validation only; store the input as written
  const definition = input.definition as Policy;
  const reason = reasonFor(input.reason);
  return db.transaction((tx) => insertDraft(tx, session.email, policyKey, definition, reason));
}

/** Make one version the active policy; the previously active version is retired. */
export async function activatePolicyVersion(db: Database, session: Session | null, input: { id: string; reason: string }) {
  assertCan(session, "policy.edit");
  const reason = reasonFor(input.reason);
  return db.transaction((tx) => activate(tx, session.email, input.id, reason));
}

/**
 * Import a whole scoring_policy.json. All or nothing: the file is validated first
 * and everything is written in one transaction. Every policy becomes a new draft
 * version (existing versions are kept), and the file's active_policy is activated.
 */
export async function importScoringPolicyFile(db: Database, session: Session | null, input: { file: unknown; reason: string }) {
  assertCan(session, "policy.edit");
  // Validate, then keep the input as written: the schema adds nothing, and its output reorders keys.
  scoringPolicyFileSchema.parse(input.file);
  const file = input.file as ScoringPolicyFile;
  const reason = reasonFor(input.reason);
  const { policies, ...meta } = file;

  return db.transaction(async (tx) => {
    const created: { policyKey: string; id: string; version: number }[] = [];
    for (const [policyKey, definition] of Object.entries(policies)) {
      created.push({ policyKey, ...(await insertDraft(tx, session.email, policyKey, definition, reason)) });
    }
    await tx.insert(scoringPolicyFileMeta).values({ meta, createdBy: session.email });
    const active = created.find((c) => c.policyKey === file.active_policy)!;
    await activate(tx, session.email, active.id, reason);
    await writeAudit(tx, session.email, {
      action: "scoring_policy.import_file",
      entityType: "scoring_policy_file",
      entityId: "scoring_policy.json",
      after: { meta, versions: created.map((c) => `${c.policyKey}@v${c.version}`) },
      reason,
    });
    return { created, activePolicy: file.active_policy };
  });
}

export type PolicyFileExport =
  | { ok: true; file: ScoringPolicyFile }
  | { ok: false; reason: "no_meta" | "invalid"; issues: string[] };

/**
 * Rebuild scoring_policy.json from the database. The result is validated with the
 * same schema as an import, so an export can always be imported again.
 */
export async function exportScoringPolicyFile(db: Database, session: Session | null): Promise<PolicyFileExport> {
  assertCan(session, "staff");
  const [metaRow] = await db.select().from(scoringPolicyFileMeta).orderBy(desc(scoringPolicyFileMeta.id)).limit(1);
  if (!metaRow) return { ok: false, reason: "no_meta", issues: ["No scoring_policy.json has been imported yet."] };

  const rows = await db.select().from(scoringPolicies).orderBy(scoringPolicies.policyKey, desc(scoringPolicies.version));
  const policies: Record<string, unknown> = {};
  let activeKey: string | undefined;
  for (const r of rows) {
    if (r.status === "active") {
      policies[r.policyKey] = r.definition;
      activeKey = r.policyKey;
    } else if (!(r.policyKey in policies)) {
      policies[r.policyKey] = r.definition; // newest version, unless an active one replaces it
    }
  }

  const meta = metaRow.meta as Record<string, unknown>;
  const candidate = { ...meta, active_policy: activeKey ?? meta.active_policy, policies };
  const parsed = scoringPolicyFileSchema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, reason: "invalid", issues: parsed.error.issues.map((i) => `${i.path.join(".") || "(file)"}: ${i.message}`) };
  }
  return { ok: true, file: candidate as ScoringPolicyFile };
}
