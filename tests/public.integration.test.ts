import { readFileSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, inArray } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "@/lib/auth/roles";
import { importMeritRound } from "@/lib/data/merit";
import { landingFigures } from "@/lib/data/public";
import * as schema from "@/lib/db/schema";

/** DISPOSABLE database only (TEST_DATABASE_URL). Uses induction 950. */
const url = process.env.TEST_DATABASE_URL;
const sample = JSON.parse(readFileSync(path.join(__dirname, "fixtures/merit_i20_round1_sample.json"), "utf8"));
const IND = 950;
const owner: Session = { userId: "p-own", email: "public-owner@test.local", role: "owner", isStub: false };

describe.skipIf(!url)("public landing figures (integration)", () => {
  const sql = postgres(url ?? "postgres://unused", { max: 2, onnotice: () => {} });
  const db = drizzle(sql, { schema });
  let metaId = 0;
  const wipe = async () => {
    const rs = await db.select({ id: schema.meritRounds.id }).from(schema.meritRounds).where(eq(schema.meritRounds.inductionId, IND));
    if (rs.length) await db.delete(schema.meritRounds).where(inArray(schema.meritRounds.id, rs.map((r) => r.id)));
    await db.delete(schema.inductions).where(eq(schema.inductions.id, IND));
    if (metaId) await db.delete(schema.scoringPolicyFileMeta).where(eq(schema.scoringPolicyFileMeta.id, metaId));
  };
  beforeAll(async () => {
    await wipe();
    const [m] = await db.insert(schema.scoringPolicyFileMeta).values({ meta: { active_policy: "x", _induction_max: { [IND]: 35 } }, createdBy: "test" }).returning({ id: schema.scoringPolicyFileMeta.id });
    metaId = m!.id;
    const file = { ...sample, Table: [{ ...sample.Table[0], inductionId: IND }] };
    await importMeritRound(db, owner, { roundNo: 1, file, reason: "test" });
    const r2 = structuredClone(file);
    r2.Table5[0].marks = 3;
    await importMeritRound(db, owner, { roundNo: 2, file: r2, reason: "test" });
  });
  afterAll(async () => {
    await wipe();
    await sql.end();
  });

  it("gives aggregate figures only", async () => {
    const f = await landingFigures(db);
    expect(f.rounds).toBeGreaterThanOrEqual(2);
    expect(f.latest?.induction).toBe(IND);
    expect(f.latest?.trend.map((t) => t.round)).toEqual([1, 2]);
    expect(f.sample).toMatchObject({ pct: 65 });
    const text = JSON.stringify(f);
    for (const leak of ["A1000", "Test Candidate", "Test Parent", "0000-X", "example.test", "applicant"]) expect(text).not.toContain(leak);
  });
});
