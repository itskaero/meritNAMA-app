import { describe, expect, it } from "vitest";
import { cleanKey, hourOf, MIN_SHOWN, pageKey, shownCount } from "@/lib/domain/activity";

describe("activity counts", () => {
  it("hides counts too small to show", () => {
    expect(shownCount(0)).toBeNull();
    expect(shownCount(MIN_SHOWN - 1)).toBeNull();
    expect(shownCount(MIN_SHOWN)).toBe(MIN_SHOWN);
    expect(shownCount(null)).toBeNull();
  });

  it("buckets searches by hour", () => {
    expect(hourOf(new Date("2026-11-13T10:47:31.512Z")).toISOString()).toBe("2026-11-13T10:00:00.000Z");
  });

  it("only accepts plain keys", () => {
    expect(cleanKey(" Round:21:5 ")).toBe("round:21:5");
    expect(cleanKey("seat:fcps|punjab")).toBeNull();
    expect(cleanKey("")).toBeNull();
    expect(cleanKey("x".repeat(121))).toBeNull();
  });

  it("builds page keys the same way everywhere", () => {
    expect(pageKey.round(21, 5)).toBe("round:21:5");
    expect(cleanKey(pageKey.hospital(12))).toBe("hospital:12");
  });
});
