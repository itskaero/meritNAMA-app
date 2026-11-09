import { describe, expect, it } from "vitest";
import { ladderScale, segmentsFor } from "@/lib/domain/ladder";

describe("merit ladder scale", () => {
  it("covers the values with a point of headroom in whole-percent segments", () => {
    const s = ladderScale([67.4, 75.9]);
    expect(s).toEqual({ lo: 66, hi: 86, step: 1 });
    expect(segmentsFor(75.9, s)).toBeCloseTo(9.9);
    expect(segmentsFor(50, s)).toBe(0);
    expect(segmentsFor(99, s)).toBe(20);
  });

  it("widens the step when the spread is large, and survives empty input", () => {
    expect(ladderScale([20, 90])).toEqual({ lo: 19, hi: 99, step: 4 });
    expect(ladderScale([])).toEqual({ lo: 0, hi: 100, step: 5 });
  });
});
