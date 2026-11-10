import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scoringPolicyFileSchema } from "@/lib/domain/scoring-policy";
import { computeScore } from "@/lib/engine/score";

const file = scoringPolicyFileSchema.parse(JSON.parse(readFileSync("docs/scoring_policy_with_2027.json", "utf8")));
const p = file.policies["2027"]!;

describe("induction 22 policy (2027)", () => {
  it("is valid and totals 100", () => {
    expect(p.total_marks).toBe(100);
    expect(p.eligibility?.length).toBeGreaterThan(0);
  });
  it("PGET passed carries 75, failed carries 0", () => {
    const base = { mbbs_bds_degree: 70, university_positions: 2, house_job: 0 };
    expect(computeScore(p, { ...base, pget: 0 }).total).toBeCloseTo(75 + 10.5 + 2 + 5);
    expect(computeScore(p, { ...base, pget: 1 }).total).toBeCloseTo(10.5 + 2 + 5);
  });
});
