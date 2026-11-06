import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, inArray } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "@/lib/auth/roles";
import { createPolicyDraft } from "@/lib/data/policies";
import { importSeatFile } from "@/lib/data/reference-data";
import { executeRun, getRun, importSimulationDataset, listDatasets, listSimulationFolders, queueFirstRoundRun } from "@/lib/data/simulation";
import * as schema from "@/lib/db/schema";

/** DISPOSABLE database only (TEST_DATABASE_URL). Uses induction 970 and policy key "1996". Synthetic candidates. */
const url = process.env.TEST_DATABASE_URL;
const fx = (f: string) => JSON.parse(readFileSync(path.join(__dirname, "fixtures", f), "utf8"));
const seats = fx("seats_induction21.json").slice(0, 30) as Record<string, string | number>[];
const policies = fx("scoring_policy.json").policies;
const IND = 970;
const editor: Session = { userId: "s-de", email: "sim-editor@test.local", role: "data_editor", isStub: false };
const owner: Session = { userId: "s-ow", email: "sim-owner@test.local", role: "owner", isStub: false };
const viewer: Session = { userId: "s-mo", email: "sim-moderator@test.local", role: "moderator", isStub: false };

// Synthetic candidates over the fixture's seat lines, carrying personal fields that must not be stored.
const candidates: Record<string, unknown> = {};
for (let i = 0; i < 60; i++) {
  const id = 500000 + i;
  const prefs = [0, 7, 13, 21].map((k, n) => {
    const s = seats[(i + k) % seats.length]!;
    return { specialityId: s.specialityId, typeName: s.typeName, typeId: s.typeId, hospitalName: s.hospitalName, instituteName: s.instituteName, preferenceNo: n + 1, quotaName: s.quotaName, programMarks: 0, disciplineIds: [], marks: 0, parentInstitute: false };
  });
  candidates[String(id)] = { applicantId: id, nameFull: `Synthetic Name ${i}`, emailId: `synthetic${i}@example.test`, pmdcNo: `PMDC-${i}`, marksTotal: 40 + ((i * 7) % 30), applied_in: { [String(seats[0]!.typeName)]: true }, preferences: prefs };
}
const status = { entries: Object.keys(candidates).map((id, i) => ({ applicantId: Number(id), statusId: i % 10 === 0 ? 2 : 1, statusTypeId: 131, remarks: "private" })) };

