import { describe, expect, it } from "vitest";
import { arcSegment, cycleProgress } from "@/lib/domain/cycle";

const base = { startsOn: "2025-10-01", endsOn: "2025-12-31" };
const on = (d: string) => new Date(`${d}T12:00:00Z`);

describe("cycle progress", () => {
  it("is 0% before the cycle and 100% after it", () => {
    const before = cycleProgress({ ...base, published: 0, today: on("2025-09-20") });
    expect(before).toMatchObject({ day: 0, pct: 0, status: "Not started", totalDays: 92 });
    const after = cycleProgress({ ...base, published: 6, today: on("2026-02-01") });
    expect(after).toMatchObject({ day: 92, pct: 100, status: "Cycle closed", daysLeft: 0, next: null });
  });

  it("places rounds in order and estimates the next one mid-cycle", () => {
    const mid = cycleProgress({ ...base, published: 3, today: on("2025-11-15") });
    expect(mid).toMatchObject({ day: 46, status: "Rounds running", published: 3, expected: 6 });
    expect(mid.rounds.map((r) => r.state)).toEqual(["published", "published", "published", "next", "expected", "expected"]);
    expect(mid.next).toMatchObject({ roundNo: 4, estimatedOn: "2025-11-23", overdue: false });
    expect(cycleProgress({ ...base, published: 3, today: on("2025-12-01") }).next!.overdue).toBe(true);
  });

  it("handles no rounds yet, more rounds than usual, and a one-day cycle", () => {
    expect(cycleProgress({ ...base, published: 0, today: on("2025-10-05") })).toMatchObject({ status: "Applications", next: { roundNo: 1 } });
    expect(cycleProgress({ ...base, published: 8, today: on("2025-12-30") })).toMatchObject({ expected: 8, status: "Final list out", next: null });
    expect(cycleProgress({ startsOn: "2025-10-01", endsOn: "2025-10-01", published: 1, expectedRounds: 1, today: on("2025-10-01") })).toMatchObject({ totalDays: 1, day: 1, pct: 100 });
  });

  it("draws closed annular segments", () => {
    const d = arcSegment(100, 100, 50, 80, Math.PI, Math.PI * 1.1);
    expect(d.startsWith("M50.0,100.0")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
  });
});
