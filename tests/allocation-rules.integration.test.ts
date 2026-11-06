import { readFileSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, like } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "@/lib/auth/roles";
import { createRulesDraft, loadInductionRules, rulesOverview } from "@/lib/data/allocation-rules";
import { getChange, proposeRulesActivation, publishChange, rollbackChange } from "@/lib/data/changes";
import { createPolicyDraft } from "@/lib/data/policies";
import * as schema from "@/lib/db/schema";
import { DEFAULT_RULES } from "@/lib/engine/rules";

/** DISPOSABLE database only (TEST_DATABASE_URL). Uses induction 950 and policy key "1997". */
const url = process.env.TEST_DATABASE_URL;
const policies = JSON.parse(readFileSync(path.join(__dirname, "fixtures", "scoring_policy.json"), "utf8")).policies;
const IND = 950;
const editor: Session = { userId: "r-pe", email: "rules-policy@test.local", role: "policy_editor", isStub: false };
const dataEditor: Session = { userId: "r-de", email: "rules-data@test.local", role: "data_editor", isStub: false };
const withParent = { ...DEFAULT_RULES, label: "Parent bonus on", parentBonus: { ...DEFAULT_RULES.parentBonus, enabled: true } };

describe.skipIf(!url)("allocation rules (integration)", () => {
  const sql = postgres(url ?? "postgres://unused", { max: 2, onnotice: () => {} });
  const db = drizzle(sql, { schema });

  const wipe = async () => {
    await db.delete(schema.stagedChanges).where(eq(schema.stagedChanges.target, `rules:${IND}`));
    await db.delete(schema.allocationRules).where(eq(schema.allocationRules.inductionId, IND));
    await db.delete(schema.scoringPolicies).where(eq(schema.scoringPolicies.policyKey, "1997"));
    await db.delete(schema.auditLog).where(like(schema.auditLog.entityId, `induction ${IND} rules%`));
  };
  beforeAll(wipe);
  afterAll(async () => {
    await wipe();
    await sql.end();
  });

  it("uses the default rules, and says a scoring policy is needed when none covers the induction", async () => {
    const r = await loadInductionRules(db, IND);
    expect(r).toMatchObject({ origin: { kind: "default" }, policy: null, resolved: null });
    expect(r.problem).toMatch(/no scoring policy/);
  });

  it("follows the covering scoring policy: fcps_jcat counted at 5, parent institute not counted", async () => {
    await createPolicyDraft(db, editor, { policyKey: "1997", definition: { ...policies["2026"], induction: IND }, reason: "test policy" });
    const r = await loadInductionRules(db, IND);
    expect(r.policy).toMatchObject({ policyKey: "1997", version: 1 });
    expect(r.resolved).toMatchObject({ certificate: { on: true, cap: 5 }, parent: { on: false, cap: null } });
  });

  it("validates drafts and needs the policy capability", async () => {
    await expect(createRulesDraft(db, editor, { induction: IND, definition: { ...DEFAULT_RULES, surprise: true }, reason: "x" })).rejects.toThrow();
    await expect(createRulesDraft(db, editor, { induction: IND, definition: DEFAULT_RULES, reason: " " })).rejects.toThrow(/reason/);
    await expect(createRulesDraft(db, dataEditor, { induction: IND, definition: DEFAULT_RULES, reason: "x" })).rejects.toThrow("forbidden");
  });

  it("stages an activation with the settings that change, publishes it and records it", async () => {
    const v1 = await createRulesDraft(db, editor, { induction: IND, definition: withParent, reason: "parent bonus counts" });
    expect(v1.version).toBe(1);
    // Listed once it has rules, even with no imported data.
    expect((await rulesOverview(db, editor)).find((x) => x.induction === IND)).toMatchObject({ origin: { kind: "default" } });
    // A draft changes nothing.
    expect((await loadInductionRules(db, IND)).origin).toEqual({ kind: "default" });

    const p = await proposeRulesActivation(db, editor, { id: v1.id, reason: "activate v1" });
    expect(p.applied).toBe(false);
    const c = (await getChange(db, editor, (p as { changeId: string }).changeId))!;
    expect(c).toMatchObject({ kind: "rules_activate", status: "pending", stale: false, canDecide: true });
    expect(c.preview).toMatchObject({ from: "default rules", to: "v1", policy: "1997 v1", problem: null });
    expect((c.preview as { settings: unknown[] }).settings).toEqual([{ setting: "parentBonus.enabled", from: '"auto"', to: "true" }]);
    expect((await getChange(db, dataEditor, c.id))!.canDecide).toBe(false);

    await publishChange(db, editor, { id: c.id, reason: "confirmed" });
    const r = await loadInductionRules(db, IND);
    expect(r.origin).toMatchObject({ kind: "stored", version: 1 });
    expect(r.resolved?.parent).toEqual({ on: true, cap: null });
    const audit = await db.select().from(schema.auditLog).where(eq(schema.auditLog.entityId, `induction ${IND} rules v1`));
    expect(audit.map((a) => a.action).sort()).toEqual(["allocation_rules.activate", "allocation_rules.create_draft"]);
  });

  it("refuses a preview made before the rules changed", async () => {
    const v2 = await createRulesDraft(db, editor, { induction: IND, definition: { ...withParent, label: "v2", cascade: { ...DEFAULT_RULES.cascade, maxWaves: 50 } }, reason: "fewer waves" });
    const p = (await proposeRulesActivation(db, editor, { id: v2.id, reason: "activate v2" })) as { changeId: string };
    await createRulesDraft(db, editor, { induction: IND, definition: DEFAULT_RULES, reason: "another draft" });
    expect((await getChange(db, editor, p.changeId))!.stale).toBe(true);
    await expect(publishChange(db, editor, { id: p.changeId, reason: "go" })).rejects.toThrow(/changed since/);
  });

  it("rolls back to the previous version, then to the default rules", async () => {
    const [v2] = await db.select().from(schema.allocationRules).where(eq(schema.allocationRules.inductionId, IND)).orderBy(schema.allocationRules.version).offset(1).limit(1);
    const p = (await proposeRulesActivation(db, editor, { id: v2!.id, reason: "activate v2 again" })) as { changeId: string };
    await publishChange(db, editor, { id: p.changeId, reason: "go" });
    expect((await loadInductionRules(db, IND)).origin).toMatchObject({ version: 2 });

    await rollbackChange(db, editor, { id: p.changeId, reason: "undo v2" });
    expect((await loadInductionRules(db, IND)).origin).toMatchObject({ version: 1 });

    const first = (await db.select().from(schema.stagedChanges).where(eq(schema.stagedChanges.target, `rules:${IND}`)))
      .find((c) => c.status === "published")!;
    await rollbackChange(db, editor, { id: first.id, reason: "undo v1" });
    expect((await loadInductionRules(db, IND)).origin).toEqual({ kind: "default" });
  });
});
