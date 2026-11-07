import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, inArray, like } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "@/lib/auth/roles";
import { candidateRecord, duplicateGroups, exportRecordsCsv, revokeCorrection, searchRecords } from "@/lib/data/candidate-records";
import { indexCandidates } from "@/lib/data/candidates";
import { getChange, proposeCorrections, proposeRulesActivation, publishChange, rollbackChange } from "@/lib/data/changes";
import { importMeritRound } from "@/lib/data/merit";
import { createPolicyDraft } from "@/lib/data/policies";
import { importSeatFile } from "@/lib/data/reference-data";
import { createRulesDraft } from "@/lib/data/allocation-rules";
import { candidateSimRecord, executeRun, firstRoundImpact, importSimulationDataset, queueFirstRoundRun, runOutput } from "@/lib/data/simulation";
import { DEFAULT_RULES, resolveRules } from "@/lib/engine/rules";
import * as schema from "@/lib/db/schema";
import type { MeritRoundFile } from "@/lib/domain/merit-round";

/** DISPOSABLE database only (TEST_DATABASE_URL). Uses induction 971, applicant ids 6100xx and policy key "1995". Synthetic. */
const url = process.env.TEST_DATABASE_URL;
const fx = (f: string) => JSON.parse(readFileSync(path.join(__dirname, "fixtures", f), "utf8"));
const seats = fx("seats_induction21.json").slice(0, 20) as Record<string, string | number>[];
const policies = fx("scoring_policy.json").policies;
const IND = 971;
const verifier: Session = { userId: "cr-v", email: "cr-verifier@test.local", role: "verifier", isStub: false };
const editor: Session = { userId: "cr-e", email: "cr-editor@test.local", role: "data_editor", isStub: false };
const owner: Session = { userId: "cr-o", email: "cr-owner@test.local", role: "owner", isStub: false };
const moderator: Session = { userId: "cr-m", email: "cr-moderator@test.local", role: "moderator", isStub: false };
const program = String(seats[0]!.typeName).trim();

const marks = Array.from({ length: 20 }, (_, i) => ({ applicantId: 610000 + i, marksTotal: 50 + i, programMarks: { [program]: 2 }, applied_in: { [program]: true }, profileStatus: 1, nameFull: "Private Name" }));
const prefs = marks.flatMap((m, i) => [0, 5, 11].map((k, n) => {
  const s = seats[(i + k) % seats.length]!;
  return { applicantId: m.applicantId, typeName: s.typeName, typeId: s.typeId, preferenceNo: n + 1, quotaName: s.quotaName, specialityId: s.specialityId, hospitalName: s.hospitalName, disciplineIds: [] };
}));

