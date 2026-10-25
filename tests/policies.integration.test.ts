import { readFileSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, like } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "@/lib/auth/roles";
import { createPolicyDraft, listPolicyVersions } from "@/lib/data/policies";
import * as schema from "@/lib/db/schema";

/**
 * Runs against a real, migrated, DISPOSABLE database:
 *   TEST_DATABASE_URL=postgres://… npm test
 * Skipped otherwise. It deletes rows it creates under the policy key "1999".
 */
const url = process.env.TEST_DATABASE_URL;
const fixture = JSON.parse(readFileSync(path.join(__dirname, "fixtures/scoring_policy.json"), "utf8"));

const admin: Session = { userId: "t-admin", email: "admin@test.local", role: "admin", isStub: false };
const candidate: Session = { userId: "t-cand", email: "cand@test.local", role: "candidate", isStub: false };

describe.skipIf(!url)("policy data access (integration)", () => {
  const sql = postgres(url ?? "postgres://unused", { max: 2, onnotice: () => {} });
  const db = drizzle(sql, { schema });
  const KEY = "1999";

  const cleanup = async () => {
    await db.delete(schema.auditLog).where(like(schema.auditLog.entityId, `${KEY}@%`));
    await db.delete(schema.scoringPolicies).where(eq(schema.scoringPolicies.policyKey, KEY));
  };
  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await sql.end();
  });

  it("refuses candidates and anonymous callers", async () => {
    await expect(listPolicyVersions(db, null)).rejects.toThrow("unauthenticated");
    await expect(listPolicyVersions(db, candidate)).rejects.toThrow("forbidden");
    await expect(createPolicyDraft(db, candidate, { policyKey: KEY, definition: fixture.policies["2026"], reason: "x" })).rejects.toThrow("forbidden");
  });

  it("stores versioned drafts and writes an audit entry", async () => {
    const v1 = await createPolicyDraft(db, admin, { policyKey: KEY, definition: fixture.policies["2026"], reason: "import" });
    const v2 = await createPolicyDraft(db, admin, { policyKey: KEY, definition: fixture.policies["2026"], reason: "edit" });
    expect([v1.version, v2.version]).toEqual([1, 2]);

    const rows = (await listPolicyVersions(db, admin)).filter((r) => r.policyKey === KEY);
    expect(rows.every((r) => r.status === "draft")).toBe(true);

    const audit = await db.select().from(schema.auditLog).where(eq(schema.auditLog.entityId, `${KEY}@v2`));
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorEmail: admin.email, reason: "edit", result: "success" });
  });

  it("rejects an invalid definition without writing anything", async () => {
    const bad = { ...fixture.policies["2026"], total_marks: 99 };
    await expect(createPolicyDraft(db, admin, { policyKey: KEY, definition: bad, reason: "bad" })).rejects.toThrow();
    const rows = (await listPolicyVersions(db, admin)).filter((r) => r.policyKey === KEY);
    expect(rows).toHaveLength(2);
  });
});
