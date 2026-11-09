import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, inArray, like } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "@/lib/auth/roles";
import { createPolicyDraft } from "@/lib/data/policies";
import { importSeatFile } from "@/lib/data/reference-data";
import { estimateList, executeRun, getRun, importConsentRounds, importSimulationDataset, listDatasets, listSimulationFolders, publishEstimate, publishedEstimates, queueFirstRoundRun, queueNextRoundRun } from "@/lib/data/simulation";
import { importMeritRound } from "@/lib/data/merit";
import { getWhatIf, queueWhatIfRun, resetSimulatedConsent, setSimulatedConsent } from "@/lib/data/what-if";
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
    await db.delete(schema.simConsentScenarios).where(eq(schema.simConsentScenarios.inductionId, IND));
    await db.delete(schema.simulationRuns).where(eq(schema.simulationRuns.inductionId, IND));
    await db.delete(schema.candidateLinks).where(like(schema.candidateLinks.applicantId, "5000%"));
    const rs = await db.select({ id: schema.meritRounds.id }).from(schema.meritRounds).where(eq(schema.meritRounds.inductionId, IND));
    if (rs.length) await db.delete(schema.meritRounds).where(inArray(schema.meritRounds.id, rs.map((r) => r.id)));
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

  it("simulates the next round from a published round and its consent replies", async () => {
    // Publish the simulated round 1 as round 1, then reply: every 4th rejects, every 7th has not answered.
    const [first] = await db.select().from(schema.simulationRuns).where(eq(schema.simulationRuns.inductionId, IND)).limit(1);
    const placed = await db.select().from(schema.simulationPlacements).where(eq(schema.simulationPlacements.runId, first!.id));
    const round = {
      Table: [{ inductionId: IND, name: "PHF/30/JAN/01", displayName: "Synthetic", startDate: null, endDate: null }],
      Table5: placed.map((p, i) => ({ rowNo: i + 1, type: p.program, quota: p.quota, specialityJobId: 0, speciality: p.speciality, hospital: p.hospital, institute: "", seats: 1, marks: p.mark, applicantId: p.applicantId, preferenceNo: p.preferenceNo, consent: "" })),
    };
    await importMeritRound(db, owner, { roundNo: 1, file: round, reason: "synthetic round 1" });
    await expect(queueNextRoundRun(db, editor, { induction: IND, fromRound: 1 })).rejects.toThrow(/no consent replies/);

    const replies = placed.map((p, i) => ({
      applicantId: Number(p.applicantId), name: "Synthetic", program: p.program, quota: p.quota, preferenceNo: p.preferenceNo, marks: p.mark,
      infoTitle: `${p.program} - ${p.quota} - ${p.speciality} - ${p.hospital}`, status: i % 4 === 0 ? "Rejected" : i % 7 === 0 ? "Awaited" : "Accepted",
    }));
    writeFileSync(path.join(root, "simulation", `induction${IND}`, "consent_round1.json"), JSON.stringify(replies));
    const rounds = await importConsentRounds(db, editor, { induction: IND, reason: "round 1 consent" }, { root });
    expect(rounds).toMatchObject([{ round: 1, replies: placed.length }]);
    expect(JSON.stringify(await db.select().from(schema.simConsent).where(eq(schema.simConsent.inductionId, IND)))).not.toContain("Synthetic");

    const id = await queueNextRoundRun(db, editor, { induction: IND, fromRound: 1 });
    await executeRun(db, id);
    const run = (await getRun(db, editor, id))!;
    expect(run).toMatchObject({ status: "done", kind: "next_round", fromRound: 1, error: null });
    const s = run.summary!;
    expect(s.comparison).toBeNull(); // round 2 is not published
    expect(s.cascade!.consent).toMatchObject({ round: 1, rejected: replies.filter((r) => r.status === "Rejected").length });
    expect(s.cascade!.initialVacancies).toBeGreaterThan(0);
    const next = await db.select().from(schema.simulationPlacements).where(eq(schema.simulationPlacements.runId, id));
    // Nobody who rejected keeps a seat.
    const rejected = new Set(replies.filter((r) => r.status === "Rejected").map((r) => String(r.applicantId)));
    expect(next.some((p) => rejected.has(p.applicantId))).toBe(false);
    expect(next.length).toBe(s.placed);
    // A run can read Awaited replies differently from the induction's rules, and records it.
    const keepId = await queueNextRoundRun(db, editor, { induction: IND, fromRound: 1, awaitedConsent: "keep" });
    await executeRun(db, keepId);
    const keep = (await getRun(db, editor, keepId))!;
    expect(keep.status).toBe("done");
    expect((keep.rules as { cascade: { awaitedConsent: string } }).cascade.awaitedConsent).toBe("keep");
    expect(keep.summary!.resolved.cascade.awaitedConsent).toBe("keep");
  });

  it("what if: everyone sees the list and may change anyone's consent, privately; official consent untouched", async () => {
    const official = await db.select().from(schema.simConsent).where(eq(schema.simConsent.inductionId, IND));
    const base = { kind: "published" as const, round: 1 };
    // A candidate linked to an applicant who holds a seat in round 1.
    const view0 = await getWhatIf(db, owner, { induction: IND, base });
    const seat = view0.rows.find((r) => r.official === "Accepted")!;
    const cand: Session = { userId: "s-c1", email: "sim-candidate@test.local", role: "candidate", isStub: false };
    const [u] = await db.insert(schema.users).values({ email: cand.email, role: "candidate", displayName: "c" }).onConflictDoUpdate({ target: schema.users.email, set: { role: "candidate" } }).returning();
    await db.insert(schema.candidateLinks).values({ userId: u!.id, applicantId: seat.applicantId, status: "verified", method: "manual" });

    const mine = await getWhatIf(db, cand, { induction: IND, base });
    // The whole list, as on the public site; their own rows are marked.
    expect(mine.rows.length).toBe(view0.total);
    expect(mine.rows.filter((r) => r.mine).every((r) => r.applicantId === seat.applicantId)).toBe(true);
    // Anyone's consent may be changed on their private copy.
    const other = view0.rows.find((r) => r.applicantId !== seat.applicantId)!;
    const flip = other.official === "Rejected" ? "Accepted" : "Rejected";
    await setSimulatedConsent(db, cand, { induction: IND, base, applicantId: other.applicantId, seatKey: other.seatKey, status: flip });
    expect((await getWhatIf(db, cand, { induction: IND, base })).rows.find((r) => r.applicantId === other.applicantId && r.seatKey === other.seatKey)).toMatchObject({ simulated: flip, changed: true });
    await setSimulatedConsent(db, cand, { induction: IND, base, applicantId: other.applicantId, seatKey: other.seatKey, status: null });
    // A member without a linked record can play too.
    const guest: Session = { userId: "s-g1", email: "sim-guest@test.local", role: "candidate", isStub: false };
    expect((await getWhatIf(db, guest, { induction: IND, base })).rows.length).toBe(view0.total);

    await setSimulatedConsent(db, cand, { induction: IND, base, applicantId: seat.applicantId, seatKey: seat.seatKey, status: "Rejected" });
    expect((await getWhatIf(db, cand, { induction: IND, base })).rows.find((r) => r.seatKey === seat.seatKey)).toMatchObject({ simulated: "Rejected", changed: true });
    // Private: the owner's copy is unchanged; the official consent is unchanged.
    expect((await getWhatIf(db, owner, { induction: IND, base })).changes).toBe(0);
    expect(await db.select().from(schema.simConsent).where(eq(schema.simConsent.inductionId, IND))).toEqual(official);

    const id = await queueWhatIfRun(db, cand, { induction: IND, base });
    await executeRun(db, id);
    const run = (await getRun(db, cand, id))!;
    expect(run).toMatchObject({ status: "done", ownerUserId: u!.id, fromRound: 1, baseRunId: null });
    expect(run.summary).toMatchObject({ consentSource: "simulated", consentChanges: 1 });
    // Having rejected, they hold no seat in the simulated round.
    const placed = await db.select().from(schema.simulationPlacements).where(eq(schema.simulationPlacements.runId, id));
    expect(placed.some((p) => p.applicantId === seat.applicantId)).toBe(false);
    // Other people (staff included) cannot open it.
    expect(await getRun(db, owner, id)).toBeNull();

    // Chain: the simulated round is a list too; its consent starts as Awaited.
    const chained = await getWhatIf(db, cand, { induction: IND, base: { kind: "run", runId: id } });
    expect(chained.roundNo).toBe(2);
    expect(chained.counts.Accepted).toBe(0);
    const id2 = await queueWhatIfRun(db, cand, { induction: IND, base: { kind: "run", runId: id } });
    await executeRun(db, id2);
    expect((await getRun(db, cand, id2))).toMatchObject({ status: "done", baseRunId: id, fromRound: 2 });

    await resetSimulatedConsent(db, cand, { induction: IND, base });
    expect((await getWhatIf(db, cand, { induction: IND, base })).changes).toBe(0);
  });

  it("publishes a staff run as an estimated list that every member can open, and takes it down", async () => {
    const id = await queueFirstRoundRun(db, owner, { induction: IND });
    await executeRun(db, id);
    const member: Session = { userId: "s-m1", email: "sim-member@test.local", role: "candidate", isStub: false };
    expect(await getRun(db, member, id)).toBeNull();
    expect(await estimateList(db, member, id)).toBeNull();
    await expect(publishEstimate(db, member, { id, publish: true, reason: "x" })).rejects.toThrow("forbidden");
    await publishEstimate(db, owner, { id, publish: true, reason: "estimate from the gazette" });
    const list = await publishedEstimates(db, member, { induction: IND });
    // Round 1 is already published in this test, so the estimate shows as superseded.
    expect(list.find((e) => e.id === id)).toMatchObject({ induction: IND, roundNo: 1, official: true });
    const est = (await estimateList(db, member, id))!;
    expect(est).toMatchObject({ roundNo: 1, published: true });
    expect(est.rows.length).toBeGreaterThan(0);
    expect(Object.keys(est.rows[0]!).sort()).toEqual(["applicantId", "hospital", "mark", "preferenceNo", "program", "quota", "speciality"]);
    await publishEstimate(db, owner, { id, publish: false, reason: "taken down" });
    expect(await estimateList(db, member, id)).toBeNull();
    expect((await publishedEstimates(db, member, { induction: IND })).some((e) => e.id === id)).toBe(false);
  });
});
