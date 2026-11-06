import { readFileSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { inArray } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "@/lib/auth/roles";
import { importMeritRound } from "@/lib/data/merit";
import { inductionRunning, methodCheck, predictRound } from "@/lib/data/predictions";
import * as schema from "@/lib/db/schema";

/**
 * Predictions against a DISPOSABLE database (TEST_DATABASE_URL). Three finished
 * "past" inductions (961–963) where every closing falls by exactly 1%, 2% and 3%
 * from round 1 to round 2, and a running induction 964 with only round 1.
 */
const url = process.env.TEST_DATABASE_URL;
const sample = JSON.parse(readFileSync(path.join(__dirname, "fixtures/merit_i20_round1_sample.json"), "utf8"));
type Row = (typeof sample.Table5)[number];
const PAST = [[961, -0.01], [962, -0.02], [963, -0.03]] as const, TARGET = 964;
const editor: Session = { userId: "p-ed", email: "editor-pred@test.local", role: "data_editor", isStub: false };
const reader: Session = { userId: "p-r", email: "reader-pred@test.local", role: "candidate", isStub: false };
const file = (ind: number, rows: Row[], future = false) => ({
  ...sample,
  Table: [{ ...sample.Table[0], inductionId: ind, ...(future ? { startDate: "2099-01-01T00:00:00", endDate: "2099-03-01T00:00:00" } : {}) }],
  Table5: rows,
});
const scaled = (k: number) => sample.Table5.map((r: Row) => ({ ...r, marks: r.marks * (1 + k) }));
const first = sample.Table5[0] as Row;
// One extra speciality only the target has: no history of its own, so it falls back to the programme.
const lone: Row = { ...first, rowNo: 9999, applicantId: "LONE1", speciality: "Zzz Lone Speciality", marks: 20 };

describe.skipIf(!url)("predictions (integration)", () => {
  const sql = postgres(url ?? "postgres://unused", { max: 2, onnotice: () => {} });
  const db = drizzle(sql, { schema });
  const all = [...PAST.map(([i]) => i), TARGET];
  const wipe = async () => {
    const rounds = await db.select({ id: schema.meritRounds.id }).from(schema.meritRounds).where(inArray(schema.meritRounds.inductionId, all));
    if (rounds.length) await db.delete(schema.meritRounds).where(inArray(schema.meritRounds.id, rounds.map((r) => r.id)));
    await db.delete(schema.inductions).where(inArray(schema.inductions.id, all));
  };
  beforeAll(async () => {
    await wipe();
    for (const [ind, k] of PAST) {
      await importMeritRound(db, editor, { roundNo: 1, file: file(ind, sample.Table5), reason: "prediction test" });
      await importMeritRound(db, editor, { roundNo: 2, file: file(ind, scaled(k)), reason: "prediction test" });
    }
    await importMeritRound(db, editor, { roundNo: 1, file: file(TARGET, [...sample.Table5, lone], true), reason: "prediction test" });
  });
  afterAll(async () => {
    await wipe();
    await sql.end();
  });

  it("predicts the next round of a running cycle as a range from the other inductions' moves", async () => {
    expect(await inductionRunning(db, TARGET)).toBe(true);
    expect(await inductionRunning(db, 961)).toBe(false);
    const p = await predictRound(db, reader, { induction: TARGET, fromRound: 1 });
    expect(p).toMatchObject({ toRound: 2, hasActual: false });
    expect(p.method.inductions).toEqual([961, 962, 963]);

    const spec = p.specialities.find((r) => r.speciality === first.speciality && r.program === first.type && r.quota === first.quota)!;
    const closing = Math.min(...sample.Table5.filter((r: Row) => r.speciality === first.speciality && r.type === first.type && r.quota === first.quota).map((r: Row) => r.marks));
    // Past moves −3%, −2%, −1%: the 20th–80th percentile is −2.6% … −1.4%, rounded outwards.
    expect(spec).toMatchObject({ n: 3, confidence: "Low", fallback: false, actual: null, inside: null });
    expect(spec.low).toBe(Math.floor(closing * 0.974 * 100 + 1e-9) / 100);
    expect(spec.high).toBe(Math.ceil(closing * 0.986 * 100 - 1e-9) / 100);
    expect(p.hospitals.get(`${first.type}|${first.quota}|${first.speciality}|${first.hospital}`)).toBeTruthy();

    const fallback = p.specialities.find((r) => r.speciality === "Zzz Lone Speciality")!;
    expect(fallback).toMatchObject({ fallback: true, confidence: "Low" });
    expect(fallback.n).toBeGreaterThan(3);
    expect(JSON.stringify(p.specialities)).not.toMatch(/A1\d{3}|LONE1/);
  });

  it("checks the method on finished inductions using the others", async () => {
    // Induction 962 (−2%) sits between the others' −1% and −3%: every range holds.
    expect((await methodCheck(db, reader, { induction: 962 })).share).toBe(1);
    // Induction 961 (−1%) is outside what 962 and 963 (−2%, −3%) suggest: none hold.
    const m = await methodCheck(db, reader, { induction: 961 });
    expect(m.share).toBe(0);
    expect(m.transitions[0]).toMatchObject({ from: 1, to: 2 });
    expect(m.transitions[0]!.medianMiss).toBeGreaterThan(0);

    const back = await predictRound(db, reader, { induction: 962, fromRound: 1 });
    expect(back.hasActual).toBe(true);
    expect(back.specialities.every((r) => r.inside === true)).toBe(true);
    await expect(predictRound(db, null, { induction: TARGET, fromRound: 1 })).rejects.toThrow("unauthenticated");
  });
});
