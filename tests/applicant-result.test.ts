import { describe, expect, it } from "vitest";
import { applicantResults, marginText, seatKey, trackSummary, type ListSeat } from "@/lib/domain/applicant-result";

const pref = (n: number, speciality: string, hospital: string, mark = 24.1) => ({ preferenceNo: n, quota: "Punjab", speciality, hospital, mark });
const seats = new Map<string, ListSeat>([
  [seatKey("Punjab", "Anaesthesia", "Mayo Hospital, Lahore"), { cutoff: 24.23, filled: 6 }],
  [seatKey("Punjab", "Anaesthesia", "Services Hospital"), { cutoff: 23.95, filled: 8 }],
  [seatKey("Punjab", "Medicine", "Mayo Hospital, Lahore"), { cutoff: 23.6, filled: 18 }],
  [seatKey("Punjab", "Paediatrics", "Children's Hospital"), { cutoff: 24.2, filled: 22 }],
]);

describe("applicant result", () => {
  it("marks placed, fell short, skipped and no seats like the legacy simulator", () => {
    const rows = applicantResults([
      pref(3, "Medicine", "Mayo Hospital, Lahore"),
      pref(1, "Anaesthesia", "Mayo Hospital, Lahore"),
      pref(2, "anaesthesia", "SERVICES HOSPITAL"),
      pref(4, "Paediatrics", "Children's Hospital"),
      pref(5, "Radiology", "Services Hospital"),
    ], seats, 2);
    expect(rows.map((r) => [r.preferenceNo, r.status, r.cutoff, r.delta])).toEqual([
      [1, "fell_short", 24.23, -0.13],
      [2, "placed", 23.95, 0.15],
      [3, "skipped", 23.6, 0.5],
      [4, "skipped", 24.2, -0.1],
      [5, "no_seats", null, null],
    ]);
    expect(rows.map(marginText)).toEqual(["Short 0.13", "Clears +0.15", "Would clear +0.50", "Would be short 0.10", "—"]);
    expect(trackSummary(rows).placed?.preferenceNo).toBe(2);
  });

  it("without a seat, shows cleared cutoffs and the closest miss", () => {
    const rows = applicantResults([pref(1, "Anaesthesia", "Mayo Hospital, Lahore", 24.0), pref(2, "Medicine", "Mayo Hospital, Lahore", 24.0)], seats, null);
    expect(rows.map((r) => r.status)).toEqual(["fell_short", "clears_cutoff"]);
    expect(trackSummary(rows)).toMatchObject({ placed: null, closestMiss: { preferenceNo: 1 } });
  });

  it("keeps an unknown mark readable", () => {
    const [r] = applicantResults([{ preferenceNo: 1, quota: "Punjab", speciality: "Medicine", hospital: "Mayo Hospital, Lahore", mark: null }], seats, null);
    expect(r).toMatchObject({ status: "fell_short", delta: null });
    expect(marginText(r!)).toBe("—");
  });
});
