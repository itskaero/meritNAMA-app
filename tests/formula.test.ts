import { describe, expect, it } from "vitest";
import { effectiveCandidates } from "@/lib/domain/corrections";
import { numericParameters, sanitizeSimDataset } from "@/lib/domain/sim-dataset";
import { certificateParameters, compileFormula, formulaVariables } from "@/lib/engine/formula";
import { allocationRulesSchema, DEFAULT_RULES, describeRules, resolveRules } from "@/lib/engine/rules";

describe("base-marks formulas", () => {
  const ev = (src: string, vars: Record<string, number> = {}) => compileFormula(src).evaluate(vars);

  it("evaluates arithmetic with the usual precedence and functions", () => {
    expect(ev("1 + 2 * 3")).toBe(7);
    expect(ev("(1 + 2) * 3")).toBe(9);
    expect(ev("-2 + 5 - -1")).toBe(4);
    expect(ev("10 / 4")).toBe(2.5);
    expect(ev("min(a, 5) + max(b, 1, 2)", { a: 7, b: 0 })).toBe(7);
    expect(ev("round(2.345, 2) + abs(-1)")).toBe(3.35);
    expect(ev("clamp(x, 0, 5)", { x: 9 })).toBe(5);
    expect(ev("if(x >= 3 && y < 1, 10, 20)", { x: 3, y: 0 })).toBe(10);
    expect(ev("if(x == 2 || x != 2, 1, 0)", { x: 4 })).toBe(1);
  });

  it("gives null for a missing parameter or a division by zero", () => {
    expect(ev("a + b", { a: 1 })).toBeNull();
    expect(ev("1 / x", { x: 0 })).toBeNull();
    // A missing parameter on the branch not taken does not matter.
    expect(ev("if(a > 0, a, b)", { a: 2 })).toBe(2);
  });

  it("reports mistakes with a position and checks parameter names", () => {
    expect(() => compileFormula("1 +")).toThrow(/ends too early/);
    expect(() => compileFormula("2 $ 3")).toThrow(/Unexpected “\$” \(at character 3\)/);
    expect(() => compileFormula("sqrt(4)")).toThrow(/Unknown function/);
    expect(() => compileFormula("clamp(1, 2)")).toThrow(/takes 3 arguments/);
    expect(() => compileFormula("(1 + 2")).toThrow(/Expected “\)”/);
    expect(() => compileFormula("degree + nope", ["degree"])).toThrow(/Unknown parameter: nope/);
    expect(() => compileFormula("constructor + __proto__")).not.toThrow();
    expect(compileFormula("constructor").evaluate({})).toBeNull();
    expect(compileFormula("b + a + b").variables).toEqual(["a", "b"]);
  });

  it("is part of the allocation rules, validated and described", () => {
    expect(allocationRulesSchema.parse({ ...DEFAULT_RULES, baseMarks: undefined }).baseMarks).toEqual({ formula: null, onMissing: "imported" });
    expect(() => allocationRulesSchema.parse({ ...DEFAULT_RULES, baseMarks: { formula: "1 +", onMissing: "imported" } })).toThrow(/ends too early/);
    const r = resolveRules({ ...DEFAULT_RULES, certificateBonus: { ...DEFAULT_RULES.certificateBonus, enabled: false }, parentBonus: { ...DEFAULT_RULES.parentBonus, enabled: false }, baseMarks: { formula: "degree + mdcat", onMissing: "zero" } });
    expect(describeRules(r)[0]).toEqual({ topic: "Base marks", text: "worked out as degree + mdcat (a missing parameter makes it 0); staff corrections still win" });
  });

  it("keeps only numeric, non-personal parameters from the data files", () => {
    expect(numericParameters({ degree: 14.2, houseJob: 5, marksTotal: 22, applicantId: 7, pmdcNo: 123, number: 3001234567, cnic: 12345, contactNo: 5, phone: 3, nameFull: "x", percentage: 61, mdcat: "1.9", big: 3_001_234_567, statusId: 1 }))
      .toEqual({ degree: 14.2, houseJob: 5, percentage: 61 });
    const { candidates, summary } = sanitizeSimDataset({
      marks: [{ applicantId: 1, marksTotal: 20, degree: 14, nameFull: "Private", mobileNo: 300 }],
      preferences: [],
      components: { "1": { marksTotal: 21, degree: 15, houseJob: 5 } },
    });
    expect(candidates[0]!.params).toEqual({ degree: 15, houseJob: 5 });
    expect(summary.parameters).toEqual({ degree: 1, houseJob: 1 });
    expect(JSON.stringify(candidates)).not.toMatch(/Private|300/);
  });

  it("applies parameter corrections, then the formula, then marks corrections", () => {
    const rows = [
      { applicantId: "1", baseMarks: 20, params: { degree: 14, houseJob: 5 }, programMarks: {}, profileStatus: 1, certificates: [{ status: "Pass", certificateMarks: 4 }] },
      { applicantId: "2", baseMarks: 30, params: { degree: 15 }, programMarks: {}, profileStatus: 1, certificates: [] },
      { applicantId: "3", baseMarks: 25, params: { degree: 10, houseJob: 1 }, programMarks: {}, profileStatus: 1, certificates: [] },
    ];
    const f = { ...compileFormula("degree + houseJob + certMaxMarks"), onMissing: "imported" as const };
    const out = effectiveCandidates(rows, [
      { applicantId: "1", field: "parameter", program: "houseJob", value: 4 },
      { applicantId: "3", field: "base_marks", program: null, value: 40 },
    ], f);
    expect(out.map((r) => r.baseMarks)).toEqual([22, 30, 40]);
    expect(out[0]!.params).toEqual({ degree: 14, houseJob: 4 });
    expect(rows[0]!.params.houseJob).toBe(5);
    expect(effectiveCandidates(rows, [], { ...f, onMissing: "zero" })[1]!.baseMarks).toBe(0);
    expect(effectiveCandidates(rows, [], null)).toEqual(rows);
    expect(certificateParameters([{ status: " pass ", certificateMarks: "3", computerizedMarks: null }, { status: "Fail", certificateMarks: 5 }])).toEqual({ certCount: 2, certPassed: 1, certMaxMarks: 5, certMaxComputerized: 0 });
    expect(formulaVariables({ baseMarks: 9, params: { marksTotal: 1 } }).marksTotal).toBe(9);
  });
});
