/**
 * The merit calculator reproduces the legacy one (js/app-predict-calc.js runCalculator).
 * Cases were produced by scripts/golden/legacy-calculator.mjs: random inputs for every
 * real scoring policy, typed into a fake form and run through the legacy code.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { policySchema } from "@/lib/domain/scoring-policy";
import { computeScore, type ScoreInputs } from "@/lib/engine/score";

const fx = (f: string) => JSON.parse(readFileSync(path.join(__dirname, "fixtures", f), "utf8"));
const policies = fx("scoring_policy.json").policies as Record<string, unknown>;
const golden = fx("engine/calculator.golden.json") as {
  cases: { policyKey: string; inputs: ScoreInputs; total: number; breakdown: { label: string; contribution: number; max: number; value: string }[] }[];
};

describe("merit calculator vs legacy", () => {
  it("covers every policy and component type", () => {
    expect(new Set(golden.cases.map((c) => c.policyKey))).toEqual(new Set(Object.keys(policies)));
  });

  for (const key of Object.keys(policies)) {
    it(`computes policy ${key} identically`, () => {
      const policy = policySchema.parse(policies[key]);
      for (const c of golden.cases.filter((x) => x.policyKey === key)) {
        const r = computeScore(policy, c.inputs);
        expect(r.total).toBe(c.total);
        expect(r.lines.map(({ label, contribution, max, value }) => ({ label, contribution, max, value }))).toEqual(c.breakdown);
      }
    });
  }
});
