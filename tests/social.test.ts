import { describe, expect, it } from "vitest";
import { meritBand, nextLevel, peerShown, reputationLevel, roomMessageSchema, roundDayText } from "@/lib/domain/social";

describe("social helpers", () => {
  it("writes the round-day message from the round's figures", () => {
    expect(roundDayText({ induction: 21, roundNo: 6, allocations: 1233, median: 20.41, previousMedian: 20.9, biggestFall: { program: "FCPS", speciality: "Radiology", from: 24.1, to: 23.2 }, alerted: 12 }))
      .toBe("Round 6 is out: 1,233 allocations. Median closing merit 20.41 (down 0.49 on round 5). Biggest fall: FCPS Radiology, 24.10 → 23.20. 12 people were told about seats on their shortlist.");
    expect(roundDayText({ induction: 21, roundNo: 1, allocations: 900, median: 21, previousMedian: null, biggestFall: null, alerted: 0, updated: true }))
      .toBe("Round 1 was re-published: 900 allocations. Median closing merit 21.00.");
  });

  it("shows a band, never exact marks", () => {
    expect(meritBand("FCPS ", 21.73)).toBe("FCPS · 21–22");
    expect(meritBand(null, 20)).toBeNull();
    expect(meritBand("MS", Number.NaN)).toBeNull();
  });

  it("names reputation levels and the next step", () => {
    expect(reputationLevel(0).label).toBe("New");
    expect(reputationLevel(12).label).toBe("Contributor");
    expect(reputationLevel(50).label).toBe("Helpful");
    expect(reputationLevel(400).label).toBe("Trusted");
    expect(nextLevel(12)).toEqual({ level: expect.objectContaining({ label: "Helpful" }), needed: 38 });
    expect(nextLevel(150)).toBeNull();
  });

  it("hides small peer counts and tidies messages", () => {
    expect(peerShown(2)).toBeNull();
    expect(peerShown(3)).toBe(3);
    expect(roomMessageSchema.parse("  hello \n  there ")).toBe("hello there");
    expect(() => roomMessageSchema.parse("   ")).toThrow();
    expect(() => roomMessageSchema.parse("x".repeat(301))).toThrow();
  });
});
