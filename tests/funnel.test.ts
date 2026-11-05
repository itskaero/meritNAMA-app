import { describe, expect, it } from "vitest";
import { bandPath, biggestSettle, movingPct } from "@/lib/domain/funnel";

describe("round funnel geometry", () => {
  it("draws a closed band that spans the full width, centred on mid", () => {
    const p = bandPath([100, 50, 10], { width: 300, mid: 150 });
    expect(p.startsWith("M0,100")).toBe(true);
    expect(p).toContain("L300,145");
    expect(p).toContain("L300,155");
    expect(p.endsWith("Z")).toBe(true);
    expect(bandPath([], { width: 300, mid: 150 })).toBe("");
  });

  it("works out shares and the biggest settle", () => {
    expect(movingPct(916, 1283)).toBe(71);
    expect(movingPct(5, 0)).toBe(0);
    expect(biggestSettle([916, 573, 469, 414, 287, 0], 1283)).toEqual([1, 2, 27]);
    expect(biggestSettle([10], 10)).toBeNull();
  });
});
