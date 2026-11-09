import { describe, expect, it } from "vitest";
import { coverage, parseInductions, predictNext, quantile, relChange, samePolicyInductions } from "@/lib/domain/prediction";

describe("prediction math", () => {
  it("interpolates quantiles", () => {
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(quantile([0, 10], 0.2)).toBeCloseTo(2);
    expect(quantile([], 0.5)).toBeNaN();
  });

  it("applies the 20–80 band of past changes to today's closing", () => {
    const b = predictNext({ closing: 20, changes: [-0.05, -0.03, -0.02, -0.01, 0] })!;
    expect(b).toMatchObject({ n: 5, confidence: "Medium", fallback: false });
    expect(b.low).toBe(19.32);
    expect(b.high).toBe(19.84);
    expect(b.low).toBeLessThan(b.high);
  });

  it("sets confidence by sample size and width, and refuses thin history", () => {
    const tight = Array.from({ length: 9 }, (_, i) => -0.004 + i * 0.0005);
    expect(predictNext({ closing: 20, changes: tight })!.confidence).toBe("High");
    expect(predictNext({ closing: 20, changes: [-0.2, -0.1, 0, 0.05, 0.1, 0.12, 0.15, 0.2] })!.confidence).toBe("Medium");
    expect(predictNext({ closing: 20, changes: [-0.01, -0.02, -0.03] })!.confidence).toBe("Low");
    expect(predictNext({ closing: 20, changes: tight, fallback: true })!.confidence).toBe("Low");
    expect(predictNext({ closing: 20, changes: [-0.01, -0.02] })).toBeNull();
    expect(predictNext({ closing: 20, changes: [-0.01, -0.02, 0.9] })).toBeNull(); // 90% jump dropped as a data error
    expect(relChange(20, 19)).toBeCloseTo(-0.05);
    expect(relChange(0, 19)).toBeNull();
  });

  it("measures how often the band held", () => {
    expect(coverage([{ low: 19, high: 20, actual: 19.5 }, { low: 19, high: 20, actual: 18.5 }, { low: 19, high: 20, actual: 20 }, { low: 19, high: 20, actual: 21 }]))
      .toEqual({ share: 0.5, medianMiss: 0.25, n: 4 });
    expect(coverage([]).share).toBeNull();
  });

  it("reads policy induction ranges and gates next-induction predictions", () => {
    expect(parseInductions("17-19")).toEqual([17, 18, 19]);
    expect(parseInductions("9--10")).toEqual([9, 10]);
    expect(parseInductions(20)).toEqual([20]);
    expect(parseInductions("x")).toEqual([]);
    const policies = { "2025": { induction: "17-19", total_marks: 60 }, "2026-1": { induction: 20, total_marks: 35 }, "2026": { induction: 21, total_marks: 30 } };
    expect(samePolicyInductions(policies, 19)).toMatchObject({ policy: "2025", earlier: [17, 18], total: 60 });
    expect(samePolicyInductions(policies, 21)).toMatchObject({ policy: "2026", earlier: [] });
    expect(samePolicyInductions(policies, 99).policy).toBeNull();
  });
});
