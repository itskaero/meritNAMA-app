import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { policyInductions, policySchema, scoringPolicyFileSchema } from "@/lib/domain/scoring-policy";

// Copy of the public meritnama/data/scoring_policy.json — the real production file.
const fixture = JSON.parse(readFileSync(path.join(__dirname, "fixtures/scoring_policy.json"), "utf8"));

describe("scoring policy contract", () => {
  it("accepts the real scoring_policy.json", () => {
    const result = scoringPolicyFileSchema.safeParse(fixture);
    expect(result.success, JSON.stringify(!result.success && result.error.issues)).toBe(true);
  });

  it("knows every policy in the real file", () => {
    const parsed = scoringPolicyFileSchema.parse(fixture);
    expect(Object.keys(parsed.policies).sort()).toEqual(["2020", "2021", "2022", "2023", "2024", "2025", "2026", "2026-1"]);
    expect(parsed.policies[parsed.active_policy]?.total_marks).toBe(30);
  });

  const active = () => structuredClone(fixture.policies["2026"]);

  it("rejects a policy whose included components do not sum to total_marks", () => {
    const p = active();
    p.total_marks = 31;
    const r = policySchema.safeParse(p);
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain("sum to 30");
  });

  it("ignores excluded components in the total", () => {
    const p = active();
    p.components.push({ key: "extra", label: "Extra", max_marks: 9, type: "boolean", included: false });
    expect(policySchema.safeParse(p).success).toBe(true);
  });

  it("rejects duplicate component keys", () => {
    const p = active();
    p.components.push({ ...p.components[0], max_marks: 0 });
    expect(policySchema.safeParse(p).success).toBe(false);
  });

  it("requires type-specific fields", () => {
    const p = active();
    const years = { key: "service", label: "Service", max_marks: 0, type: "years", included: true };
    p.components.push(years);
    const r = policySchema.safeParse(p);
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain("per_year");
  });

  it("rejects unknown fields so admin typos are caught", () => {
    const p = active();
    p.components[0].max_mark = 2;
    expect(policySchema.safeParse(p).success).toBe(false);
  });

  it("expands induction ranges", () => {
    const parsed = scoringPolicyFileSchema.parse(fixture);
    expect(policyInductions(parsed.policies["2025"]!)).toEqual([17, 18, 19]);
    expect(policyInductions(parsed.policies["2026"]!)).toEqual([21]);
  });

  it("detects a policy total that disagrees with _induction_max", () => {
    const bad = structuredClone(fixture);
    bad._induction_max["18"] = 95;
    const r = scoringPolicyFileSchema.safeParse(bad);
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain("induction 18 max is 95");
  });

  it("rejects an active_policy that is not defined", () => {
    expect(scoringPolicyFileSchema.safeParse({ ...fixture, active_policy: "2099" }).success).toBe(false);
  });
});
