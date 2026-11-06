import { readFileSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, inArray, like } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "@/lib/auth/roles";
import { computeOptions, toggleShortlist } from "@/lib/data/finder";
import { importMeritRound } from "@/lib/data/merit";
import {
  addItem, createList, deleteList, duplicateList, exportListCsv, getList, listMyLists, optionsForTrack, removeItem, renameList, reorderList, setListMarks,
} from "@/lib/data/preferences";
import * as schema from "@/lib/db/schema";

/** Preference lists against a DISPOSABLE database (TEST_DATABASE_URL). Induction 970 (35 marks) and *-pl@test.local users. */
const url = process.env.TEST_DATABASE_URL;
const sample = JSON.parse(readFileSync(path.join(__dirname, "fixtures/merit_i20_round1_sample.json"), "utf8"));
const IND = 970;
const editor: Session = { userId: "pl-ed", email: "editor-pl@test.local", role: "data_editor", isStub: false };
const me: Session = { userId: "pl-me", email: "me-pl@test.local", role: "candidate", isStub: false };
const other: Session = { userId: "pl-o", email: "other-pl@test.local", role: "candidate", isStub: false };
const first = sample.Table5[0];
const [program, quota] = [first.type as string, first.quota as string];

describe.skipIf(!url)("preference lists (integration)", () => {
  const sql = postgres(url ?? "postgres://unused", { max: 2, onnotice: () => {} });
  const db = drizzle(sql, { schema });
  let metaId: number | null = null;
  const wipe = async () => {
    await db.delete(schema.users).where(like(schema.users.email, "%-pl@test.local"));
    const rounds = await db.select({ id: schema.meritRounds.id }).from(schema.meritRounds).where(eq(schema.meritRounds.inductionId, IND));
    if (rounds.length) await db.delete(schema.meritRounds).where(inArray(schema.meritRounds.id, rounds.map((r) => r.id)));
    await db.delete(schema.inductions).where(eq(schema.inductions.id, IND));
    if (metaId) await db.delete(schema.scoringPolicyFileMeta).where(eq(schema.scoringPolicyFileMeta.id, metaId));
  };
  beforeAll(async () => {
    await wipe();
    const [m] = await db.insert(schema.scoringPolicyFileMeta).values({ meta: { active_policy: "x", _induction_max: { [IND]: 35 } }, createdBy: "test" }).returning({ id: schema.scoringPolicyFileMeta.id });
    metaId = m!.id;
    await importMeritRound(db, editor, { roundNo: 1, file: { ...sample, Table: [{ ...sample.Table[0], inductionId: IND }] }, reason: "planner test" });
  });
  afterAll(async () => {
    await wipe();
    await sql.end();
  });

  let id = "";
  const opts = async () => (await optionsForTrack(db, me, { program, quota })).options;

  it("creates a list from the shortlist in its order, and keeps lists private", async () => {
    const o = await opts();
    expect(o.length).toBeGreaterThan(2);
    for (const x of [o[2]!, o[0]!]) await toggleShortlist(db, me, { program, quota, ...x });
    const created = await createList(db, me, { name: "Plan A", program, quota, fromShortlist: true });
    id = created.id;
    expect(created.items).toBe(2);
    const v = await getList(db, me, id);
    expect(v.rows.map((r) => r.speciality + r.hospital)).toEqual([o[2]!, o[0]!].map((x) => x.speciality + x.hospital));
    await expect(createList(db, me, { name: " plan a ", program, quota })).rejects.toThrow("already have a list");

    await expect(getList(db, other, id)).rejects.toThrow("does not exist");
    await expect(addItem(db, other, { id, ...o[1]! })).rejects.toThrow("does not exist");
    await expect(reorderList(db, other, { id, order: [] })).rejects.toThrow("does not exist");
    await expect(deleteList(db, other, id)).rejects.toThrow("does not exist");
    expect(await listMyLists(db, other)).toEqual([]);
  });

  it("adds, refuses duplicates, reorders only to a full permutation, and removes", async () => {
    const o = await opts();
    expect(await addItem(db, me, { id, ...o[1]! })).toEqual({ position: 3 });
    await expect(addItem(db, me, { id, ...o[1]! })).rejects.toThrow("already on this list");
    const now = (await getList(db, me, id)).rows.map((r) => [r.speciality, r.hospital] as [string, string]);
    await expect(reorderList(db, me, { id, order: now.slice(0, 2) })).rejects.toThrow("changed in another tab");
    await expect(reorderList(db, me, { id, order: [now[0]!, now[0]!, now[1]!] })).rejects.toThrow("changed in another tab");
    await reorderList(db, me, { id, order: [now[2]!, now[0]!, now[1]!] });
    expect((await getList(db, me, id)).rows.map((r) => [r.position, r.speciality, r.hospital])).toEqual([[1, ...now[2]!], [2, ...now[0]!], [3, ...now[1]!]]);
    await removeItem(db, me, { id, speciality: now[0]![0], hospital: now[0]![1] });
    expect((await getList(db, me, id)).rows.map((r) => r.position)).toEqual([1, 2]);
  });

  it("checks the list against the marks, like the finder, and exports it", async () => {
    let v = await getList(db, me, id);
    expect(v.marks).toBeNull();
    expect(v.analysis.warnings.map((w) => w.kind)).toContain("no-marks");
    await expect(setListMarks(db, me, { id, marks: 40, total: 35 })).rejects.toThrow("cannot be more");
    await setListMarks(db, me, { id, marks: 21, total: 35 });
    v = await getList(db, me, id);
    const expected = await computeOptions(db, { induction: IND, program, quota, marks: 21, total: 35 });
    for (const r of v.rows) expect(r.status).toBe(expected.options.find((o) => o.speciality === r.speciality && o.hospital === r.hospital)!.status);
    expect(v.summary.length).toBeGreaterThan(10);

    const { csv } = await exportListCsv(db, me, id);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("position,speciality,hospital,status,last closing %,likely next round");
    expect(lines).toHaveLength(v.rows.length + 1);
    expect(lines[1]!.startsWith(`1,`)).toBe(true);
    await expect(exportListCsv(db, other, id)).rejects.toThrow("does not exist");
  });

  it("renames, duplicates with items, and deletes", async () => {
    await renameList(db, me, { id, name: "Plan B" });
    const copy = await duplicateList(db, me, id);
    expect(copy.name).toBe("Copy of Plan B");
    expect((await getList(db, me, copy.id)).rows).toHaveLength(2);
    await createList(db, me, { name: "Plan C", program, quota });
    await expect(renameList(db, me, { id, name: "plan c" })).rejects.toThrow("already have a list");
    await deleteList(db, me, copy.id);
    expect(await db.select().from(schema.preferenceItems).where(eq(schema.preferenceItems.listId, copy.id))).toEqual([]);
    expect((await listMyLists(db, me)).map((l) => l.name).sort()).toEqual(["Plan B", "Plan C"]);
  });
});
