import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, inArray, like } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "@/lib/auth/roles";
import {
  currentInduction, gazetteForApplicant, gazetteInfo, gazetteList, inductionLists, meritRanges, namesFor, roundList, searchByName,
} from "@/lib/data/lists";
import { getRound, importMeritRound } from "@/lib/data/merit";
import { importGazette } from "@/lib/data/simulation";
import * as schema from "@/lib/db/schema";

/**
 * Runs against a real, migrated, DISPOSABLE database (TEST_DATABASE_URL); skipped
 * otherwise. Uses induction 998 (the highest test induction, so it is the "current"
 * one) and removes it afterwards.
 */
const url = process.env.TEST_DATABASE_URL;
const sample = JSON.parse(readFileSync(path.join(__dirname, "fixtures/merit_i20_round1_sample.json"), "utf8"));
const IND = 998;
const admin: Session = { userId: "t-admin", email: "admin@test.local", role: "owner", isStub: false };
const candidate: Session = { userId: "t-cand", email: "cand@test.local", role: "candidate", isStub: false };

const gazetteRows = Array.from({ length: 150 }, (_, i) => ({
  rowNo: i + 1, applicantId: 880000 + i, nameFull: i === 7 ? "  Ayesha   Rahman " : `Gazette Person ${i}`, pmdcNo: `${i}-P`, cnic: "3520212345678", contactNumber: "03001234567",
  marksTotal: 80 - i * 0.25, degree: 40 - i * 0.1, houseJob: 5, status: i % 10 === 9 ? "Rejected" : "Eligible", statusId: i % 10 === 9 ? 2 : 1,
}));

