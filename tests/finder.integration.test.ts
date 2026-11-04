import { readFileSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, inArray } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "@/lib/auth/roles";
import { findOptions, finderOptions, listShortlist, optionHistory, toggleShortlist } from "@/lib/data/finder";
import { importMeritRound } from "@/lib/data/merit";
import * as schema from "@/lib/db/schema";

/** DISPOSABLE database only (TEST_DATABASE_URL). Uses induction 930 and its own users. */
const url = process.env.TEST_DATABASE_URL;
const sample = JSON.parse(readFileSync(path.join(__dirname, "fixtures/merit_i20_round1_sample.json"), "utf8"));
const IND = 930;
const admin: Session = { userId: "f-admin", email: "finder-admin@test.local", role: "admin", isStub: false };
const cand: Session = { userId: "f-cand", email: "finder-cand@test.local", role: "candidate", isStub: false };

describe.skipIf(!url)("score finder (integration)", () => {
  const sql = postgres(url ?? "postgres://unused", { max: 2, onnotice: () => {} });
  const db = drizzle(sql, { schema });
  let metaId = 0;

  const wipe = async () => {
    const rounds = await db.select({ id: schema.meritRounds.id }).from(schema.meritRounds).where(eq(schema.meritRounds.inductionId, IND));
    if (rounds.length) await db.delete(schema.meritRounds).where(inArray(schema.meritRounds.id, rounds.map((r) => r.id)));
    await db.delete(schema.inductions).where(eq(schema.inductions.id, IND));
    await db.delete(schema.users).where(inArray(schema.users.email, [admin.email, cand.email]));
    if (metaId) await db.delete(schema.scoringPolicyFileMeta).where(eq(schema.scoringPolicyFileMeta.id, metaId));
  };
  beforeAll(async () => {
    await wipe();
    const [m] = await db.insert(schema.scoringPolicyFileMeta).values({ meta: { active_policy: "x", _induction_max: { [IND]: 35 } }, createdBy: "test" }).returning({ id: schema.scoringPolicyFileMeta.id });
    metaId = m!.id;
    const file = (rows: unknown[]) => ({ ...sample, Table: [{ ...sample.Table[0], inductionId: IND }], Table5: rows });
    await importMeritRound(db, admin, { roundNo: 1, file: file(sample.Table5), reason: "test" });
    // Round 2: the first FCPS Punjab Anaesthesia row closes lower.
    const r2 = structuredClone(sample.Table5) as { type: string; quota: string; speciality: string; marks: number }[];
    const i = r2.findIndex((r) => r.type === "FCPS" && r.quota === "Punjab" && r.speciality === "Anaesthesia");
    r2[i]!.marks = 10;
    await importMeritRound(db, admin, { roundNo: 2, file: file(r2), reason: "test" });
  });
  afterAll(async () => {
    await wipe();
    await sql.end();
  });

  it("lists inductions with known totals and their tracks", async () => {
    const o = await finderOptions(db, cand);
    const ind = o.inductions.find((i) => i.id === IND)!;
    expect(ind.total).toBe(35);
    expect(ind.tracks[0]).toMatchObject({ program: "FCPS", quota: "Punjab" });
  });

  it("classifies options by first- and final-round closing", async () => {
    const all = await findOptions(db, cand, { induction: IND, program: "FCPS", quota: "Punjab", marks: 0, total: 30 });
    expect(all.options.every((o) => o.status === "out")).toBe(true);

    const anaesthesia = all.options.find((o) => o.speciality === "Anaesthesia" && o.lastClosing === 10)!;
    expect(anaesthesia).toMatchObject({ firstRound: 1, lastRound: 2 });
    // 10 of 35 = 28.6%; 9 of 30 = 30%: reaches the final-round closing only.
    const mid = await findOptions(db, cand, { induction: IND, program: "FCPS", quota: "Punjab", marks: 9, total: 30 });
    expect(mid.options.find((o) => o.speciality === anaesthesia.speciality && o.hospital === anaesthesia.hospital)!.status).toBe("borderline");
    const top = await findOptions(db, cand, { induction: IND, program: "FCPS", quota: "Punjab", marks: 30, total: 30 });
    expect(top.options.every((o) => o.status === "safe")).toBe(true);
    expect(JSON.stringify(top)).not.toContain("applicant");
  });

  it("refuses marks above the total", async () => {
    await expect(findOptions(db, cand, { induction: IND, program: "FCPS", quota: "Punjab", marks: 31, total: 30 })).rejects.toThrow("cannot be more");
  });

  it("returns an option's history in percent", async () => {
    const h = await optionHistory(db, cand, { program: "FCPS", quota: "Punjab", speciality: "Anaesthesia", hospital: "Jinnah Hospital, Lahore" });
    expect(h.filter((x) => x.inductionId === IND).map((x) => x.roundNo)).toEqual([1, 2]);
    expect(h[0]!.pct).toBeCloseTo((h[0]!.closing / 35) * 100, 6);
  });

  it("keeps a private shortlist per member", async () => {
    const item = { program: "FCPS", quota: "Punjab", speciality: "Anaesthesia", hospital: "Jinnah Hospital, Lahore" };
    expect(await toggleShortlist(db, cand, item)).toEqual({ saved: true });
    expect(await listShortlist(db, cand)).toHaveLength(1);
    expect(await listShortlist(db, admin)).toHaveLength(0);
    expect(await toggleShortlist(db, cand, item)).toEqual({ saved: false });
    expect(await listShortlist(db, cand)).toHaveLength(0);
    await expect(listShortlist(db, null)).rejects.toThrow("unauthenticated");
  });
});
