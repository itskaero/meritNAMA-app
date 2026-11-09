import { readFileSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, inArray, like } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "@/lib/auth/roles";
import {
  discardChange,
  getChange,
  proposeActivation,
  proposeDeleteRound,
  proposeMeritRound,
  proposeSeatFile,
  publishChange,
  rollbackChange,
} from "@/lib/data/changes";
import { getRound } from "@/lib/data/merit";
import { createPolicyDraft } from "@/lib/data/policies";
import { exportSeatFile, updateSeatCount } from "@/lib/data/reference-data";
import * as schema from "@/lib/db/schema";

/** DISPOSABLE database only (TEST_DATABASE_URL). Uses induction 940 and policy key "1998". */
const url = process.env.TEST_DATABASE_URL;
const fx = (f: string) => JSON.parse(readFileSync(path.join(__dirname, "fixtures", f), "utf8"));
const seats = fx("seats_induction21.json").slice(0, 40);
const round = fx("merit_i20_round1_sample.json");
const policies = fx("scoring_policy.json").policies;
const IND = 940;
const editor: Session = { userId: "c-ed", email: "changes-editor@test.local", role: "data_editor", isStub: false };
const policyEditor: Session = { userId: "c-pe", email: "changes-policy@test.local", role: "policy_editor", isStub: false };
const roundFile = (rows = round.Table5) => ({ ...round, Table: [{ ...round.Table[0], inductionId: IND }], Table5: rows });