describe.skipIf(!url)("merit lists and gazette (integration)", () => {
  const sql = postgres(url ?? "postgres://unused", { max: 2, onnotice: () => {} });
  const db = drizzle(sql, { schema });
  const root = mkdtempSync(path.join(tmpdir(), "mn-lists-"));

  const wipe = async () => {
    const rounds = await db.select({ id: schema.meritRounds.id }).from(schema.meritRounds).where(eq(schema.meritRounds.inductionId, IND));
    if (rounds.length) await db.delete(schema.meritRounds).where(inArray(schema.meritRounds.id, rounds.map((r) => r.id)));
    await db.delete(schema.gazettes).where(eq(schema.gazettes.inductionId, IND));
    await db.delete(schema.inductions).where(eq(schema.inductions.id, IND));
    await db.delete(schema.auditLog).where(like(schema.auditLog.entityId, `%induction ${IND}%`));
    await db.delete(schema.auditLog).where(like(schema.auditLog.entityId, `induction:${IND}:%`));
  };
  beforeAll(async () => {
    await wipe();
    const dir = path.join(root, "simulation", `induction${IND}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, `gazette_${IND}.json`), JSON.stringify({ Table5: gazetteRows }));
  });
  afterAll(async () => {
    await wipe();
    await sql.end();
    rmSync(root, { recursive: true, force: true });
  });

  it("publishes the gazette for staff only, keeping the name and no other personal field", async () => {
    await expect(importGazette(db, candidate, { induction: IND, reason: "x" }, { root })).rejects.toThrow("forbidden");
    const r = await importGazette(db, admin, { induction: IND, reason: "PHF gazette" }, { root });
    expect(r).toEqual({ entries: 150, eligible: 135 });
    const rows = await db.select().from(schema.gazetteEntries).where(eq(schema.gazetteEntries.inductionId, IND));
    expect(rows).toHaveLength(150);
    expect(JSON.stringify(rows)).not.toMatch(/3520212345678|03001234567|-P"/);
    expect(rows.find((x) => x.applicantId === "880007")!.candidateName).toBe("Ayesha Rahman");
  });

  it("shows a gazette-only induction as current, with the gazette first", async () => {
    expect(await currentInduction(db, candidate)).toMatchObject({ induction: IND, rounds: [], gazette: { entries: 150 } });
    const lists = await inductionLists(db, candidate, IND);
    expect(lists.current).toBe(true);
    expect(lists.steps.map((s) => s.kind)).toEqual(["gazette"]);
    const info = await gazetteInfo(db, candidate, IND);
    expect(info).toMatchObject({ entries: 150, highest: 80 });
    expect(info!.statuses).toEqual([{ status: "Eligible", value: "Eligible", n: 135 }, { status: "Rejected", value: "Rejected", n: 15 }]);
  });

  it("lists the gazette by marks, a page at a time, filtered by status and searched by name or id", async () => {
    const all = await gazetteList(db, candidate, { induction: IND });
    expect(all).toMatchObject({ total: 150, page: 1, pages: 2 });
    expect(all.rows[0]).toMatchObject({ rank: 1, applicantId: "880000", marksTotal: 80, status: "Eligible", parts: { degree: 40, houseJob: 5 } });
    const second = await gazetteList(db, candidate, { induction: IND, page: 2 });
    expect(second.rows[0]!.rank).toBe(101);
    expect((await gazetteList(db, candidate, { induction: IND, status: "Rejected" })).total).toBe(15);
    expect((await gazetteList(db, candidate, { induction: IND, q: "ayesha" })).rows.map((r) => r.applicantId)).toEqual(["880007"]);
    expect((await gazetteList(db, candidate, { induction: IND, q: "88001" })).total).toBe(10);
    expect((await gazetteList(db, candidate, { induction: IND, q: "100%" })).total).toBe(0);
    expect(await gazetteForApplicant(db, candidate, "880007")).toEqual([expect.objectContaining({ induction: IND, name: "Ayesha Rahman", rank: 8, status: "Eligible" })]);
  });

  it("adds official rounds after the gazette, then offers to simulate the next one", async () => {
    await importMeritRound(db, admin, { roundNo: 1, file: { ...sample, Table: [{ ...sample.Table[0], inductionId: IND }] }, reason: "round 1" });
    // The sample cycle ended in 2025; an active induction is still current.
    await db.update(schema.inductions).set({ status: "active" }).where(eq(schema.inductions.id, IND));
    const lists = await inductionLists(db, candidate, IND);
    expect(lists.steps.map((s) => `${s.kind}:${s.label}`)).toEqual(["gazette:Gazette", "official:Round 1", "simulate:Round 2"]);
    expect(lists.steps[2]!.href).toBe(`/portal/simulation?i=${IND}&base=${encodeURIComponent("published:1")}`);
  });

  it("lists every candidate of a round with name, best marks first, with consent and name filters", async () => {
    const round = (await getRound(db, candidate, IND, 1))!;
    const list = await roundList(db, candidate, { roundId: round.id });
    expect(list.total).toBe(sample.Table5.length);
    const marks = list.rows.map((r) => r.marks);
    expect(marks).toEqual([...marks].sort((a, b) => b - a));
    expect(list.rows[0]!.name).toMatch(/^Test Candidate/);
    const accepted = sample.Table5.filter((r: { consent: string }) => r.consent === "Accepted").length;
    expect((await roundList(db, candidate, { roundId: round.id, filters: { consent: "Accepted" } })).total).toBe(accepted);
    const one = await roundList(db, candidate, { roundId: round.id, filters: { q: "test candidate 0" } });
    expect(one.rows.every((r) => r.name?.toLowerCase().startsWith("test candidate 0"))).toBe(true);
    expect(await roundList(db, null, { roundId: round.id }).catch((e: Error) => e.message)).toBe("unauthenticated");
  });

  it("gives the lowest and highest merit per seat, speciality and hospital", async () => {
    const round = (await getRound(db, candidate, IND, 1))!;
    const seat = await meritRanges(db, candidate, { roundId: round.id, by: "seat" });
    const spec = await meritRanges(db, candidate, { roundId: round.id, by: "speciality" });
    const hosp = await meritRanges(db, candidate, { roundId: round.id, by: "hospital" });
    for (const g of [...seat, ...spec, ...hosp]) expect(g.lowest).toBeLessThanOrEqual(g.highest);
    const total = (xs: { allocations: number }[]) => xs.reduce((n, g) => n + g.allocations, 0);
    expect(total(seat)).toBe(sample.Table5.length);
    expect(total(spec)).toBe(sample.Table5.length);
    expect(total(hosp)).toBe(sample.Table5.length);
    expect(spec.length).toBeLessThanOrEqual(seat.length);
    expect(spec.every((g) => g.hospital === null && g.speciality)).toBe(true);
    expect(seat.every((g) => g.seats != null)).toBe(true);
  });

  it("finds people by name across lists and gazettes, and names estimate rows", async () => {
    const hits = await searchByName(db, candidate, "ayesha rah");
    expect(hits).toEqual([{ applicantId: "880007", name: "Ayesha Rahman", inductions: [IND] }]);
    expect(await searchByName(db, candidate, "ab")).toEqual([]);
    const names = await namesFor(db, candidate, { induction: IND, applicantIds: ["880007", "A1000", "nobody"] });
    expect(names.get("880007")).toBe("Ayesha Rahman");
    expect(names.get("A1000")).toMatch(/^Test Candidate/);
    expect(names.has("nobody")).toBe(false);
  });

  it("treats a finished induction as previous: official rounds only", async () => {
    await db.update(schema.inductions).set({ status: "completed" }).where(eq(schema.inductions.id, IND));
    expect((await currentInduction(db, candidate))?.induction).not.toBe(IND);
    const lists = await inductionLists(db, candidate, IND);
    expect(lists.current).toBe(false);
    expect(lists.steps.map((s) => s.kind)).toEqual(["official"]);
  });
});
