import { describe, expect, it } from "vitest";
import { parseCorrectionsCsv } from "@/lib/domain/corrections";
import { effectiveProfileStatus, fromGazette, profileStatusFileSchema, verificationSteps } from "@/lib/domain/sim-dataset";

const file = profileStatusFileSchema.parse({
  version: 2,
  statusTypes: { "131": { label: "Verification : Round 01" }, "132": { label: "Amendment Process" } },
  entries: [
    { applicantId: 31640, statusTypeId: 131, statusId: 2, remarks: "  Degree marks sheet   mismatch " },
    { applicantId: 31640, statusTypeId: 132, statusId: 1, remarks: "Corrected transcript submitted" },
    { applicantId: 27267, statusTypeId: 131, statusId: 1 },
    { applicantId: "29903", statusTypeId: 131, statusId: 11, remarks: "" },
  ],
});

describe("verification steps", () => {
  it("keeps every step in order with tidied remarks", () => {
    const steps = verificationSteps(file);
    expect(steps.get("31640")).toEqual([
      { type: 131, label: "Verification : Round 01", status: 2, remarks: "Degree marks sheet mismatch" },
      { type: 132, label: "Amendment Process", status: 1, remarks: "Corrected transcript submitted" },
    ]);
    expect(steps.get("29903")).toEqual([{ type: 131, label: "Verification : Round 01", status: 11, remarks: null }]);
  });

  it("still gives the later step as the effective status", () => {
    expect(effectiveProfileStatus(file).get("31640")).toBe(1);
    expect(effectiveProfileStatus(file).get("27267")).toBe(1);
  });

  it("labels unknown step types plainly when the file has no labels", () => {
    const s = verificationSteps(profileStatusFileSchema.parse({ entries: [{ applicantId: 1, statusTypeId: 132, statusId: 2 }, { applicantId: 1, statusTypeId: 140, statusId: 1 }] }));
    expect(s.get("1")!.map((x) => x.label)).toEqual(["Amendment Process", "Step 140"]);
  });
});

describe("gazette names", () => {
  it("keeps name and PMDC number, never email", () => {
    const g = fromGazette({ Table5: [{ applicantId: 27267, marksTotal: 24.1, statusId: 1, name: " Ali  Raza ", pmdcNo: "93410-p", emailId: "x@y.z" }] });
    expect(g.get("27267")).toMatchObject({ marksTotal: 24.1, profileStatus: 1, name: "Ali Raza", pmdcNo: "93410-P" });
    expect(JSON.stringify(g.get("27267"))).not.toContain("x@y.z");
  });
});

describe("correction kinds", () => {
  it("reads an optional kind column and defaults to admin", () => {
    const { corrections, errors } = parseCorrectionsCsv("applicant_id,field,program,value,kind\n31640,base_marks,,24.18,amendment\n27267,base_marks,,24.10,\n");
    expect(errors).toEqual([]);
    expect(corrections.map((c) => c.kind)).toEqual(["amendment", "admin"]);
  });

  it("rejects an unknown kind", () => {
    const { errors } = parseCorrectionsCsv("applicant_id,field,program,value,kind\n31640,base_marks,,24.18,whim\n");
    expect(errors.length).toBe(1);
  });
});
