import { mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, inArray, like } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "@/lib/auth/roles";
import { importFromInbox, listInbox, skipInboxFile } from "@/lib/data/inbox";
import { getRound } from "@/lib/data/merit";
import * as schema from "@/lib/db/schema";

/** DISPOSABLE database only (TEST_DATABASE_URL). Uses induction 960 and a temporary storage folder. */
const url = process.env.TEST_DATABASE_URL;
const sample = JSON.parse(readFileSync(path.join(__dirname, "fixtures/merit_i20_round1_sample.json"), "utf8"));
const IND = 960;
const editor: Session = { userId: "i-ed", email: "inbox-editor@test.local", role: "data_editor", isStub: false };
const moderator: Session = { userId: "i-mod", email: "inbox-mod@test.local", role: "moderator", isStub: false };
const round = (marks?: number) => {
  const f = structuredClone({ ...sample, Table: [{ ...sample.Table[0], inductionId: IND }] });
  if (marks !== undefined) f.Table5[0].marks = marks;
  return JSON.stringify(f);
};

describe.skipIf(!url)("inbox (integration)", () => {
  const sql = postgres(url ?? "postgres://unused", { max: 2, onnotice: () => {} });
  const db = drizzle(sql, { schema });
  const root = mkdtempSync(path.join(os.tmpdir(), "mn-inbox-"));
  const inbox = (...p: string[]) => path.join(root, "inbox", ...p);
  const opts = { root };

  const wipe = async () => {
    await db.delete(schema.stagedChanges).where(like(schema.stagedChanges.target, `%${IND}%`));
    const rs = await db.select({ id: schema.meritRounds.id }).from(schema.meritRounds).where(eq(schema.meritRounds.inductionId, IND));
    if (rs.length) await db.delete(schema.meritRounds).where(inArray(schema.meritRounds.id, rs.map((r) => r.id)));
    await db.delete(schema.inductions).where(eq(schema.inductions.id, IND));
  };
  beforeAll(async () => {
    await wipe();
    await listInbox(db, editor, opts); // creates the folders
  });
  afterAll(async () => {
    await wipe();
    rmSync(root, { recursive: true, force: true });
    await sql.end();
  });

  it("lists valid, invalid and unrecognised files without opening the unrecognised", async () => {
    writeFileSync(inbox("merit", "round_1.json"), round());
    writeFileSync(inbox("merit", "round_2.json"), "{ not json");
    writeFileSync(inbox("merit", "notes.json"), "secret");
    const items = await listInbox(db, editor, opts);
    const by = (n: string) => items.find((i) => i.name === n)!;
    expect(by("round_1.json")).toMatchObject({ kind: "merit", canImport: true, replaces: false, issues: [] });
    expect(by("round_1.json").target).toContain(`Induction ${IND}, round 1`);
    expect(by("round_2.json")).toMatchObject({ kind: "merit", canImport: false });
    expect(by("round_2.json").issues[0]).toContain("Not valid JSON");
    expect(by("notes.json")).toMatchObject({ kind: "unrecognised", canImport: false });
    expect(JSON.stringify(by("notes.json"))).not.toContain("secret");
  });

  it("checks the capability for the file's kind", async () => {
    await expect(importFromInbox(db, moderator, { kind: "merit", name: "round_1.json", reason: "x" }, opts)).rejects.toThrow("forbidden");
    expect((await listInbox(db, moderator, opts)).find((i) => i.name === "round_1.json")!.canImport).toBe(false);
  });

  it("refuses traversal and symlinks", async () => {
    await expect(importFromInbox(db, editor, { kind: "merit", name: "../round_1.json", reason: "x" }, opts)).rejects.toThrow("not a file name");
    symlinkSync(inbox("merit", "round_1.json"), inbox("merit", "round_3.json"));
    await expect(importFromInbox(db, editor, { kind: "merit", name: "round_3.json", reason: "x" }, opts)).rejects.toThrow("regular files");
    expect((await listInbox(db, editor, opts)).find((i) => i.name === "round_3.json")!.kind).toBe("unrecognised");
    rmSync(inbox("merit", "round_3.json"));
  });

  it("imports a new round and moves the file to processed", async () => {
    const r = await importFromInbox(db, editor, { kind: "merit", name: "round_1.json", reason: "from NAS" }, opts);
    expect(r.applied).toBe(true);
    expect((await getRound(db, editor, IND, 1))!.allocations).toBe(61);
    expect(existsSync(inbox("merit", "round_1.json"))).toBe(false);
    expect(readdirSync(inbox("processed")).some((f) => f.endsWith("-imported-merit-round_1.json"))).toBe(true);
  });

  it("stages a replacement instead of applying it", async () => {
    writeFileSync(inbox("merit", "round_1.json"), round(2));
    expect((await listInbox(db, editor, opts)).find((i) => i.name === "round_1.json")!.replaces).toBe(true);
    const r = await importFromInbox(db, editor, { kind: "merit", name: "round_1.json", reason: "corrected" }, opts);
    expect(r.applied).toBe(false);
    const [c] = await db.select().from(schema.stagedChanges).where(eq(schema.stagedChanges.target, `induction:${IND}:round:1`));
    expect(c).toMatchObject({ status: "pending", kind: "merit_round_replace" });
  });

  it("skips a bad file with an audited reason", async () => {
    await skipInboxFile(db, editor, { kind: "merit", name: "round_2.json", reason: "broken export" }, opts);
    expect(existsSync(inbox("merit", "round_2.json"))).toBe(false);
    const audit = await db.select().from(schema.auditLog).where(eq(schema.auditLog.entityId, "merit/round_2.json"));
    expect(audit[0]).toMatchObject({ action: "inbox.skip", reason: "broken export" });
    await db.delete(schema.auditLog).where(eq(schema.auditLog.entityId, "merit/round_2.json"));
  });
});