describe.skipIf(!url)("candidate records and corrections (integration)", () => {
  const sql = postgres(url ?? "postgres://unused", { max: 2, onnotice: () => {} });
  const db = drizzle(sql, { schema });
  const root = mkdtempSync(path.join(tmpdir(), "mn-cr-"));

  const wipe = async () => {
    await db.delete(schema.candidateCorrections).where(eq(schema.candidateCorrections.inductionId, IND));
    await db.delete(schema.stagedChanges).where(like(schema.stagedChanges.target, `corrections:${IND}:%`));
    await db.delete(schema.simulationRuns).where(eq(schema.simulationRuns.inductionId, IND));
    await db.delete(schema.candidateIdentities).where(like(schema.candidateIdentities.applicantId, "6100%"));
    const rs = await db.select({ id: schema.meritRounds.id }).from(schema.meritRounds).where(eq(schema.meritRounds.inductionId, IND));
    if (rs.length) await db.delete(schema.meritRounds).where(inArray(schema.meritRounds.id, rs.map((r) => r.id)));
    await db.delete(schema.simDatasets).where(eq(schema.simDatasets.inductionId, IND));
    await db.delete(schema.inductionSeats).where(eq(schema.inductionSeats.inductionId, IND));
    await db.delete(schema.inductions).where(eq(schema.inductions.id, IND));
    await db.delete(schema.scoringPolicies).where(eq(schema.scoringPolicies.policyKey, "1995"));
    await db.delete(schema.stagedChanges).where(eq(schema.stagedChanges.target, `rules:${IND}`));
    await db.delete(schema.allocationRules).where(eq(schema.allocationRules.inductionId, IND));
  };

  beforeAll(async () => {
    await wipe();
    const dir = path.join(root, "simulation", `induction${IND}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "marks.json"), JSON.stringify(marks));
    writeFileSync(path.join(dir, "preferences.json"), JSON.stringify(prefs));
    await importSimulationDataset(db, editor, { induction: IND, reason: "synthetic" }, { root });
    await importSeatFile(db, owner, { induction: IND, calendarYear: 2031, file: seats, reason: "synthetic" });
    await createPolicyDraft(db, owner, { policyKey: "1995", definition: { ...policies["2026"], induction: IND }, reason: "synthetic" });
    const s = seats[0]!;
    await importMeritRound(db, owner, {
      roundNo: 1,
      file: {
        Table: [{ inductionId: IND, name: "PHF/31/JAN/01", displayName: "Synthetic", startDate: null, endDate: null }],
        Table5: [610019, 610018].map((id, i) => ({ rowNo: i + 1, type: s.typeName, quota: s.quotaName, specialityJobId: 0, speciality: s.specialityName, hospital: s.hospitalName, institute: "", seats: 1, marks: 69 - i, applicantId: String(id), preferenceNo: 1, consent: "Accepted" })),
      },
      reason: "synthetic round",
    });
    // Two applicant ids that share an email on the official record.
    await indexCandidates(db, { Table: [{ inductionId: IND }], Table5: [{ applicantId: "610001", emailId: "same@example.test" }, { applicantId: "610002", emailId: "Same@Example.test" }, { applicantId: "610003", emailId: "other@example.test" }] } as unknown as MeritRoundFile);
  });
  afterAll(async () => {
    await wipe();
    await sql.end();
    rmSync(root, { recursive: true, force: true });
  });

  it("only staff who handle candidate records can search them", async () => {
    await expect(searchRecords(db, moderator, { induction: IND })).rejects.toThrow("forbidden");
    await expect(searchRecords(db, editor, { induction: IND })).rejects.toThrow("forbidden");
    const all = await searchRecords(db, verifier, { induction: IND });
    expect(all.total).toBe(20);
    expect(all.programs).toContain(program);
    const placed = await searchRecords(db, verifier, { induction: IND, filter: "placed" });
    expect(placed.rows.map((r) => r.applicantId).sort()).toEqual(["610018", "610019"]);
    expect(placed.rows.find((r) => r.applicantId === "610019")).toMatchObject({ lastRound: 1, bestMarks: 69, baseMarks: 69, profileStatus: "Accepted" });
    expect((await searchRecords(db, verifier, { induction: IND, q: "61001" })).total).toBe(10);
    expect((await searchRecords(db, verifier, { induction: IND, q: " 610-001 " })).rows.map((r) => r.applicantId)).toEqual(["610001"]);
  });

  it("shows one applicant's record with marks per preference and duplicates", async () => {
    const r = (await candidateRecord(db, verifier, "610001"))!;
    expect(r.inductions).toEqual([IND]);
    expect(r.possibleDuplicates).toEqual([{ applicantId: "610002", by: "email" }]);
    const sim = (await candidateSimRecord(db, verifier, { induction: IND, applicantId: "610001" }))!;
    expect(sim.imported.baseMarks).toBe(51);
    expect(sim.programmes[0]!.preferences).toHaveLength(3);
    expect(sim.programmes[0]!.preferences[0]!.mark).toBeGreaterThanOrEqual(51);
    expect(JSON.stringify(r)).not.toMatch(/Private Name|example\.test/);
    expect(await candidateRecord(db, verifier, "999999999")).toBeNull();
    const dup = await duplicateGroups(db, verifier);
    expect(dup.groups.find((g) => g.applicantIds.includes("610001"))).toMatchObject({ by: "email", applicantIds: ["610001", "610002"] });
  });

  it("stages corrections, applies them to runs, and rolls them back", async () => {
    await expect(proposeCorrections(db, verifier, { induction: IND, corrections: [{ applicantId: "777", field: "base_marks", value: 1 }], reason: "x" })).rejects.toThrow(/Not in induction/);
    await expect(proposeCorrections(db, verifier, { induction: IND, corrections: [{ applicantId: "610000", field: "program_marks", program: "Nope", value: 1 }], reason: "x" })).rejects.toThrow(/no programme/);
    await expect(proposeCorrections(db, verifier, { induction: IND, corrections: [{ applicantId: "610000", field: "base_marks", value: 1 }], reason: "" })).rejects.toThrow(/reason/);
    expect(await proposeCorrections(db, verifier, { induction: IND, corrections: [{ applicantId: "610000", field: "base_marks", value: 50 }], reason: "same" })).toMatchObject({ applied: true });

    // The lowest-marked applicant jumps to the top; a rejected profile drops out.
    const p = await proposeCorrections(db, verifier, {
      induction: IND,
      corrections: [{ applicantId: "610000", field: "base_marks", value: 99 }, { applicantId: "610019", field: "profile_status", value: 2 }],
      reason: "grievance", source: "file",
    });
    expect(p.applied).toBe(false);
    const changeId = (p as { changeId: string }).changeId;
    expect((await getChange(db, moderator, changeId))!.preview).toBeNull();
    expect((await getChange(db, verifier, changeId))!.preview).toMatchObject({ applicants: 2, rows: [{ applicantId: "610000", from: 50, to: 99 }, { applicantId: "610019", from: 1, to: 2 }] });
    await expect(publishChange(db, editor, { id: changeId, reason: "ok" })).rejects.toThrow("forbidden");
    await publishChange(db, verifier, { id: changeId, reason: "ok" });

    const sim = (await candidateSimRecord(db, verifier, { induction: IND, applicantId: "610000" }))!;
    expect(sim).toMatchObject({ imported: { baseMarks: 50 }, effective: { baseMarks: 99 } });
    const runId = await queueFirstRoundRun(db, editor, { induction: IND });
    await executeRun(db, runId);
    const placed = await db.select().from(schema.simulationPlacements).where(eq(schema.simulationPlacements.runId, runId));
    expect(placed.find((x) => x.applicantId === "610000")?.mark).toBeGreaterThanOrEqual(99);
    expect(placed.some((x) => x.applicantId === "610019")).toBe(false);

    // The run's own output, as a versioned download.
    await expect(runOutput(db, verifier, { id: runId, format: "csv" })).rejects.toThrow("forbidden");
    const out = await runOutput(db, editor, { id: runId, format: "csv" });
    expect(out.filename).toMatch(new RegExp(`^induction${IND}_round1_simulated_\\d{8}T\\d{6}Z_${runId.slice(0, 8)}\\.csv$`));
    expect(out.body.split("\r\n").length - 2).toBe(placed.length);
    const json = JSON.parse((await runOutput(db, editor, { id: runId, format: "json" })).body);
    expect(json).toMatchObject({ simulated: true, run: { induction: IND, round: 1 }, inputs: { rulesOrigin: "default", policy: "1995 v1" } });
    expect(json.placements).toHaveLength(placed.length);

    const csv = (await exportRecordsCsv(db, verifier, IND)).csv;
    expect(csv.split("\r\n")[0]).toMatch(/^applicant_id,base_marks,program_marks:/);
    expect(csv).toMatch(/\r\n610000,99,.*,yes,50,/);
    expect(csv).not.toMatch(/Private Name/);

    await rollbackChange(db, verifier, { id: changeId, reason: "undo" });
    expect((await candidateSimRecord(db, verifier, { induction: IND, applicantId: "610000" }))!.effective.baseMarks).toBe(50);
  });

  it("withdraws a single correction", async () => {
    const p = await proposeCorrections(db, verifier, { induction: IND, corrections: [{ applicantId: "610005", field: "program_marks", program, value: 7 }], reason: "certificate verified" });
    await publishChange(db, verifier, { id: (p as { changeId: string }).changeId, reason: "ok" });
    const r = (await candidateRecord(db, verifier, "610005"))!;
    expect(r.corrections).toHaveLength(1);
    expect((await candidateSimRecord(db, verifier, { induction: IND, applicantId: "610005" }))!.effective.programMarks[program]).toBe(7);
    await expect(revokeCorrection(db, moderator, { id: r.corrections[0]!.id, reason: "x" })).rejects.toThrow("forbidden");
    await revokeCorrection(db, verifier, { id: r.corrections[0]!.id, reason: "entered on the wrong applicant" });
    await expect(revokeCorrection(db, verifier, { id: r.corrections[0]!.id, reason: "again" })).rejects.toThrow(/already/);
    expect((await candidateSimRecord(db, verifier, { induction: IND, applicantId: "610005" }))!.effective.programMarks[program]).toBe(2);
  });

  it("previews what a rules change does to round 1", async () => {
    const policy = { ...policies["2026"], induction: IND };
    const same = await firstRoundImpact(db, moderator, { induction: IND, next: resolveRules(DEFAULT_RULES, policy) });
    expect(same.status).toBe("same");
    expect((await firstRoundImpact(db, moderator, { induction: 970_001, next: resolveRules(DEFAULT_RULES, policy) })).status).toBe("no_data");

    // Without the certificate bonus everyone loses their 2 programme marks: same seats, lower closing merit.
    const noBonus = { ...DEFAULT_RULES, certificateBonus: { ...DEFAULT_RULES.certificateBonus, enabled: false } };
    const impact = await firstRoundImpact(db, moderator, { induction: IND, next: resolveRules(noBonus, policy) });
    expect(impact).toMatchObject({ status: "computed", candidates: 20, moved: 0, gained: 0, lost: 0 });
    if (impact.status !== "computed") throw new Error("not computed");
    expect(impact.groupsChanged).toBeGreaterThan(0);
    expect(impact.topChanges[0]!.from! - impact.topChanges[0]!.to!).toBeCloseTo(2);
    expect(JSON.stringify(impact)).not.toMatch(/6100\d\d/);

    const draft = await createRulesDraft(db, owner, { induction: IND, definition: noBonus, reason: "try without bonus" });
    const p = await proposeRulesActivation(db, owner, { id: draft.id, reason: "see the effect" });
    const change = (await getChange(db, moderator, (p as { changeId: string }).changeId))!;
    expect((change.preview as { impact: { status: string; groupsChanged: number } }).impact).toMatchObject({ status: "computed", groupsChanged: impact.groupsChanged });
  });
});
