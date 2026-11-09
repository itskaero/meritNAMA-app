import { describe, expect, it } from "vitest";
import { allocationKey, consentRows, nextStatus, officialStatuses, type ListAllocation } from "@/lib/domain/what-if";

const a = (applicantId: string, speciality: string, preferenceNo: number, quota = "Punjab", program = "FCPS"): ListAllocation => ({
  applicantId, program, quota, speciality, hospital: "Mayo Hospital", preferenceNo, mark: 60, seatKey: `${program}|${speciality}|Mayo Hospital|${quota}`,
});
const list = [a("1", "Medicine", 2), a("1", "Surgery", 1, "Armed Forces"), a("2", "Surgery", 1), a("3", "Medicine", 4)];

describe("simulated consent", () => {
  it("reads each allocation's official status from the replies, by title or preference number", () => {
    const st = officialStatuses(list, [
      { applicantId: "1", status: "Accepted", program: "FCPS", quota: "Punjab", preferenceNo: 0, speciality: "Medicine", hospital: "Mayo Hospital" },
      { applicantId: "2", status: "Rejected", program: "FCPS", quota: "Punjab", preferenceNo: 1 },
    ]);
    expect(Object.fromEntries(st)).toEqual({
      [allocationKey("1", list[0]!.seatKey)]: "Accepted",
      // Accepted another seat: gave this one up.
      [allocationKey("1", list[1]!.seatKey)]: "Rejected",
      [allocationKey("2", list[2]!.seatKey)]: "Rejected",
      // No reply.
      [allocationKey("3", list[3]!.seatKey)]: "Awaited",
    });
  });

  it("turns statuses into consent replies as the legacy site did", () => {
    const st = new Map([
      [allocationKey("1", list[0]!.seatKey), "Accepted" as const],
      [allocationKey("1", list[1]!.seatKey), "Rejected" as const],
      [allocationKey("2", list[2]!.seatKey), "Rejected" as const],
      [allocationKey("3", list[3]!.seatKey), "Awaited" as const],
    ]);
    expect(consentRows(list, (k) => st.get(k)!)).toEqual([
      { applicantId: 1, status: "Accepted", preferenceNo: 2, seatKey: list[0]!.seatKey },
      { applicantId: 2, status: "Rejected", preferenceNo: 0, seatKey: null },
      { applicantId: 3, status: "Awaited", preferenceNo: 0, seatKey: null },
    ]);
  });

  it("cycles Accepted → Rejected → Awaited → Accepted", () => {
    expect([nextStatus("Accepted"), nextStatus("Rejected"), nextStatus("Awaited")]).toEqual(["Rejected", "Awaited", "Accepted"]);
  });
});
