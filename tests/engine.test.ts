import { describe, expect, it } from "vitest";
import { marksContext, effectiveMark, programAliases, programBonus, type EngineCandidate, type Preference } from "@/lib/engine/marks";
import { buildSeatTree, candidatePool, preferenceOutcomes, quotaTrack, runPlacement, type SeatLine } from "@/lib/engine/placement";
import { consentSeatKey, parseConsentTitle, runCascade, type CascadeInput } from "@/lib/engine/cascade";
import { allocationRulesSchema, DEFAULT_RULES, LEGACY_CASCADE_RULES, resolveRules, RulesError, type AllocationRules } from "@/lib/engine/rules";
import type { Policy } from "@/lib/domain/scoring-policy";

const ctx = marksContext();
/** Default rules with both bonuses switched on explicitly and uncapped (no policy needed). */
const on = (over: Partial<AllocationRules> = {}) =>
  resolveRules({
    ...DEFAULT_RULES,
    certificateBonus: { ...DEFAULT_RULES.certificateBonus, enabled: true },
    parentBonus: { ...DEFAULT_RULES.parentBonus, enabled: true },
    ...over,
  });
const rules = on();

const pref = (preferenceNo: number, specialityName: string, hospitalName = "Mayo Hospital", quotaName = "Punjab"): Preference => ({
  preferenceNo,
  specialityName,
  hospitalName,
  quotaName,
  typeName: "FCPS",
});
const cand = (applicantId: number, baseMarks: number, prefs: Preference[]): EngineCandidate => ({
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
const policy = (components: { key: string; max_marks: number; included?: boolean }[]): Policy => ({
  label: "Test",
  induction: 99,
  total_marks: 100,
  components: components.map((c) => ({ ...c, label: c.key, type: "score" as const })),
});

describe("allocation rules", () => {
  it("follows the scoring policy when set to auto: counted components switch bonuses on and cap them", () => {
    const r = resolveRules(DEFAULT_RULES, policy([{ key: "fcps_jcat", max_marks: 5 }, { key: "parent_institute", max_marks: 5, included: false }]));
    expect(r.certificate).toEqual({ on: true, cap: 5 });
    expect(r.parent).toEqual({ on: false, cap: null });
  });

  it("lets an explicit override win over the policy, keeping the policy's cap", () => {
    const p = policy([{ key: "fcps_jcat", max_marks: 5 }]);
    const off = resolveRules({ ...DEFAULT_RULES, certificateBonus: { ...DEFAULT_RULES.certificateBonus, enabled: false } }, p);
    expect(off.certificate).toEqual({ on: false, cap: null });
    const forced = resolveRules({ ...DEFAULT_RULES, parentBonus: { ...DEFAULT_RULES.parentBonus, enabled: true } }, p);
    expect(forced.parent).toEqual({ on: true, cap: null });
  });

  it("refuses auto without a scoring policy", () => {
    expect(() => resolveRules(DEFAULT_RULES)).toThrow(RulesError);
  });

  it("rejects unknown settings", () => {
    expect(allocationRulesSchema.safeParse({ ...DEFAULT_RULES, extra: 1 }).success).toBe(false);
    expect(allocationRulesSchema.safeParse({ ...DEFAULT_RULES, placement: { ...DEFAULT_RULES.placement, displaceWhen: "higherOrEqual" } }).success).toBe(false);
  });
});

describe("marks", () => {
  const certs = [
    { disciplineId: 2, typeId: 1, certificateMarks: 3 },
    { disciplineId: 2, typeId: 1, certificateMarks: 5 },
  ];
  const p = { ...pref(1, "Medicine"), typeId: 1, disciplineIds: [2] };
  const c = { ...cand(1, 50, [p]), certificates: certs };

  it("counts the best matching certificate by default, the first one when the rules say so", () => {
    expect(programBonus(rules, ctx, c, p, "FCPS")).toMatchObject({ bonus: 5, source: "certificateMarks" });
    const first = on({ certificateBonus: { ...rules.certificateBonus, combine: "first" } });
    expect(programBonus(first, ctx, c, p, "FCPS")).toMatchObject({ bonus: 3 });
  });

  it("caps bonuses at the policy component's max marks, and drops them when the policy does not count them", () => {
    const capped = resolveRules(DEFAULT_RULES, policy([{ key: "fcps_jcat", max_marks: 4 }, { key: "parent_institute", max_marks: 1 }]));
    const withParent = { ...p, marks: 2 };
    expect(effectiveMark(capped, ctx, c, "FCPS", withParent)).toBe(50 + 4 + 1);
    const none = resolveRules(DEFAULT_RULES, policy([{ key: "mdcat", max_marks: 2 }]));
    expect(effectiveMark(none, ctx, { ...c, programMarks: { FCPS: 5 } }, "FCPS", withParent)).toBe(50);
    expect(programBonus(none, ctx, c, p, "FCPS").source).toBe("off");
  });

  it("matches the legacy cascade: best certificate, same programme type only, no fallback", () => {
    const legacy = resolveRules(LEGACY_CASCADE_RULES);
    const mixed = { ...c, programMarks: { FCPS: 4 }, certificates: [...certs, { disciplineId: 2, certificateMarks: 5 }, { disciplineId: 2, typeId: 1, computerizedMarks: 4 }] };
    expect(programBonus(legacy, ctx, mixed, p, "FCPS")).toMatchObject({ bonus: 5 });
    // No type on the certificate: ignored under strict matching, so no fallback either.
    const untyped = { ...c, programMarks: { FCPS: 4 }, certificates: [{ disciplineId: 2, certificateMarks: 5 }] };
    expect(programBonus(legacy, ctx, untyped, p, "FCPS").bonus).toBe(0);
    expect(programBonus(rules, ctx, untyped, p, "FCPS").bonus).toBe(5);
  });

  it("only counts passed certificates when the rules require a pass", () => {
    const failed = { ...c, certificates: [{ disciplineId: 2, typeId: 1, certificateMarks: 5, status: "Fail" }] };
    expect(programBonus(rules, ctx, failed, p, "FCPS").bonus).toBe(5);
    const strict = on({ certificateBonus: { ...rules.certificateBonus, requirePass: true } });
    expect(programBonus(strict, ctx, failed, p, "FCPS").bonus).toBe(0);
  });

  it("treats FCPSD and FCPS Dentistry as one programme", () => {
    expect(programAliases("fcpsd")).toEqual(["FCPS Dentistry", "FCPSD"]);
    const d = { ...cand(1, 50, []), preferences: { FCPSD: [pref(1, "Orthodontics")] }, programMarks: { "FCPS Dentistry": 5 } };
    expect(effectiveMark(rules, ctx, d, "FCPSD")).toBe(55);
  });
});

describe("placement", () => {
  it("places the higher mark in a contested seat and the other at their next preference", () => {
    const cs = [cand(1, 60, [pref(1, "Medicine"), pref(2, "Surgery")]), cand(2, 70, [pref(1, "Medicine")])];
    const res = runPlacement(rules, ctx, cs, buildSeatTree([line("Medicine", 1), line("Surgery", 1)], "FCPS"), "FCPS");
    const by = Object.fromEntries(res.candidates.map((w) => [w.applicantId, w.s]));
    expect(by).toEqual({ 1: "Surgery", 2: "Medicine" });
    const one = res.candidates.find((w) => w.applicantId === 1)!;
    expect(preferenceOutcomes(one, res.seatTree).map((o) => o.status)).toEqual(["beaten", "placed"]);
  });

  it("lets a bonus decide a seat: marks, not raw totals, are compared", () => {
    const cs = [
      cand(1, 60, [{ ...pref(1, "Medicine"), marks: 5 }]),
      cand(2, 62, [pref(1, "Medicine")]),
    ];
    const res = runPlacement(rules, ctx, cs, buildSeatTree([line("Medicine", 1)], "FCPS"), "FCPS");
    expect(res.candidates.filter((w) => w.placed).map((w) => w.applicantId)).toEqual([1]);
  });

  it("keeps the holder on a tie", () => {
    const cs = [cand(1, 60, [pref(1, "Medicine")]), cand(2, 60, [pref(1, "Medicine")])];
    const res = runPlacement(rules, ctx, cs, buildSeatTree([line("Medicine", 1)], "FCPS"), "FCPS");
    expect(res.candidates.filter((w) => w.placed).map((w) => w.applicantId)).toEqual([1]);
  });

  it("splits tracks as the rules say: Armed Forces by default, more when configured", () => {
    expect(quotaTrack(rules, "Armed Forces")).toBe("armed");
    expect(quotaTrack(rules, "KPK, Sindh & Balochistan")).toBe("civilian");
    const cs = [cand(1, 60, [pref(1, "Medicine"), pref(2, "Medicine", "CMH", "Armed Forces")])];
    const res = runPlacement(rules, ctx, cs, buildSeatTree([line("Medicine", 1), line("Medicine", 1, "Armed Forces", "CMH")], "FCPS"), "FCPS");
    expect(res.candidates.map((w) => [w.track, w.placed])).toEqual([
      ["civilian", true],
      ["armed", true],
    ]);
    const more = on({ tracks: { separate: [...rules.tracks.separate, { id: "disabled", quotaContains: ["disable"] }], defaultTrack: "civilian" } });
    expect(quotaTrack(more, "Disable")).toBe("disabled");
  });

  it("skips a 0-seat slot instead of failing (the legacy code threw here)", () => {
    const cs = [cand(1, 60, [pref(1, "Medicine"), pref(2, "Surgery")])];
    const res = runPlacement(rules, ctx, cs, buildSeatTree([line("Medicine", 0), line("Surgery", 1)], "FCPS"), "FCPS");
    expect(res.candidates[0]?.s).toBe("Surgery");
  });

  it("leaves out candidates who explicitly did not apply to the programme", () => {
    const yes = cand(1, 60, [pref(1, "Medicine")]);
    const no = { ...cand(2, 90, [pref(1, "Medicine")]), appliedIn: { FCPS: false } };
    expect(candidatePool(rules, ctx, [yes, no], "FCPS").map((c) => c.applicantId)).toEqual([1]);
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

  const prefs = (...xs: [number, number][]) =>
    xs.map(([specialityId, preferenceNo]) => ({ typeName: "FCPS", specialityId, hospitalName: "Mayo Hospital", quotaName: "Punjab", preferenceNo }));
  const scenario = (over: Partial<CascadeInput> = {}): CascadeInput => ({
    rules,
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
    ...over,
  });

  it("gives a rejected seat to the best candidate who listed it above what they hold", () => {
    const res = runCascade(scenario());
    expect(res.placements.map((p) => [p.applicantId, p.specialityName, p.preferenceNo])).toEqual([[20, "Medicine", 1]]);
    expect(res.stats).toMatchObject({ totalUpgrades: 1, finalUnfilled: 1 });
  });

  it("takes eligible profile statuses from the rules", () => {
    const pending = (cid: number) => (cid === 20 ? 11 : 1);
    expect(runCascade(scenario({ profileStatus: pending })).placements).toEqual([]);
    const lenient = on({ cascade: { ...rules.cascade, eligibleProfileStatus: [1, 11] } });
    expect(runCascade(scenario({ rules: lenient, profileStatus: pending })).placements.map((p) => p.applicantId)).toEqual([20]);
  });

  it("uses the shared marks: a certificate bonus counts in the cascade too", () => {
    const res = runCascade(
      scenario({
        candidates: { "20": { marksTotal: 70, preferences: prefs([1, 1]).map((p) => ({ ...p, typeId: 1, disciplineIds: [2] })) } },
        certificates: { "20": [{ typeId: 1, disciplineId: 2, certificateMarks: 5 }] },
        merit: [{ applicantId: 10, typeName: "FCPS", specialityName: "Medicine", hospitalName: "Mayo Hospital", quotaName: "Punjab" }],
      }),
    );
    expect(res.placements).toMatchObject([{ applicantId: 20, effectiveMark: 75, certBonus: 5 }]);
  });
});
