import { readFileSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, inArray } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "@/lib/auth/roles";
import { inductionTracks, roundSettling } from "@/lib/data/insights";
import { importMeritRound } from "@/lib/data/merit";
import * as schema from "@/lib/db/schema";

/**
 * Merit visuals' aggregates against a DISPOSABLE database (TEST_DATABASE_URL).
 * Imports the sample as round 1 and an edited copy as round 2 at induction 950.
 */
const url = process.env.TEST_DATABASE_URL;
const sample = JSON.parse(readFileSync(path.join(__dirname, "fixtures/merit_i20_round1_sample.json"), "utf8"));
const IND = 950;
type Row = (typeof sample.Table5)[number];
const editor: Session = { userId: "i-ed", email: "editor-insights@test.local", role: "data_editor", isStub: false };
const reader: Session = { userId: "i-r", email: "reader-insights@test.local", role: "candidate", isStub: false };

// Round 2: A1001 leaves, A1002 moves hospital, A9999 enters; everyone else stays.
const r1: Row[] = sample.Table5;
const r2: Row[] = [
  ...r1.filter((r) => r.applicantId !== "A1001").map((r) => (r.applicantId === "A1002" ? { ...r, hospital: "Mayo Hospital, Lahore" } : r)),
  { ...r1[3], rowNo: 999, applicantId: "A9999" },
];
const file = (rows: Row[]) => ({ ...sample, Table: [{ ...sample.Table[0], inductionId: IND }], Table5: rows });
const applicants = (rows: Row[]) => new Set(rows.map((r) => r.applicantId)).size;

describe.skipIf(!url)("merit insights (integration)", () => {
  const sql = postgres(url ?? "postgres://unused", { max: 2, onnotice: () => {} });
  const db = drizzle(sql, { schema });
  const wipe = async () => {
    const rounds = await db.select({ id: schema.meritRounds.id }).from(schema.meritRounds).where(eq(schema.meritRounds.inductionId, IND));
    if (rounds.length) await db.delete(schema.meritRounds).where(inArray(schema.meritRounds.id, rounds.map((r) => r.id)));
    await db.delete(schema.inductions).where(eq(schema.inductions.id, IND));
  };
  beforeAll(async () => {
    await wipe();
    await importMeritRound(db, editor, { roundNo: 1, file: file(r1), reason: "insights test" });
    await importMeritRound(db, editor, { roundNo: 2, file: file(r2), reason: "insights test" });
  });
  afterAll(async () => {
    await wipe();
    await sql.end();
  });

  it("counts who is still moving, and who entered, moved or left", async () => {
    const s = await roundSettling(db, reader, IND);
    expect(s.final).toBe(applicants(r2));
    const [one, two] = s.rounds;
    expect(one).toMatchObject({ roundNo: 1, holding: applicants(r1), entered: applicants(r1), moved: 0, left: 0 });
    // Not yet in the final seat after round 1: A1002 (moved) and A9999 (absent).
    expect(one!.moving).toBe(2);
    expect(two).toMatchObject({ roundNo: 2, holding: applicants(r2), moving: 0, entered: 1, moved: 1, left: 1 });
  });

  it("filters by programme and quota, and refuses anonymous callers", async () => {
    const tracks = await inductionTracks(db, reader, IND);
    expect(tracks[0]!.value).toMatch(/\|/);
    const one = await roundSettling(db, reader, IND, tracks[0]!.value);
    expect(one.final).toBeLessThanOrEqual(applicants(r2));
    await expect(roundSettling(db, null, IND)).rejects.toThrow("unauthenticated");
    await expect(roundSettling(db, reader, IND, "no-pipe")).rejects.toThrow();
  });
});
