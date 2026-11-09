import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, inArray, like } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "@/lib/auth/roles";
import { applyDataFile, autoImportDataFolder, dataCounts, listDataFiles, readDataFile, removeDataFile, scanDataFolder, writeDataFile } from "@/lib/data/datastore";
import * as schema from "@/lib/db/schema";

/** DISPOSABLE database only (TEST_DATABASE_URL). Uses induction 961 and a temporary storage folder. */
const url = process.env.TEST_DATABASE_URL;
const sample = JSON.parse(readFileSync(path.join(__dirname, "fixtures/merit_i20_round1_sample.json"), "utf8"));
const IND = 961;
const editor: Session = { userId: "d-ed", email: "data-editor@test.local", role: "data_editor", isStub: false };
const moderator: Session = { userId: "d-mod", email: "data-mod@test.local", role: "moderator", isStub: false };
const round = (marks?: number) => {
  const f = structuredClone({ ...sample, Table: [{ ...sample.Table[0], inductionId: IND }] });
  if (marks !== undefined) f.Table5[0].marks = marks;
  return JSON.stringify(f);
};

describe.skipIf(!url)("data folder (integration)", () => {
  const sql = postgres(url ?? "postgres://unused", { max: 2, onnotice: () => {} });
  const db = drizzle(sql, { schema });
  const root = mkdtempSync(path.join(os.tmpdir(), "mn-data-"));
  const data = (...p: string[]) => path.join(root, "data", ...p);
  const put = (rel: string, body: string) => {
    mkdirSync(path.dirname(data(rel)), { recursive: true });
    writeFileSync(data(rel), body);
  };
  const opts = { root };
  const find = async (rel: string) => (await listDataFiles(db, editor)).find((f) => f.path === rel);

  const wipe = async () => {
    await db.delete(schema.dataFiles);
    await db.delete(schema.stagedChanges).where(like(schema.stagedChanges.target, `%${IND}%`));
    const rs = await db.select({ id: schema.meritRounds.id }).from(schema.meritRounds).where(eq(schema.meritRounds.inductionId, IND));
    if (rs.length) await db.delete(schema.meritRounds).where(inArray(schema.meritRounds.id, rs.map((r) => r.id)));
    await db.delete(schema.inductions).where(eq(schema.inductions.id, IND));
  };
  beforeAll(wipe);
  afterAll(async () => {
    await wipe();
    await sql.end();
    rmSync(root, { recursive: true, force: true });
  });

  it("lists a new merit file under its old name, and publishes it on the worker's pass", async () => {
    put(`induction${IND}_merit_round1.json`, round());
    put("closing_merit.json", "{}");
    put("notes.json", '{"hello":"world"}');
    await scanDataFolder(db, editor, opts);

    const merit = await find(`induction${IND}_merit_round1.json`);
    expect(merit).toMatchObject({ kind: "merit", status: "new", induction: IND, round: 1 });
    expect(merit?.summary).toMatch(/allocations/);
    expect(await find("closing_merit.json")).toMatchObject({ status: "ignored" });
    expect(await find("notes.json")).toMatchObject({ status: "ignored" });

    const r = await autoImportDataFolder(db, opts);
    expect(r.applied).toBe(1);
    expect(await find(`induction${IND}_merit_round1.json`)).toMatchObject({ status: "live" });
    const [live] = await db.select().from(schema.meritRounds).where(eq(schema.meritRounds.inductionId, IND));
    expect(live?.roundNo).toBe(1);
  });

  it("does nothing for an unchanged file", async () => {
    const before = await find(`induction${IND}_merit_round1.json`);
    const again = await autoImportDataFolder(db, opts);
    expect(again.applied).toBe(0);
    expect(await find(`induction${IND}_merit_round1.json`)).toMatchObject({ status: "live", appliedAt: before?.appliedAt });
  });

  it("holds a changed file for a click, and applying it stages a change instead of replacing", async () => {
    put(`induction${IND}_merit_round1.json`, round(75.5));
    const worker = await autoImportDataFolder(db, opts);
    expect(worker.applied).toBe(0); // the worker never applies a replacement
    const waiting = await find(`induction${IND}_merit_round1.json`);
    expect(waiting).toMatchObject({ status: "replaces" });
    expect((await dataCounts(db, editor)).waiting).toBe(1);

    const p = await applyDataFile(db, editor, { id: waiting!.id }, opts);
    expect(p.applied).toBe(false);
    const staged = await find(`induction${IND}_merit_round1.json`);
    expect(staged).toMatchObject({ status: "replaces" });
    expect(staged?.changeId).toBeTruthy();
    expect(staged?.changeStatus).toBe("pending");
  });

  it("reports a mistake in plain words and applies nothing", async () => {
    const bad = JSON.parse(round());
    bad.Table5[3].marks = "31.2x";
    put(`inductions/${IND}/merit/round_2.json`, JSON.stringify(bad));
    await scanDataFolder(db, editor, opts);
    const f = await find(`inductions/${IND}/merit/round_2.json`);
    expect(f?.status).toBe("problem");
    expect(f?.message).toMatch(/row 4/);
    await expect(applyDataFile(db, editor, { id: f!.id }, opts)).rejects.toThrow();
  });

  it("keeps estimate inputs for the estimate importer where it looks for them", async () => {
    put(`inductions/${IND}/preferences.json`, "[]");
    await scanDataFolder(db, editor, opts);
    const f = await find(`inductions/${IND}/preferences.json`);
    expect(f).toMatchObject({ kind: "sim_input", status: "new" });
    await autoImportDataFolder(db, opts);
    expect(existsSync(path.join(root, "simulation", `induction${IND}`, "preferences.json"))).toBe(true);
    expect(await find(`inductions/${IND}/preferences.json`)).toMatchObject({ status: "held" });
  });

  it("notes a file that left the folder, and keeps its data", async () => {
    rmSync(data(`induction${IND}_merit_round1.json`));
    await scanDataFolder(db, editor, opts);
    expect(await find(`induction${IND}_merit_round1.json`)).toMatchObject({ status: "missing" });
    const rounds = await db.select().from(schema.meritRounds).where(eq(schema.meritRounds.inductionId, IND));
    expect(rounds).toHaveLength(1);
  });

  it("writes uploads atomically, refuses odd names, and hands the same bytes back", async () => {
    const rel = await writeDataFile(editor, `inductions/${IND}/seats.json`, new TextEncoder().encode("[]"), opts);
    expect(rel).toBe(`inductions/${IND}/seats.json`);
    await expect(writeDataFile(editor, "../escape.json", new Uint8Array([1]), opts)).rejects.toThrow(/accepts/);
    await expect(writeDataFile(editor, "a.txt", new Uint8Array([1]), opts)).rejects.toThrow(/accepts/);
    await scanDataFolder(db, editor, opts);
    const f = await find(`inductions/${IND}/seats.json`);
    const out = await readDataFile(db, editor, { id: f!.id }, opts);
    expect(out.body.toString()).toBe("[]");
    await removeDataFile(db, editor, { id: f!.id, reason: "test" }, opts);
    expect(existsSync(data("inductions", String(IND), "seats.json"))).toBe(false);
  });

  it("is for data editors only", async () => {
    await expect(scanDataFolder(db, moderator, opts)).rejects.toThrow();
    await expect(writeDataFile(moderator, "x.json", new Uint8Array([1]), opts)).rejects.toThrow();
    await expect(readDataFile(db, moderator, { id: "00000000-0000-0000-0000-000000000000" }, opts)).rejects.toThrow();
  });
});
