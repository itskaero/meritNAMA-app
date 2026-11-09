import { drizzle } from "drizzle-orm/postgres-js";
import { inArray, like, sql as dsql } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "@/lib/auth/roles";
import { listTeam, setUserRole } from "@/lib/data/team";
import * as schema from "@/lib/db/schema";

/** DISPOSABLE database only (TEST_DATABASE_URL). Uses *@team.test addresses. */
const url = process.env.TEST_DATABASE_URL;
const owner: Session = { userId: "t-owner", email: "owner@team.test", role: "owner", isStub: false };
const editor: Session = { userId: "t-ed", email: "editor@team.test", role: "data_editor", isStub: false };

describe.skipIf(!url)("team roles (integration)", () => {
  const sql = postgres(url ?? "postgres://unused", { max: 2, onnotice: () => {} });
  const db = drizzle(sql, { schema });
  let otherOwners: string[] = [];
  const wipe = async () => {
    await db.delete(schema.auditLog).where(like(schema.auditLog.entityId, "%@team.test"));
    await db.delete(schema.users).where(like(schema.users.email, "%@team.test"));
  };
  beforeAll(async () => {
    await wipe();
    // The last-owner rule counts every owner; park other test owners as candidates meanwhile.
    otherOwners = (await db.select({ e: schema.users.email }).from(schema.users).where(dsql`${schema.users.role} in ('owner','admin')`)).map((r) => r.e);
    if (otherOwners.length) await db.update(schema.users).set({ role: "candidate" }).where(inArray(schema.users.email, otherOwners));
    await db.insert(schema.users).values({ email: owner.email, role: "owner" });
  });
  afterAll(async () => {
    await wipe();
    if (otherOwners.length) await db.update(schema.users).set({ role: "owner" }).where(inArray(schema.users.email, otherOwners));
    await sql.end();
  });

  it("only owners manage roles", async () => {
    await expect(listTeam(db, editor)).rejects.toThrow("forbidden");
    await expect(setUserRole(db, editor, { email: "x@team.test", role: "owner", reason: "x" })).rejects.toThrow("forbidden");
  });

  it("gives a role by email before first sign-in, and audits it", async () => {
    expect(await setUserRole(db, owner, { email: "New.Editor@team.test", role: "data_editor", reason: "joins data team" })).toEqual({ changed: true });
    const team = await listTeam(db, owner);
    expect(team.find((m) => m.email === "new.editor@team.test")).toMatchObject({ role: "data_editor" });
    const audit = await db.select().from(schema.auditLog).where(like(schema.auditLog.entityId, "new.editor@team.test"));
    expect(audit[0]).toMatchObject({ action: "user.set_role", after: { role: "data_editor" }, reason: "joins data team" });
    await expect(setUserRole(db, owner, { email: "z@team.test", role: "owner", reason: " " })).rejects.toThrow("reason");
  });

  it("never removes the last owner", async () => {
    await expect(setUserRole(db, owner, { email: owner.email, role: "moderator", reason: "oops" })).rejects.toThrow("last owner");
    await setUserRole(db, owner, { email: "second@team.test", role: "owner", reason: "backup owner" });
    expect(await setUserRole(db, owner, { email: owner.email, role: "moderator", reason: "step down" })).toEqual({ changed: true });
  });

  it("removing a role drops someone from the team list", async () => {
    await setUserRole(db, owner, { email: "new.editor@team.test", role: "candidate", reason: "left" });
    expect((await listTeam(db, owner)).map((m) => m.email)).not.toContain("new.editor@team.test");
  });
});
