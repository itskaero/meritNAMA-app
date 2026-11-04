import { describe, expect, it } from "vitest";
import { classify, margin, optionKey, parseOptionKey, toPercent } from "@/lib/domain/finder";

describe("score finder rules", () => {
  it("compares in percent of each total", () => {
    expect(toPercent(15, 30)).toBe(50);
    expect(toPercent(17.5, 35)).toBe(50);
  });

  it("classifies against first- and final-round closing", () => {
    // first round closed at 64%, final at 56%
    expect(classify(70, 64, 56)).toBe("safe");
    expect(classify(64, 64, 56)).toBe("safe");
    expect(classify(60, 64, 56)).toBe("borderline");
    expect(classify(56, 64, 56)).toBe("borderline");
    expect(classify(55.9, 64, 56)).toBe("out");
  });

  it("tolerates a final round that closed higher than the first", () => {
    expect(classify(60, 58, 62)).toBe("safe");
    expect(classify(57, 58, 62)).toBe("out");
  });

  it("reports the margin in percentage points", () => {
    expect(margin(60, 56)).toBe(4);
    expect(margin(50, 56)).toBe(-6);
  });

  it("round-trips option keys, including names with commas", () => {
    const o = { speciality: "Obstetrics & Gynecology", hospital: "Holy Family Hospital, Rawalpindi" };
    expect(parseOptionKey(optionKey(o))).toEqual(o);
    expect(parseOptionKey("no-separator")).toBeNull();
    expect(parseOptionKey("|x")).toBeNull();
  });
});