describe.skipIf(!url)("preview and publish (integration)", () => {
  const sql = postgres(url ?? "postgres://unused", { max: 2, onnotice: () => {} });
  const db = drizzle(sql, { schema });

  const wipe = async () => {
    await db.delete(schema.stagedChanges).where(like(schema.stagedChanges.target, `%${IND}%`));
    await db.delete(schema.stagedChanges).where(eq(schema.stagedChanges.target, "policy:active"));
    const rs = await db.select({ id: schema.meritRounds.id }).from(schema.meritRounds).where(eq(schema.meritRounds.inductionId, IND));
    if (rs.length) await db.delete(schema.meritRounds).where(inArray(schema.meritRounds.id, rs.map((r) => r.id)));
    await db.delete(schema.inductionSeats).where(eq(schema.inductionSeats.inductionId, IND));
    await db.delete(schema.inductions).where(eq(schema.inductions.id, IND));
    await db.delete(schema.scoringPolicies).where(eq(schema.scoringPolicies.policyKey, "1998"));
    // Lookups created by the seat import; other suites define their own.
    const ids = (k: string) => [...new Set(seats.map((r: Record<string, number>) => r[k]))] as number[];
    await db.delete(schema.programs).where(inArray(schema.programs.id, ids("typeId")));
    await db.delete(schema.quotas).where(inArray(schema.quotas.id, ids("quotaId")));
    await db.delete(schema.specialities).where(inArray(schema.specialities.id, ids("specialityId")));
    await db.delete(schema.institutes).where(inArray(schema.institutes.id, ids("instituteId")));
    await db.delete(schema.hospitals).where(inArray(schema.hospitals.id, ids("hospitalId")));
  };
  beforeAll(wipe);
  afterAll(async () => {
    await wipe();
    await sql.end();
  });

  it("applies a first import directly and stages a replacement with a diff", async () => {
    expect(await proposeSeatFile(db, editor, { induction: IND, calendarYear: 2027, file: seats, reason: "first" })).toMatchObject({ applied: true });
    const changed = structuredClone(seats);
    changed[0].seats += 3;
    const p = await proposeSeatFile(db, editor, { induction: IND, file: changed.slice(0, 39), reason: "update" });
    expect(p.applied).toBe(false);
    const c = (await getChange(db, editor, (p as { changeId: string }).changeId))!;
    expect(c).toMatchObject({ status: "pending", kind: "seat_matrix_replace", canDecide: true, stale: false });
    expect(c.preview).toMatchObject({ changedCount: 1, removedCount: 1, addedCount: 0, lines: { from: 40, to: 39 } });
    expect(JSON.stringify(c)).not.toContain("payload");
    // Nothing changed yet
    expect((await exportSeatFile(db, editor, IND))[0]!.seats).toBe(seats[0].seats);
  });

  it("needs the area's capability to publish", async () => {
    const [c] = await db.select().from(schema.stagedChanges).where(eq(schema.stagedChanges.status, "pending")).limit(1);
    await expect(publishChange(db, policyEditor, { id: c!.id, reason: "x" })).rejects.toThrow("forbidden");
  });

  it("refuses to publish a stale preview", async () => {
    const [c] = await db.select().from(schema.stagedChanges).where(eq(schema.stagedChanges.target, `seats:${IND}`)).limit(1);
    const key = { programId: seats[5].typeId, quotaId: seats[5].quotaId, specialityId: seats[5].specialityId, instituteId: seats[5].instituteId, hospitalId: seats[5].hospitalId };
    await updateSeatCount(db, editor, { induction: IND, key, seats: seats[5].seats + 1, reason: "meanwhile" });
    expect((await getChange(db, editor, c!.id))!.stale).toBe(true);
    await expect(publishChange(db, editor, { id: c!.id, reason: "go" })).rejects.toThrow("changed since this preview");
    await updateSeatCount(db, editor, { induction: IND, key, seats: seats[5].seats, reason: "undo" });
  });

  it("publishes, then rolls back to the snapshot", async () => {
    const [c] = await db.select().from(schema.stagedChanges).where(eq(schema.stagedChanges.target, `seats:${IND}`)).limit(1);
    await publishChange(db, editor, { id: c!.id, reason: "notification 3" });
    const after = await exportSeatFile(db, editor, IND);
    expect(after).toHaveLength(39);
    expect(after[0]!.seats).toBe(seats[0].seats + 3);
    expect((await getChange(db, editor, c!.id))!.rollbackable).toBe(true);
    await rollbackChange(db, editor, { id: c!.id, reason: "wrong file" });
    expect(await exportSeatFile(db, editor, IND)).toEqual(seats);
    expect((await getChange(db, editor, c!.id))!.status).toBe("rolled_back");
  });

  it("stages replacing and removing a merit round, and restores it", async () => {
    expect((await proposeMeritRound(db, editor, { roundNo: 1, file: roundFile(), reason: "first" })).applied).toBe(true);
    const rows = structuredClone(round.Table5);
    rows[0].marks = 1;
    const p = await proposeMeritRound(db, editor, { roundNo: 1, file: roundFile(rows), reason: "corrected" });
    const c = (await getChange(db, editor, (p as { changeId: string }).changeId))!;
    expect(c.preview).toMatchObject({ allocations: { from: 61, to: 61 }, groupsChanged: 1 });
    // Personal fields never reach the staged payload.
    const [raw] = await db.select({ payload: schema.stagedChanges.payload }).from(schema.stagedChanges).where(eq(schema.stagedChanges.id, c.id));
    const stagedRow = (raw!.payload as { file: { Table5: Record<string, unknown>[] } }).file.Table5[0]!;
    for (const pii of ["name", "relation", "relationType", "pmdcNo", "emailId", "empInfo"]) expect(stagedRow).not.toHaveProperty(pii);
    await discardChange(db, editor, { id: c.id, reason: "not yet" });

    const before = (await getRound(db, editor, IND, 1))!;
    const del = await proposeDeleteRound(db, editor, { roundId: before.id, reason: "duplicate" });
    const dc = (await getChange(db, editor, (del as { changeId: string }).changeId))!;
    expect(dc.preview).toMatchObject({ allocations: 61 });
    await publishChange(db, editor, { id: dc.id, reason: "remove" });
    expect(await getRound(db, editor, IND, 1)).toBeNull();
    await rollbackChange(db, editor, { id: dc.id, reason: "needed after all" });
    expect((await getRound(db, editor, IND, 1))!.allocations).toBe(61);
  });

  it("stages policy activation with a component diff", async () => {
    const v1 = await createPolicyDraft(db, policyEditor, { policyKey: "1998", definition: policies["2026"], reason: "test" });
    const p = await proposeActivation(db, policyEditor, { id: v1.id, reason: "try" });
    expect(p.applied).toBe(false);
    const c = (await getChange(db, policyEditor, (p as { changeId: string }).changeId))!;
    expect(c.preview).toMatchObject({ to: "1998 v1", total: { to: 30 } });
    await expect(publishChange(db, editor, { id: c.id, reason: "x" })).rejects.toThrow("forbidden");
    await discardChange(db, policyEditor, { id: c.id, reason: "test only" });
  });
});
