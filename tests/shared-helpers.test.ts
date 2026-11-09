import { describe, expect, it } from "vitest";
import { requireReason } from "@/lib/data/shared";
import { UserFacingError } from "@/lib/errors";
import { formatUtc, isUuid } from "@/lib/format";
import { parseUiMode } from "@/lib/ui-mode";

describe("shared helpers", () => {
  it("formats dates in UTC and shows a dash for missing ones", () => {
    expect(formatUtc(new Date("2026-11-04T07:45:12Z"))).toBe("2026-11-04 07:45");
    expect(formatUtc(null)).toBe("—");
    expect(formatUtc(undefined)).toBe("—");
  });

  it("recognises canonical UUIDs only", () => {
    expect(isUuid("ad17acdd-88a9-4904-93f4-9b4d9db2d4dd")).toBe(true);
    expect(isUuid("AD17ACDD-88A9-4904-93F4-9B4D9DB2D4DD")).toBe(true);
    expect(isUuid("ad17acdd88a9490493f49b4d9db2d4dd")).toBe(false);
    expect(isUuid("1; drop table")).toBe(false);
    expect(isUuid(null)).toBe(false);
  });

  it("requires a non-blank reason and trims it", () => {
    expect(requireReason("  fix spelling ")).toBe("fix spelling");
    expect(() => requireReason("   ", "policy changes")).toThrow(UserFacingError);
    expect(() => requireReason("", "policy changes")).toThrow("A reason is required for policy changes");
  });

  it("defaults the interface mode to simple", () => {
    expect(parseUiMode(undefined)).toBe("simple");
    expect(parseUiMode("pro")).toBe("pro");
    expect(parseUiMode("PRO")).toBe("simple");
    expect(parseUiMode("<script>")).toBe("simple");
  });
});
