import { readFileSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, inArray, like } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "@/lib/auth/roles";
import {
  compareRounds,
  deleteMeritRound,
  getRound,
  importMeritRound,
  inductionTimeline,
  listInductionsWithRounds,
  listUnmatchedNames,
  roundGroups,
  saveNameAlias,
  specialityHistory,
} from "@/lib/data/merit";
import * as schema from "@/lib/db/schema";

/**
 * Runs against a real, migrated, DISPOSABLE database (TEST_DATABASE_URL); skipped
 * otherwise. Uses induction 920 and lookup ids 9001+ and removes them afterwards.
 */
const url = process.env.TEST_DATABASE_URL;
const sample = JSON.parse(readFileSync(path.join(__dirname, "fixtures/merit_i20_round1_sample.json"), "utf8"));
const IND = 920;
const withInduction = (f: typeof sample, rows = f.Table5) => ({ ...f, Table: [{ ...f.Table[0], inductionId: IND }], Table5: rows });

const admin: Session = { userId: "t-admin", email: "admin@test.local", role: "admin", isStub: false };
const candidate: Session = { userId: "t-cand", email: "cand@test.local", role: "candidate", isStub: false };

describe.skipIf(!url)("merit rounds (integration)", () => {
  const sql = postgres(url ?? "postgres://unused", { max: 2, onnotice: () => {} });
  const db = drizzle(sql, { schema });
  const SPEC_ID = 9001, HOSP_ID = 9002;

  const wipe = async () => {
    const rounds = await db.select({ id: schema.meritRounds.id }).from(schema.meritRounds).where(eq(schema.meritRounds.inductionId, IND));
    if (rounds.length) await db.delete(schema.meritRounds).where(inArray(schema.meritRounds.id, rounds.map((r) => r.id)));
    await db.delete(schema.nameAliases).where(like(schema.nameAliases.nameKey, "%test%"));
    await db.delete(schema.nameAliases).where(eq(schema.nameAliases.lookupId, SPEC_ID));
    await db.delete(schema.inductions).where(eq(schema.inductions.id, IND));
    await db.delete(schema.specialities).where(eq(schema.specialities.id, SPEC_ID));
    await db.delete(schema.hospitals).where(eq(schema.hospitals.id, HOSP_ID));
    await db.delete(schema.auditLog).where(like(schema.auditLog.entityId, `induction:${IND}:%`));
  };
  beforeAll(async () => {
    await wipe();
    // Only "Anaesthesia" is a known speciality; everything else stays unmatched.
    await db.insert(schema.specialities).values({ id: SPEC_ID, name: "Anaesthesia" }).onConflictDoNothing();
    await db.insert(schema.hospitals).values({ id: HOSP_ID, name: "Jinnah Hospital, Lahore" }).onConflictDoNothing();
  });
  afterAll(async () => {
    await wipe();
    await sql.end();
  });

  it("refuses imports by non-admins and browsing by anonymous callers", async () => {
    await expect(importMeritRound(db, candidate, { roundNo: 1, file: withInduction(sample), reason: "x" })).rejects.toThrow("forbidden");
    await expect(listInductionsWithRounds(db, null)).rejects.toThrow("unauthenticated");
  });

  it("rejects an invalid file without writing anything", async () => {
    const bad = withInduction(sample, [...sample.Table5, sample.Table5[0]]);
    await expect(importMeritRound(db, admin, { roundNo: 1, file: bad, reason: "bad" })).rejects.toThrow("duplicate rowNo");
    expect(await getRound(db, admin, IND, 1)).toBeNull();
  });

  it("imports a round, creating the induction from the cycle dates", async () => {
    const r = await importMeritRound(db, admin, { roundNo: 1, file: withInduction(sample), reason: "import" });
    expect(r).toMatchObject({ inductionId: IND, roundNo: 1, allocations: 61, replaced: false });
    const [ind] = await db.select().from(schema.inductions).where(eq(schema.inductions.id, IND));
    expect(ind).toMatchObject({ calendarYear: 2025, status: "completed" });
    const round = await getRound(db, candidate, IND, 1);
    expect(round).toMatchObject({ cycleCode: "PHF/26/JAN/01", cycleName: "Jan 2026", startsOn: "2025-10-01", endsOn: "2025-12-31" });
  });

  it("stores no personal fields", async () => {
    const cols = Object.keys(schema.meritAllocations);
    for (const pii of ["name", "relation", "pmdcNo", "emailId", "empInfo"]) expect(cols).not.toContain(pii);
  });

  it("resolves known names and reports the rest", async () => {
    const unmatched = await listUnmatchedNames(db, admin);
    expect(unmatched.speciality.map((s) => s.name)).not.toContain("Anaesthesia");
    expect(unmatched.hospital.map((h) => h.name)).not.toContain("Jinnah Hospital, Lahore");
    expect(unmatched.speciality.length).toBeGreaterThan(0);
  });

  it("maps a published name with an alias and applies it to existing rows", async () => {
    const target = (await listUnmatchedNames(db, admin)).speciality[0]!;
    const r = await saveNameAlias(db, admin, { kind: "speciality", name: target.name.toUpperCase() + "  ", lookupId: SPEC_ID, reason: "same speciality" });
    expect(r.updated).toBe(target.rows);
    expect((await listUnmatchedNames(db, admin)).speciality.map((s) => s.name)).not.toContain(target.name);
  });

  it("groups closing merit and compares with the previous round", async () => {
    // Round 2: same file, one Anaesthesia allocation with lower marks.
    const rows = structuredClone(sample.Table5) as { speciality: string; marks: number }[];
    const i = rows.findIndex((x) => x.speciality === "Anaesthesia");
    rows[i]!.marks = 1.5;
    await importMeritRound(db, admin, { roundNo: 2, file: withInduction(sample, rows), reason: "import" });
    const r1 = (await getRound(db, admin, IND, 1))!, r2 = (await getRound(db, admin, IND, 2))!;
    const groups = await roundGroups(db, candidate, r2.id, r1.id, { speciality: "Anaesthesia" });
    expect(groups.length).toBeGreaterThan(0);
    expect(groups.every((g) => g.speciality === "Anaesthesia")).toBe(true);
    const changed = groups.find((g) => g.closing === 1.5)!;
    expect(changed.prevClosing).toBeGreaterThan(1.5);
    expect(JSON.stringify(groups)).not.toContain("applicant");

    const cmp = (await compareRounds(db, candidate, IND, 1, 2))!;
    expect(cmp.movement).toEqual({ entered: 0, left: 0, moved: 0 });
    expect(cmp.groups.find((g) => g.speciality === "Anaesthesia" && g.delta! < 0)).toBeTruthy();

    const timeline = await inductionTimeline(db, candidate, IND);
    expect(timeline.map((t) => t.roundNo)).toEqual([1, 2]);
    expect(timeline[0]).toMatchObject({ allocations: 61, applicants: 60 });
    expect(timeline[0]!.accepted + timeline[0]!.rejected + timeline[0]!.notAvail).toBe(61);
  });

  it("re-importing a round replaces it", async () => {
    const r = await importMeritRound(db, admin, { roundNo: 2, file: withInduction(sample, sample.Table5.slice(0, 10)), reason: "corrected file" });
    expect(r).toMatchObject({ replaced: true, allocations: 10 });
    const hist = (await specialityHistory(db, candidate, SPEC_ID))!;
    expect(hist.rows.some((x) => x.inductionId === IND && x.roundNo === 2)).toBe(true);
  });

  it("deletes a round with its allocations", async () => {
    const r2 = (await getRound(db, admin, IND, 2))!;
    await deleteMeritRound(db, admin, { roundId: r2.id, reason: "test" });
    expect(await getRound(db, admin, IND, 2)).toBeNull();
    expect(await db.select().from(schema.meritAllocations).where(eq(schema.meritAllocations.roundId, r2.id))).toHaveLength(0);
  });
});
