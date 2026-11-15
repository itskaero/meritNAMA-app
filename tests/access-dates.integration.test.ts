import { drizzle } from "drizzle-orm/postgres-js";
import { eq, like } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "@/lib/auth/roles";
import * as schema from "@/lib/db/schema";

const { currentSale, grantAccess, loadAccessSettings, saveAccessSettings } = await import("@/lib/data/access");

/**
 * Selling access for a new induction whose dates PHF has not published: no end until the
 * owner sets one, and moving the date moves everyone already approved for that induction.
 * Against a DISPOSABLE database (TEST_DATABASE_URL); uses induction 922 and *-access@test.local.
 */
const url = process.env.TEST_DATABASE_URL;
const owner: Session = { userId: "s-owner", email: "owner-access@test.local", role: "owner", isStub: false };

describe.skipIf(!url)("access dates (integration)", () => {
  const sql = postgres(url ?? "postgres://unused", { max: 2, onnotice: () => {} });
  const db = drizzle(sql, { schema });
  let saved: typeof schema.appSettings.$inferSelect | undefined;

  const wipe = async () => {
    await db.delete(schema.accessRequests).where(like(schema.accessRequests.email, "%-access@test.local"));
    await db.delete(schema.devOutbox).where(like(schema.devOutbox.to, "%-access@test.local"));
  };
  beforeAll(async () => {
    [saved] = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, "access"));
    await wipe();
  });
  afterAll(async () => {
    await wipe();
    await db.delete(schema.appSettings).where(eq(schema.appSettings.key, "access"));
    if (saved) await db.insert(schema.appSettings).values(saved);
    await sql.end();
  });

  const save = async (patch: { saleInduction: number | null; accessEndsOn: string | null }) => {
    const { since: _since, ...s } = await loadAccessSettings(db);
    return saveAccessSettings(db, owner, { ...s, perInduction: true, ...patch, reason: "access dates test" });
  };
  const expiry = async (email: string) => (await db.select({ e: schema.accessRequests.expiresAt, i: schema.accessRequests.induction }).from(schema.accessRequests).where(eq(schema.accessRequests.email, email)))[0]!;

  it("sells a new induction with no end until the owner sets a date", async () => {
    await save({ saleInduction: 922, accessEndsOn: null });
    expect(await currentSale(db)).toMatchObject({ induction: 922, end: null, source: "none" });
    await grantAccess(db, owner, { email: "a-access@test.local", note: "test" });
    expect(await expiry("a-access@test.local")).toEqual({ e: null, i: 922 });
  });

  it("moves everyone approved for that induction when the date is set or pushed back", async () => {
    expect((await save({ saleInduction: 922, accessEndsOn: "2099-01-31" })).redated).toBe(1);
    expect((await expiry("a-access@test.local")).e!.toISOString()).toBe("2099-01-31T18:59:59.000Z");
    expect((await save({ saleInduction: 922, accessEndsOn: "2099-09-30" })).redated).toBe(1);
    expect((await expiry("a-access@test.local")).e!.toISOString()).toBe("2099-09-30T18:59:59.000Z");
    // New approvals get the date too.
    await grantAccess(db, owner, { email: "b-access@test.local", note: "test" });
    expect((await expiry("b-access@test.local")).e!.toISOString()).toBe("2099-09-30T18:59:59.000Z");
  });

  it("never ends sooner than 30 days after someone's approval", async () => {
    const soon = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    await save({ saleInduction: 922, accessEndsOn: soon });
    const left = ((await expiry("a-access@test.local")).e!.getTime() - Date.now()) / 86_400_000;
    expect(left).toBeGreaterThan(29);
    expect(left).toBeLessThan(31);
  });
});
