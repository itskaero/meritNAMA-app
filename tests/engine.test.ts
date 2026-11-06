import { describe, expect, it } from "vitest";
import { marksContext, effectiveMark, programAliases, type EngineCandidate } from "@/lib/engine/marks";
import { buildSeatTree, candidatePool, preferenceOutcomes, quotaTrack, runPlacement, type SeatLine } from "@/lib/engine/placement";
import { consentSeatKey, parseConsentTitle, runCascade } from "@/lib/engine/cascade";

const ctx = marksContext();
const pref = (preferenceNo: number, specialityName: string, hospitalName = "Mayo Hospital", quotaName = "Punjab") => ({
  preferenceNo,
  specialityName,
  hospitalName,
  quotaName,
  typeName: "FCPS",
});
const cand = (applicantId: number, baseMarks: number, prefs: ReturnType<typeof pref>[]): EngineCandidate => ({
  applicantId,
  baseMarks,
  preferences: { FCPS: prefs },
});
const line = (specialityName: string, seats: number, quotaName = "Punjab", hospitalName = "Mayo Hospital"): SeatLine => ({
  typeName: "FCPS",
  quotaName,
  specialityName,
  hospitalName,
  seats,
});

describe("placement", () => {
  it("places the higher mark in a contested seat and the other at their next preference", () => {
    const cs = [cand(1, 60, [pref(1, "Medicine"), pref(2, "Surgery")]), cand(2, 70, [pref(1, "Medicine")])];
    const res = runPlacement(ctx, cs, buildSeatTree([line("Medicine", 1), line("Surgery", 1)], "FCPS"), "FCPS");
    const by = Object.fromEntries(res.candidates.map((w) => [w.applicantId, w.s]));
    expect(by).toEqual({ 1: "Surgery", 2: "Medicine" });
    const one = res.candidates.find((w) => w.applicantId === 1)!;
    expect(preferenceOutcomes(one, res.seatTree).map((o) => o.status)).toEqual(["beaten", "placed"]);
  });

  it("treats Armed Forces preferences as a separate track with its own seat", () => {
    expect(quotaTrack("Armed Forces")).toBe("armed");
    expect(quotaTrack("KPK, Sindh & Balochistan")).toBe("civilian");
    const cs = [cand(1, 60, [pref(1, "Medicine"), pref(2, "Medicine", "CMH", "Armed Forces")])];
    const res = runPlacement(ctx, cs, buildSeatTree([line("Medicine", 1), line("Medicine", 1, "Armed Forces", "CMH")], "FCPS"), "FCPS");
    expect(res.candidates.map((w) => [w.track, w.placed])).toEqual([
      ["civilian", true],
      ["armed", true],
    ]);
  });

  it("skips a 0-seat slot instead of failing (the legacy code threw here)", () => {
    const cs = [cand(1, 60, [pref(1, "Medicine"), pref(2, "Surgery")])];
    const res = runPlacement(ctx, cs, buildSeatTree([line("Medicine", 0), line("Surgery", 1)], "FCPS"), "FCPS");
    expect(res.candidates[0]?.s).toBe("Surgery");
  });

  it("leaves out candidates who explicitly did not apply to the programme", () => {
    const yes = cand(1, 60, [pref(1, "Medicine")]);
    const no = { ...cand(2, 90, [pref(1, "Medicine")]), appliedIn: { FCPS: false } };
    expect(candidatePool(ctx, [yes, no], "FCPS").map((c) => c.applicantId)).toEqual([1]);
    expect(effectiveMark(ctx, no, "FCPS")).toBeNull();
  });

  it("treats FCPSD and FCPS Dentistry as one programme", () => {
    expect(programAliases("fcpsd")).toEqual(["FCPS Dentistry", "FCPSD"]);
    const c = { ...cand(1, 50, []), preferences: { FCPSD: [pref(1, "Orthodontics")] }, programMarks: { "FCPS Dentistry": 5 } };
    expect(effectiveMark(ctx, c, "FCPSD")).toBe(55);
  });
});

describe("cascade", () => {
  it("parses published consent titles into seat keys", () => {
    expect(parseConsentTitle("FCPS - Punjab - Medicine - Unit 2 - Mayo Hospital")).toEqual({
      typeName: "FCPS",
      quotaName: "Punjab",
      specialityName: "Medicine",
      hospitalName: "Mayo Hospital",
    });
    expect(parseConsentTitle("too - short")).toBeNull();
    expect(consentSeatKey({ applicantId: 1, status: "Accepted", preferenceNo: 1, infoTitle: "FCPS - Punjab - Medicine - Mayo Hospital" })).toBe(
      "FCPS|Medicine|Mayo Hospital|Punjab",
    );
  });

  it("gives a rejected seat to the best candidate who listed it above what they hold", () => {
    const prefs = (...xs: [number, number][]) => xs.map(([specialityId, preferenceNo]) => ({ typeName: "FCPS", specialityId, hospitalName: "Mayo Hospital", quotaName: "Punjab", preferenceNo }));
    const res = runCascade({
      seats: [line("Medicine", 1), line("Surgery", 1)],
      specialityNames: { 1: "Medicine", 2: "Surgery" },
      candidates: { "10": { marksTotal: 80, preferences: prefs([1, 1]) }, "20": { marksTotal: 70, preferences: prefs([1, 1], [2, 2]) } },
      certificates: {},
      merit: [
        { applicantId: 10, typeName: "FCPS", specialityName: "Medicine", hospitalName: "Mayo Hospital", quotaName: "Punjab" },
        { applicantId: 20, typeName: "FCPS", specialityName: "Surgery", hospitalName: "Mayo Hospital", quotaName: "Punjab" },
      ],
      consent: [{ applicantId: 10, status: "Rejected", preferenceNo: 1, infoTitle: "FCPS - Punjab - Medicine - Mayo Hospital" }],
      profileStatus: () => 1,
    });
    expect(res.placements.map((p) => [p.applicantId, p.specialityName, p.preferenceNo])).toEqual([[20, "Medicine", 1]]);
    expect(res.stats).toMatchObject({ totalUpgrades: 1, finalUnfilled: 1 });
  });
});
