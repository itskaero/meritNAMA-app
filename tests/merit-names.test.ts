import { describe, expect, it } from "vitest";
import { classifyQuery, cleanName, cleanPmdc, meritRowSchema } from "@/lib/domain/merit-round";

describe("names and PMDC numbers on merit rows", () => {
  it("tidies names and empties to null", () => {
    expect(cleanName("  Sidra   Nadeem ")).toBe("Sidra Nadeem");
    expect(cleanName("")).toBeNull();
    expect(cleanName(null)).toBeNull();
  });

  it("normalises PMDC numbers", () => {
    expect(cleanPmdc(" 97937-p ")).toBe("97937-P");
    expect(cleanPmdc("")).toBeNull();
  });

  it("reads name and PMDC from a PHF row and ignores email", () => {
    const row = meritRowSchema.parse({
      rowNo: 1, type: "FCPS", quota: "Punjab", specialityJobId: 26, speciality: "Anaesthesia",
      hospital: "Jinnah Hospital, Lahore", institute: "AIMC", seats: 2, marks: 73.5, applicantId: 1311,
      preferenceNo: 1, consent: "Accepted", name: "Sidra Nadeem", pmdcNo: "97937-P", emailId: "x@y.z",
    });
    expect(row.name).toBe("Sidra Nadeem");
    expect(row.pmdcNo).toBe("97937-P");
    expect(row.applicantId).toBe("1311");
  });

  it("accepts rows without name or PMDC (older files)", () => {
    const row = meritRowSchema.parse({
      rowNo: 1, type: "FCPS", quota: "Punjab", specialityJobId: 26, speciality: "Anaesthesia",
      hospital: "Jinnah", institute: "", seats: 2, marks: 1, applicantId: "1", preferenceNo: 1, consent: "",
    });
    expect(row.name).toBeUndefined();
  });

  it("tells an applicant id, a PMDC number and a name apart", () => {
    expect(classifyQuery("27267")).toEqual({ kind: "id", value: "27267" });
    expect(classifyQuery("97937-p")).toEqual({ kind: "pmdc", value: "97937-P" });
    expect(classifyQuery("97937 P")).toEqual({ kind: "pmdc", value: "97937-P" });
    expect(classifyQuery("  ayesha  khan ")).toEqual({ kind: "name", value: "ayesha khan" });
    expect(classifyQuery("a")).toBeNull();
    expect(classifyQuery("   ")).toBeNull();
  });
});
