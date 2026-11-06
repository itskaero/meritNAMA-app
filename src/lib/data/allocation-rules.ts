import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { assertCan, type Session } from "@/lib/auth/roles";
import type { Database } from "@/lib/db/client";
import { allocationRules, inductions, scoringPolicies } from "@/lib/db/schema";
import { policyInductions, policySchema, type Policy } from "@/lib/domain/scoring-policy";
import {
  allocationRulesSchema,
  DEFAULT_RULES,
  policyForInduction,
  resolveRules,
  RulesError,
  type AllocationRules,
  type ResolvedRules,
} from "@/lib/engine/rules";
import { UserFacingError } from "@/lib/errors";
import { requireReason, writeAudit, type Db, type Tx } from "./shared";

/**
 * Data-access boundary for allocation rules (how an induction's seats are
 * allocated). Versioned per induction like scoring policies: saving creates a new
 * draft, activation goes through preview → publish (src/lib/data/changes.ts), and an
 * induction with no active version uses DEFAULT_RULES. Every write is audited.
 */

const reasonFor = (reason: string) => requireReason(reason, "allocation-rule changes");
const label = (induction: number, version: number) => `induction ${induction} rules v${version}`;

export function parseInduction(v: unknown): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0 || n > 10_000) throw new UserFacingError("Enter an induction number");
  return n;
}

export async function listRulesVersions(db: Database, session: Session | null) {
  assertCan(session, "staff");
  return db
    .select({
      id: allocationRules.id,
      inductionId: allocationRules.inductionId,
      version: allocationRules.version,
      status: allocationRules.status,
      label: sql<string>`${allocationRules.definition}->>'label'`,
      createdBy: allocationRules.createdBy,
      createdAt: allocationRules.createdAt,
      activatedAt: allocationRules.activatedAt,
    })
    .from(allocationRules)
    .orderBy(desc(allocationRules.inductionId), desc(allocationRules.version));
}

export async function getRulesVersion(db: Database, session: Session | null, id: string) {
  assertCan(session, "staff");
  const [row] = await db.select().from(allocationRules).where(eq(allocationRules.id, id)).limit(1);
  return row ?? null;
}

/** Store a new draft version for an induction. */
export async function createRulesDraft(db: Database, session: Session | null, input: { induction: unknown; definition: unknown; reason: string }) {
  assertCan(session, "policy.edit");
  const induction = parseInduction(input.induction);
  allocationRulesSchema.parse(input.definition); // validation only; stored as written
  const definition = input.definition as AllocationRules;
  const reason = reasonFor(input.reason);
  return db.transaction(async (tx) => {
    const [latest] = await tx
      .select({ version: allocationRules.version })
      .from(allocationRules)
      .where(eq(allocationRules.inductionId, induction))
      .orderBy(desc(allocationRules.version))
      .limit(1);
    const version = (latest?.version ?? 0) + 1;
    const [row] = await tx
      .insert(allocationRules)
      .values({ inductionId: induction, version, definition, createdBy: session.email })
      .returning({ id: allocationRules.id, version: allocationRules.version });
    await writeAudit(tx, session.email, {
      action: "allocation_rules.create_draft",
      entityType: "allocation_rules",
      entityId: label(induction, version),
      after: definition,
      reason,
    });
    return { id: row!.id, induction, version: row!.version };
  });
}

async function activeRow(db: Db, induction: number) {
  const [row] = await db
    .select()
    .from(allocationRules)
    .where(and(eq(allocationRules.inductionId, induction), eq(allocationRules.status, "active")))
    .limit(1);
  return row ?? null;
}

/** Make a version its induction's active rules (the previous one is retired). Used when a staged change is published. */
export async function activateRulesVersion(db: Database, session: Session | null, input: { id: string; reason: string }) {
  assertCan(session, "policy.edit");
  const reason = reasonFor(input.reason);
  return db.transaction(async (tx: Tx) => {
    const [target] = await tx.select().from(allocationRules).where(eq(allocationRules.id, input.id)).limit(1);
    if (!target) throw new UserFacingError("Rules version not found");
    if (target.status === "active") return target;
    allocationRulesSchema.parse(target.definition);
    const previous = await activeRow(tx, target.inductionId);
    if (previous) await tx.update(allocationRules).set({ status: "retired" }).where(eq(allocationRules.id, previous.id));
    const [row] = await tx.update(allocationRules).set({ status: "active", activatedAt: new Date() }).where(eq(allocationRules.id, target.id)).returning();
    await writeAudit(tx, session.email, {
      action: "allocation_rules.activate",
      entityType: "allocation_rules",
      entityId: label(target.inductionId, target.version),
      before: { active: previous ? `v${previous.version}` : "default rules" },
      after: { active: `v${target.version}` },
      reason,
    });
    return row!;
  });
}