describe.skipIf(!url)("simulation data and runs (integration)", () => {
  const sql = postgres(url ?? "postgres://unused", { max: 2, onnotice: () => {} });
  const db = drizzle(sql, { schema });
  const root = mkdtempSync(path.join(tmpdir(), "mn-sim-"));

  const wipe = async () => {
    await db.delete(schema.simulationRuns).where(eq(schema.simulationRuns.inductionId, IND));
    await db.delete(schema.simDatasets).where(eq(schema.simDatasets.inductionId, IND));
    await db.delete(schema.inductionSeats).where(eq(schema.inductionSeats.inductionId, IND));
    await db.delete(schema.inductions).where(eq(schema.inductions.id, IND));
    await db.delete(schema.scoringPolicies).where(eq(schema.scoringPolicies.policyKey, "1996"));
    const ids = (k: string) => [...new Set(seats.map((r) => Number(r[k])))];
    await db.delete(schema.programs).where(inArray(schema.programs.id, ids("typeId")));
    await db.delete(schema.quotas).where(inArray(schema.quotas.id, ids("quotaId")));
    await db.delete(schema.specialities).where(inArray(schema.specialities.id, ids("specialityId")));
    await db.delete(schema.institutes).where(inArray(schema.institutes.id, ids("instituteId")));
    await db.delete(schema.hospitals).where(inArray(schema.hospitals.id, ids("hospitalId")));
  };
  beforeAll(async () => {
    await wipe();
    const dir = path.join(root, "simulation", `induction${IND}`);
    mkdirSync(dir, { recursive: true });
    // The split format the backend writes: marks, preferences (one row each), status.
    const all = Object.values(candidates) as { applicantId: number; preferences: object[]; [k: string]: unknown }[];
    writeFileSync(path.join(dir, "marks.json"), JSON.stringify(all.map((c) => Object.fromEntries(Object.entries(c).filter(([k]) => k !== "preferences")))));
    writeFileSync(path.join(dir, "preferences.json"), JSON.stringify(all.flatMap((c) => c.preferences.map((p) => ({ applicantId: c.applicantId, ...p })))));
    writeFileSync(path.join(dir, "ProfileStatus.json"), JSON.stringify(status));
    writeFileSync(path.join(dir, "notes.txt"), "ignored");
  });
  afterAll(async () => {
    await wipe();
    await sql.end();
    rmSync(root, { recursive: true, force: true });
  });

  it("lists the induction folder with its recognised files", async () => {
    const [f] = (await listSimulationFolders(viewer, { root })).filter((x) => x.induction === IND);
    expect(f!.files.map((x) => x.role).sort()).toEqual(["marks", "preferences", "profileStatus"]);
    expect(f!.ignored).toEqual(["notes.txt"]);
  });

  it("imports only engine fields, needs the data capability, and replaces on re-import", async () => {
    await expect(importSimulationDataset(db, viewer, { induction: IND, reason: "x" }, { root })).rejects.toThrow("forbidden");
    const s = await importSimulationDataset(db, editor, { induction: IND, reason: "synthetic" }, { root });
    expect(s).toMatchObject({ candidates: 60, preferences: 240, withStatus: 60, eligible: 54 });
    const stored = JSON.stringify([
      await db.select().from(schema.simCandidates).where(eq(schema.simCandidates.inductionId, IND)),
      await db.select().from(schema.simPreferences).where(eq(schema.simPreferences.inductionId, IND)),
      await db.select().from(schema.simDatasets).where(eq(schema.simDatasets.inductionId, IND)),
    ]);
    expect(stored).not.toMatch(/Synthetic Name|example\.test|PMDC-|private/);
    await importSimulationDataset(db, editor, { induction: IND, reason: "again" }, { root });
    expect((await db.select().from(schema.simCandidates).where(eq(schema.simCandidates.inductionId, IND))).length).toBe(60);
    const ds = (await listDatasets(db, editor)).find((d) => d.inductionId === IND)!;
    expect(ds.sources.map((x) => x.role).sort()).toEqual(["marks", "preferences", "profileStatus"]);
    expect(ds.summary.format).toBe("split");
  });

  it("refuses to run without seats or a policy for auto bonuses", async () => {
    await expect(queueFirstRoundRun(db, editor, { induction: IND })).rejects.toThrow(/seat matrix/);
    await importSeatFile(db, owner, { induction: IND, calendarYear: 2030, file: seats, reason: "synthetic" });
    await expect(queueFirstRoundRun(db, editor, { induction: IND })).rejects.toThrow(/scoring policy/);
  });

  it("runs round 1 with the induction's rules and records what it used", async () => {
    await createPolicyDraft(db, owner, { policyKey: "1996", definition: { ...policies["2026"], induction: IND }, reason: "synthetic" });
    const id = await queueFirstRoundRun(db, editor, { induction: IND });
    await executeRun(db, id);
    const run = (await getRun(db, editor, id))!;
    expect(run).toMatchObject({ status: "done", rulesOrigin: "default", policy: "1996 v1", error: null });
    expect(run.summary).toMatchObject({ candidates: 60, eligible: 54, unnamedPreferences: 0, comparison: null });
    const placements = await db.select().from(schema.simulationPlacements).where(eq(schema.simulationPlacements.runId, id));
    expect(placements.length).toBe(run.summary!.placed);
    expect(placements.length).toBeGreaterThan(0);
    // Rejected profiles (every 10th synthetic candidate) take no seat.
    expect(placements.some((p) => (Number(p.applicantId) - 500000) % 10 === 0)).toBe(false);
    // A run executes once.
    await executeRun(db, id);
    expect((await db.select().from(schema.simulationPlacements).where(eq(schema.simulationPlacements.runId, id))).length).toBe(placements.length);
  });
});
