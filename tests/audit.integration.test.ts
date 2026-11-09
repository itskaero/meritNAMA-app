import { drizzle } from "drizzle-orm/postgres-js";
import { like } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "@/lib/auth/roles";
import { listAudit } from "@/lib/data/audit";
import * as schema from "@/lib/db/schema";

/** DISPOSABLE database only (TEST_DATABASE_URL). Uses entity ids starting "audit-test-". */
const url = process.env.TEST_DATABASE_URL;
const as = (role: Session["role"]): Session => ({ userId: `a-${role}`, email: `audit-${role}@test.local`, role, isStub: false });

describe.skipIf(!url)("audit history (integration)", () => {
  const sql = postgres(url ?? "postgres://unused", { max: 2, onnotice: () => {} });
  const db = drizzle(sql, { schema });
  const wipe = () => db.delete(schema.auditLog).where(like(schema.auditLog.entityId, "audit-test-%"));
  beforeAll(async () => {
    await wipe();
    await db.insert(schema.auditLog).values([
      { actorEmail: "editor@test.local", action: "merit_round.import", entityType: "merit_round", entityId: "audit-test-round", reason: "zebra import", result: "success", after: { allocations: 3 } },
      { actorEmail: "verifier@test.local", action: "candidate_link.approve", entityType: "candidate_link", entityId: "audit-test-link", reason: "zebra verified", result: "success" },
      { actorEmail: "owner@test.local", action: "user.set_role", entityType: "user", entityId: "audit-test-user", reason: "zebra role", result: "failure" },
    ]);
  });
  afterAll(async () => {
    await wipe();
    await sql.end();
  });

  const ids = async (s: Session, f = {}) => (await listAudit(db, s, { q: "zebra", ...f })).rows.map((r) => r.entityId).sort();

  it("shows everything to owners and hides personal entries from roles that do not need them", async () => {
    expect(await ids(as("owner"))).toEqual(["audit-test-link", "audit-test-round", "audit-test-user"]);
    expect(await ids(as("verifier"))).toEqual(["audit-test-link", "audit-test-round"]);
    expect(await ids(as("data_editor"))).toEqual(["audit-test-round"]);
    expect((await listAudit(db, as("data_editor"))).types).not.toContain("candidate_link");
  });

  it("filters by item type and result, and refuses non-staff", async () => {
    expect(await ids(as("owner"), { type: "merit_round" })).toEqual(["audit-test-round"]);
    expect(await ids(as("owner"), { result: "failure" })).toEqual(["audit-test-user"]);
    await expect(listAudit(db, as("candidate"))).rejects.toThrow("forbidden");
  });
});