/** Retire an induction's active rules, so it falls back to the default rules. Used by rollback. */
export async function retireActiveRules(db: Database, session: Session | null, input: { induction: number; reason: string }) {
  assertCan(session, "policy.edit");
  const reason = reasonFor(input.reason);
  return db.transaction(async (tx: Tx) => {
    const active = await activeRow(tx, input.induction);
    if (!active) return;
    await tx.update(allocationRules).set({ status: "retired" }).where(eq(allocationRules.id, active.id));
    await writeAudit(tx, session.email, {
      action: "allocation_rules.retire",
      entityType: "allocation_rules",
      entityId: label(input.induction, active.version),
      before: { active: `v${active.version}` },
      after: { active: "default rules" },
      reason,
    });
  });
}

/** Fingerprint of an induction's rules state, for staged-change baselines. */
export async function rulesBaseline(db: Db, induction: number) {
  const active = await activeRow(db, induction);
  const [n] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(allocationRules).where(eq(allocationRules.inductionId, induction));
  return `rules:${induction}:${active?.id ?? "default"}:${n?.n ?? 0}`;
}

export type InductionRules = {
  induction: number;
  rules: AllocationRules;
  origin: { kind: "stored"; id: string; version: number } | { kind: "default" };
  policy: { policyKey: string; version: number; label: string; definition: Policy } | null;
  /** The rules the engines would run with, or why they cannot be resolved. */
  resolved: ResolvedRules | null;
  problem: string | null;
};

/** The scoring policy covering an induction (its key's active version, else newest). */
export async function scoringPolicyForInduction(db: Db, induction: number) {
  const rows = await db
    .select({ policyKey: scoringPolicies.policyKey, version: scoringPolicies.version, status: scoringPolicies.status, definition: scoringPolicies.definition })
    .from(scoringPolicies);
  const parsed = rows.flatMap((r) => {
    const p = policySchema.safeParse(r.definition);
    return p.success ? [{ ...r, definition: p.data }] : [];
  });
  const hit = policyForInduction(parsed, induction, policyInductions);
  return hit ? { policyKey: hit.policyKey, version: hit.version, label: hit.definition.label, definition: hit.definition } : null;
}

/** Resolve rules + policy, reporting a problem instead of throwing. */
export function resolveFor(rules: AllocationRules, policy: Policy | null): { resolved: ResolvedRules | null; problem: string | null } {
  try {
    return { resolved: resolveRules(rules, policy), problem: null };
  } catch (err) {
    if (err instanceof RulesError) return { resolved: null, problem: `${err.message}. Import a scoring policy that covers this induction, or switch the bonus on or off explicitly.` };
    throw err;
  }
}

/** What an induction's simulation runs with. Server-side callers only (no session check). */
export async function loadInductionRules(db: Db, induction: number): Promise<InductionRules> {
  const active = await activeRow(db, induction);
  const policy = await scoringPolicyForInduction(db, induction);
  const rules = active ? allocationRulesSchema.parse(active.definition) : DEFAULT_RULES;
  return {
    induction,
    rules,
    origin: active ? { kind: "stored", id: active.id, version: active.version } : { kind: "default" },
    policy,
    ...resolveFor(rules, policy?.definition ?? null),
  };
}

export async function rulesForInduction(db: Database, session: Session | null, induction: number) {
  assertCan(session, "staff");
  return loadInductionRules(db, induction);
}

/** Every induction the app knows of (imported, or with rules), with the rules it runs under. */
export async function rulesOverview(db: Database, session: Session | null) {
  assertCan(session, "staff");
  const known = await db.select({ id: inductions.id }).from(inductions);
  const withRules = await db.selectDistinct({ id: allocationRules.inductionId }).from(allocationRules);
  const ids = [...new Set([...known.map((r) => r.id), ...withRules.map((r) => r.id)])].sort((a, b) => b - a);
  return Promise.all(ids.map((n) => loadInductionRules(db, n)));
}
