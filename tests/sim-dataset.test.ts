import { describe, expect, it } from "vitest";
import { compareRounds, type Allocation } from "@/lib/domain/sim-compare";
import { effectiveProfileStatus, sanitizeSimDataset } from "@/lib/domain/sim-dataset";

const pref = (n: number, extra: Record<string, unknown> = {}) => ({
  specialityId: 2,
  typeName: "FCPS",
  typeId: 1,
  hospitalName: "Mayo Hospital",
  instituteName: "KEMU",
  preferenceNo: n,
  quotaName: "Punjab",
  programMarks: 5,
  disciplineIds: [2],
  marks: 0,
  parentInstitute: false,
  ...extra,
});
const candidates = {
  "101": {
    applicantId: 101,
    nameFull: "Synthetic Person",
    pmdcNo: "12345-P",
    emailId: "person@example.test",
    cnic: "00000-0000000-0",
    contactNumber: "0300-0000000",
    marksTotal: 61.5,
    applied_in: { FCPS: true, MS: false },
    preferences: [pref(1), pref(2, { hospitalName: "Services Hospital" })],
  },
  "102": { applicantId: 102, nameFull: "Another", marksTotal: "58.25", applied_in: { FCPS: true }, programMarks: { FCPS: "", MS: 3 }, preferences: [pref(1)] },
};

describe("simulation dataset import", () => {
  it("keeps only engine fields: no names, PMDC numbers, emails, phones or CNICs", () => {
    const { candidates: out } = sanitizeSimDataset({ candidates });
    const text = JSON.stringify(out);
    for (const secret of ["Synthetic Person", "12345-P", "person@example.test", "00000-0000000-0", "0300-0000000", "KEMU"]) expect(text).not.toContain(secret);
    expect(out[0]).toEqual({
      applicantId: "101",
      baseMarks: 61.5,
      programMarks: {},
      appliedIn: { FCPS: true, MS: false },
      certificates: [],
      profileStatus: null,
      preferences: [
        { program: "FCPS", preferenceNo: 1, quota: "Punjab", specialityId: 2, hospital: "Mayo Hospital", typeId: 1, disciplineIds: [2], programMarks: 5, parentMarks: 0 },
        { program: "FCPS", preferenceNo: 2, quota: "Punjab", specialityId: 2, hospital: "Services Hospital", typeId: 1, disciplineIds: [2], programMarks: 5, parentMarks: 0 },
      ],
    });
    expect(out[1]).toMatchObject({ baseMarks: 58.25, programMarks: { MS: 3 } });
  });

  it("applies corrected marks, certificates and the effective profile status", () => {
    const { candidates: out, summary } = sanitizeSimDataset({
      candidates,
      components: { "101": { marksTotal: 62, programMarks: { FCPS: 4 } }, "102": { marksTotal: 58.25 } },
      certificates: { "101": [{ disciplineId: 2, typeId: 1, disciplineName: "Medicine", status: "Pass", certificateMarks: 5, computerizedMarks: 4, reference: "secret-ref" }] },
      profileStatus: {
        entries: [
          { applicantId: 101, statusId: 2, statusTypeId: 131, remarks: "private remark" },
          { applicantId: 101, statusId: 1, statusTypeId: 132 },
          { applicantId: 102, statusId: 2, statusTypeId: 131 },
        ],
      },
    });
    expect(out[0]).toMatchObject({ baseMarks: 62, programMarks: { FCPS: 4 }, profileStatus: 1 });
    expect(out[0]!.certificates).toEqual([{ disciplineId: 2, typeId: 1, typeName: null, program: null, specialty: null, status: "Pass", certificateMarks: 5, computerizedMarks: 4 }]);
    expect(JSON.stringify(out)).not.toMatch(/secret-ref|private remark/);
    expect(out[1]!.profileStatus).toBe(2);
    expect(summary).toEqual({ candidates: 2, preferences: 3, withCertificates: 1, withStatus: 2, eligible: 1, correctedMarks: 1 });
  });

  it("lets a later status type override an earlier one", () => {
    const m = effectiveProfileStatus({ entries: [{ applicantId: 1, statusId: 1, statusTypeId: 132 }, { applicantId: 1, statusId: 2, statusTypeId: 131 }] });
    expect(m.get("1")).toBe(1);
  });

  it("rejects malformed files and duplicate applicants", () => {
    expect(() => sanitizeSimDataset({ candidates: { "1": { applicantId: 1, marksTotal: 50 } } })).toThrow();
    expect(() => sanitizeSimDataset({ candidates: [candidates["101"], candidates["101"]] })).toThrow(/twice/);
  });
});

describe("comparing a simulated round with the published one", () => {
  const a = (applicantId: string, speciality: string, mark: number): Allocation => ({ applicantId, program: "FCPS", quota: "Punjab", speciality, hospital: "Mayo Hospital", mark });

  it("counts identical allocations and lists differing seat groups without applicant ids", () => {
    const published = [a("1", "Medicine", 70), a("2", "Medicine", 68), a("3", "Surgery", 65)];
    const simulated = [a("1", "Medicine", 70), a("3", "Medicine", 69), a("2", "Surgery", 68)];
    const c = compareRounds(published, simulated);
    expect(c).toMatchObject({ published: 3, simulated: 3, same: 1, agreement: 33.3, groupsTotal: 2, groupsExact: 0 });
    expect(c.byProgram).toEqual([{ program: "FCPS", published: 3, simulated: 3, same: 1, agreement: 33.3 }]);
    expect(c.differing[0]).toMatchObject({ group: "FCPS · Punjab · Medicine · Mayo Hospital", publishedClosing: 68, simulatedClosing: 69 });
    expect(JSON.stringify(c.differing)).not.toMatch(/"applicantId"/);
  });

  it("matches published names with stray spaces", () => {
    const c = compareRounds([{ ...a("1", "Medicine ", 70), quota: " Punjab" }], [a("1", "Medicine", 70)]);
    expect(c.agreement).toBe(100);
  });
});
