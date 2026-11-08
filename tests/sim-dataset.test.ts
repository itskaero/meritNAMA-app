import { describe, expect, it } from "vitest";
import { compareRounds, type Allocation } from "@/lib/domain/sim-compare";
import { consentRoundFromName, effectiveProfileStatus, sanitizeConsent, sanitizeSimDataset } from "@/lib/domain/sim-dataset";

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
      params: {},
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
    expect(summary).toEqual({ candidates: 2, preferences: 3, withCertificates: 1, withStatus: 2, eligible: 1, correctedMarks: 1, parameters: {}, preferencesWithoutMarks: 0, format: "combined" });
  });

  it("reads the split format: marks rows, preference rows and certificate rows", () => {
    const marks = [
      { applicantId: 101, marksTotal: 61.5, applied_in: { FCPS: true }, programMarks: { FCPS: 5 }, profileStatus: 1, nameFull: "Synthetic Person" },
      { applicantId: "102", marksTotal: 58.25, appliedIn: { FCPS: true }, profileStatus: 2 },
    ];
    const preferences = [
      { applicantId: 101, ...pref(2, { hospitalName: "Services Hospital" }) },
      { applicantId: 101, ...pref(1) },
      { applicantId: 102, ...pref(1) },
      { applicantId: 999, ...pref(1) },
    ];
    const certificates = [{ applicantId: 101, disciplineId: 2, typeId: 1, certificateMarks: 5, status: "Pass" }];
    const { candidates: out, summary } = sanitizeSimDataset({ marks, preferences, certificates, profileStatus: { entries: [{ applicantId: 102, statusId: 1, statusTypeId: 132 }] } });
    expect(out.map((c) => [c.applicantId, c.baseMarks, c.profileStatus, c.preferences.map((p) => p.preferenceNo), c.certificates.length])).toEqual([
      ["101", 61.5, 1, [1, 2], 1],
      // The status file wins over the marks row.
      ["102", 58.25, 1, [1], 0],
    ]);
    expect(out[0]).toMatchObject({ programMarks: { FCPS: 5 }, appliedIn: { FCPS: true } });
    expect(out[1]!.appliedIn).toEqual({ FCPS: true });
    expect(JSON.stringify(out)).not.toContain("Synthetic Person");
    expect(summary).toMatchObject({ candidates: 2, preferences: 3, preferencesWithoutMarks: 1, format: "split", eligible: 2 });
  });

  it("accepts marks and preferences keyed by applicant id", () => {
    const { candidates: out } = sanitizeSimDataset({ marks: { "7": { marksTotal: 50 } }, preferences: { "7": [pref(1)] } });
    expect(out).toMatchObject([{ applicantId: "7", baseMarks: 50, preferences: [{ preferenceNo: 1 }] }]);
  });

  it("refuses mixed or incomplete formats", () => {
    expect(() => sanitizeSimDataset({ marks: [], preferences: [], candidates })).toThrow(/not both/);
    expect(() => sanitizeSimDataset({ marks: [] })).toThrow(/needs preferences/);
    expect(() => sanitizeSimDataset({})).toThrow(/No marks/);
    expect(() => sanitizeSimDataset({ marks: [{ applicantId: 1, marksTotal: 1 }, { applicantId: 1, marksTotal: 2 }], preferences: [] })).toThrow(/twice/);
  });

  it("reads the gazette: official marks, score parts and eligibility, never names", () => {
    const gazette = { Table: [{}], Table5: [
      { rowNo: 1, applicantId: 101, marksTotal: 24.07, degree: 12.31, houseJob: 5, experience: 5, fsc: 0, statusId: 1, status: "Eligible", nameFull: "Synthetic Person", pmdcNo: "12345-P" },
      { rowNo: 2, applicantId: 102, marksTotal: 19.5, degree: 10, statusId: 2, status: "Rejected", nameFull: "Another Person", pmdcNo: "999-P" },
      { rowNo: 3, applicantId: 103, marksTotal: 18, degree: 9, statusId: 1 },
    ] };
    // Gazette + preferences: the gazette stands in for marks.json.
    const preferences = [{ applicantId: 101, ...pref(1) }, { applicantId: 102, ...pref(1) }];
    const { candidates: out, summary } = sanitizeSimDataset({ gazette, preferences });
    expect(out.map((c) => [c.applicantId, c.baseMarks, c.profileStatus, c.preferences.length])).toEqual([["101", 24.07, 1, 1], ["102", 19.5, 2, 1], ["103", 18, 1, 0]]);
    expect(out[0]!.params).toMatchObject({ degree: 12.31, houseJob: 5, experience: 5 });
    expect(Object.keys(out[0]!.params)).not.toContain("rowNo");
    expect(JSON.stringify(out)).not.toMatch(/Synthetic|Another|12345|999-P/);
    expect(summary).toMatchObject({ format: "split", gazette: { rows: 3, matched: 3 } });
    // With the portal's combined file, the gazette's marks win; a status file still wins over the gazette.
    const combined = sanitizeSimDataset({ gazette, candidates: [{ applicantId: 101, marksTotal: 30, preferences: [pref(1)] }], profileStatus: { entries: [{ applicantId: 101, statusId: 2, statusTypeId: 132 }] } });
    expect(combined.candidates[0]).toMatchObject({ applicantId: "101", baseMarks: 24.07, profileStatus: 2 });
    expect(combined.summary.gazette).toEqual({ rows: 3, matched: 1 });
    expect(() => sanitizeSimDataset({ gazette })).toThrow(/No marks/);
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

describe("consent replies", () => {
  it("keeps the reply and its seat, never the name or marks", () => {
    const { rows, counts } = sanitizeConsent([
      { rowNo: 1, totalCount: 2, applicantId: 101, name: "Synthetic Person", quota: "Punjab ", program: "FCPS", preferenceNo: 3, marks: 61.5, infoTitle: "FCPS - Punjab - Medicine - Unit II - Mayo Hospital, Lahore", status: "Accepted" },
      { applicantId: "102", quota: "Punjab", program: "MS", preferenceNo: 1, infoTitle: "bad title", status: "Awaited" },
    ]);
    expect(rows).toEqual([
      { applicantId: "101", status: "Accepted", program: "FCPS", quota: "Punjab", preferenceNo: 3, speciality: "Medicine", hospital: "Mayo Hospital, Lahore" },
      { applicantId: "102", status: "Awaited", program: "MS", quota: "Punjab", preferenceNo: 1, speciality: null, hospital: null },
    ]);
    expect(JSON.stringify(rows)).not.toMatch(/Synthetic|61\.5/);
    expect(counts).toEqual({ Accepted: 1, Awaited: 1 });
  });

  it("reads the round from the file name", () => {
    expect(consentRoundFromName("consent_round3.json")).toBe(3);
    expect(consentRoundFromName("induction21_consent_round12.json")).toBe(12);
    expect(consentRoundFromName("consent.json")).toBeNull();
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
