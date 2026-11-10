import { describe, expect, it } from "vitest";
import { gazetteStatus, rankRows } from "@/lib/domain/gazette";
import { sameScheme, schemeOf } from "@/lib/domain/scheme";
import { policySchema } from "@/lib/domain/scoring-policy";

const comp = (key: string, max_marks: number) => ({ key, max_marks });

describe("scheme", () => {
  const a = schemeOf({ key: "2026", label: "A", total_marks: 30, components: [comp("degree", 15), comp("house", 5), comp("pos", 10)] });
  it("matches regardless of component order or key", () => {
    const b = schemeOf({ key: "2027", label: "B", total_marks: 30, components: [comp("pos", 10), comp("degree", 15), comp("house", 5)] });
    expect(sameScheme(a, b)).toBe(true);
  });
  it("same total but different parts is not like for like", () => {
    const c = schemeOf({ key: "2028", label: "C", total_marks: 30, components: [comp("pget", 20), comp("degree", 10)] });
    expect(sameScheme(a, c)).toBe(false);
  });
  it("an excluded component does not count", () => {
    const d = schemeOf({ key: "x", label: "D", total_marks: 30, components: [comp("degree", 15), comp("house", 5), comp("pos", 10), { key: "exp", max_marks: 5, included: false }] });
    expect(sameScheme(a, d)).toBe(true);
  });
  it("unknown is never like for like", () => {
    expect(sameScheme(a, null)).toBe(false);
    expect(sameScheme(null, null)).toBe(false);
  });
});

describe("gazette", () => {
  it("ranks ties together and skips the next rank", () => {
    expect(rankRows([{ marks: 90 }, { marks: 80 }, { marks: 80 }, { marks: 70 }]).map((r) => r.rank)).toEqual([1, 2, 2, 4]);
  });
  it("reads profile status", () => {
    expect([gazetteStatus(1), gazetteStatus(2), gazetteStatus(null)]).toEqual(["eligible", "rejected", "unknown"]);
  });
});

describe("policy eligibility", () => {
  const base = { label: "T", induction: 22, total_marks: 5, components: [{ key: "a", label: "A", type: "boolean", max_marks: 5 }] };
  it("accepts a checklist", () => {
    expect(policySchema.safeParse({ ...base, eligibility: ["Valid licence", "Under 40"] }).success).toBe(true);
  });
  it("rejects an empty line", () => {
    expect(policySchema.safeParse({ ...base, eligibility: [""] }).success).toBe(false);
  });
});
