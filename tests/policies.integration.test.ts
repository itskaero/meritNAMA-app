import { readFileSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, like } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "@/lib/auth/roles";
import {
  activatePolicyVersion,
  createPolicyDraft,
  exportScoringPolicyFile,
  importScoringPolicyFile,
  listPolicyVersions,
} from "@/lib/data/policies";
import * as schema from "@/lib/db/schema";

/**
 * Runs against a real, migrated, DISPOSABLE database:
 *   TEST_DATABASE_URL=postgres://… npm test
 * Skipped otherwise. The first suite deletes rows it creates under the policy key
 * "1999"; the file round-trip suite empties the scoring-policy tables.
 */
const url = process.env.TEST_DATABASE_URL;
const fixture = JSON.parse(readFileSync(path.join(__dirname, "fixtures/scoring_policy.json"), "utf8"));

const admin: Session = { userId: "t-admin", email: "admin@test.local", role: "owner", isStub: false };
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

describe.skipIf(!url)("scoring_policy.json import/export (integration)", () => {
  const sql = postgres(url ?? "postgres://unused", { max: 2, onnotice: () => {} });
  const db = drizzle(sql, { schema });

  const wipe = async () => {
    await db.delete(schema.scoringPolicyFileMeta);
    await db.delete(schema.scoringPolicies);
  };
  beforeAll(wipe);
  afterAll(async () => {
    await wipe();
    await sql.end();
  });

  it("refuses non-admins", async () => {
    await expect(importScoringPolicyFile(db, candidate, { file: fixture, reason: "x" })).rejects.toThrow("forbidden");
    await expect(exportScoringPolicyFile(db, null)).rejects.toThrow("unauthenticated");
  });

  it("reports that nothing was imported yet", async () => {
    expect(await exportScoringPolicyFile(db, admin)).toMatchObject({ ok: false, reason: "no_meta" });
  });

  it("rejects an invalid file without writing anything", async () => {
    const bad = structuredClone(fixture);
    bad.policies["2026"].total_marks = 99;
    await expect(importScoringPolicyFile(db, admin, { file: bad, reason: "bad" })).rejects.toThrow();
    expect(await listPolicyVersions(db, admin)).toHaveLength(0);
  });

  it("exports exactly the file that was imported", async () => {
    const result = await importScoringPolicyFile(db, admin, { file: fixture, reason: "initial import" });
    expect(result.created).toHaveLength(Object.keys(fixture.policies).length);

    const rows = await listPolicyVersions(db, admin);
    expect(rows.filter((r) => r.status === "active").map((r) => r.policyKey)).toEqual([fixture.active_policy]);

    const exported = await exportScoringPolicyFile(db, admin);
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.issues.join("\n"));
    expect(exported.file).toEqual(fixture);
    // Same key order too, so the exported file diffs cleanly against the public one.
    expect(JSON.stringify(exported.file, null, 2)).toBe(JSON.stringify(fixture, null, 2));
  });

  it("exports an edited draft and a changed activation", async () => {
    const edited = structuredClone(fixture.policies["2025"]);
    edited.notes = "Edited in the admin workspace";
    const draft = await createPolicyDraft(db, admin, { policyKey: "2025", definition: edited, reason: "edit" });
    await activatePolicyVersion(db, admin, { id: draft.id, reason: "switch" });

    const rows = await listPolicyVersions(db, admin);
    expect(rows.filter((r) => r.status === "active").map((r) => `${r.policyKey}@v${r.version}`)).toEqual(["2025@v2"]);
    expect(rows.find((r) => r.policyKey === fixture.active_policy)?.status).toBe("retired");

    const exported = await exportScoringPolicyFile(db, admin);
    if (!exported.ok) throw new Error(exported.issues.join("\n"));
    expect(exported.file.active_policy).toBe("2025");
    expect(exported.file.policies["2025"]?.notes).toBe("Edited in the admin workspace");
    expect(exported.file.policies["2026"]).toEqual(fixture.policies["2026"]);
  });
});
