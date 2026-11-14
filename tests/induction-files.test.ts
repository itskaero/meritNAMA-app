import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseJoining, parseRevisions, parseSchedule } from "@/lib/domain/induction-files";

describe("PHF schedule", () => {
  it("keeps steps in order with dates in Pakistan time", () => {
    const s = parseSchedule({
      induction: 21,
      steps: [
        { stepId: 81, sortOrder: 81, title: "Gazette", detail: "PHF", statusId: 0, startDate: "2026-06-07T00:00:00", endDate: "2026-06-07T00:00:00" },
        { stepId: 15, sortOrder: 11, title: "Seats", detail: "PHF", statusId: 21, startDate: "2026-05-15T00:00:00", endDate: "2026-06-04T23:00:00" },
      ],
    });
    expect(s.induction).toBe(21);
    expect(s.steps.map((x) => x.title)).toEqual(["Seats", "Gazette"]);
    expect(s.steps[0]!.endsAt!.toISOString()).toBe("2026-06-04T18:00:00.000Z");
  });

  it("refuses a schedule without steps", () => {
    expect(() => parseSchedule({ steps: [] })).toThrow();
  });
});

describe("joining status", () => {
  const row = {
    rowNo: 1, applicantId: 11111, name: "Test Person", pmdcNo: "00000-P", emailId: "someone@example.com", contactNumber: "03000000000", cnic: "0000000000000",
    typeName: "FCPS", specialityName: "Anaesthesia", hospitalName: "Example Hospital, Lahore", instituteName: "x", quotaName: "Punjab",
    marks: 22.7, preferenceNo: 1, seats: 2, status: "Joined", joiningDate: "04/06/2026", empType: "Private", bps: "BPS 17", dept: "x",
  };

  it("keeps seat and status only", () => {
    const [r] = parseJoining([row, { ...row, applicantId: 22222, status: "Pending", joiningDate: null }]);
    expect(r).toEqual({ applicantId: "11111", program: "FCPS", quota: "Punjab", speciality: "Anaesthesia", hospital: "Example Hospital, Lahore", status: "joined", joinedOn: "2026-06-04" });
  });

  it("never carries a name, email, phone, CNIC or job detail", () => {
    const text = JSON.stringify(parseJoining([row]));
    for (const leak of ["Test Person", "someone@example.com", "03000000000", "0000000000000", "00000-P", "BPS 17", "Private"]) expect(text).not.toContain(leak);
  });
});

describe("amendment revisions", () => {
  it("later amendments win; programme marks and score parts become corrections", () => {
    const changes = parseRevisions({
      "5425": {
        amendment_2: { matric: 0, fsc: 0, _timestamp: "2026-06-27T19:00:58" },
        amendment_1: { programMarks: { MD: 0 }, matric: 7, _timestamp: "2026-06-21T15:44:59" },
      },
      "7246": { amendment_1: { degree: 10.755319, _timestamp: "2026-06-21T15:59:31" } },
    });
    expect(changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ applicantId: "5425", field: "program_marks", program: "MD", value: 0 }),
      expect.objectContaining({ applicantId: "5425", field: "parameter", program: "matric", value: 0 }),
      expect.objectContaining({ applicantId: "7246", field: "parameter", program: "degree", value: 10.755319 }),
    ]));
    expect(changes.filter((c) => c.applicantId === "5425" && c.program === "matric")).toHaveLength(1);
  });
});

// The real induction 21 files, when the old project is next to this one (local runs only).
const OLD = "../meritnama-rewrite/meritnama/data";
describe.skipIf(!existsSync(OLD))("induction 21 files from the old site", () => {
  const read = (f: string) => JSON.parse(readFileSync(`${OLD}/${f}`, "utf8")) as unknown;
  it("reads the schedule, joining status and revisions", () => {
    expect(parseSchedule(read("induction21_schedule.json")).steps.length).toBeGreaterThan(10);
    const joining = parseJoining(read("induction21_joining_status.json"));
    expect(joining.length).toBeGreaterThan(1000);
    expect(joining.filter((r) => r.status === "joined").length).toBeGreaterThan(1000);
    expect(JSON.stringify(joining.slice(0, 50))).not.toMatch(/@|\b03\d{9}\b/);
    expect(parseRevisions(read("induction21_revisions.json")).length).toBeGreaterThan(100);
  });
});

describe("flat round files (scraper format)", () => {
  it("become PHF's shape, with institute and seats from the seat matrix and no consent", async () => {
    const { flatToPhf } = await import("@/lib/ingest/kinds/merit");
    const lines = new Map([["fcps|punjab|anaesthesia|jinnah hospital lahore", { institute: "AIMC", seats: 2 }]]);
    const f = flatToPhf(
      [{ rowNo: 1, applicantId: "36373", typeName: "FCPS", quotaName: "Punjab", specialityName: "Anaesthesia", hospitalName: "Jinnah Hospital, Lahore", marksTotal: 22.7, preferenceNo: 1, nameFull: "A B", pmdcNo: 12345 }],
      { inductionId: 21, name: "PHF/26/JUL/01", displayName: "June 2026", startDate: "2026-05-01", endDate: "2026-07-01" },
      lines,
    );
    expect(f.Table[0]!.inductionId).toBe(21);
    expect(f.Table5[0]).toMatchObject({ type: "FCPS", institute: "AIMC", seats: 2, marks: 22.7, consent: "", pmdcNo: "12345", specialityJobId: 0 });
  });
});
