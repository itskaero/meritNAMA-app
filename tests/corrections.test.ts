import { describe, expect, it } from "vitest";
import { applyCorrections, parseCorrectionsCsv, toCsv } from "@/lib/domain/corrections";

describe("corrections", () => {
  const rows = [
    { applicantId: "1", baseMarks: 50, programMarks: { FCPS: 2 }, profileStatus: 1, extra: "kept" },
    { applicantId: "2", baseMarks: 60, programMarks: {}, profileStatus: null, extra: "kept" },
  ];

  it("applies corrections in order without touching the input", () => {
    const out = applyCorrections(rows, [
      { applicantId: "1", field: "base_marks", program: null, value: 55 },
      { applicantId: "1", field: "base_marks", program: null, value: 56 },
      { applicantId: "1", field: "program_marks", program: "MS", value: 3 },
      { applicantId: "1", field: "profile_status", program: null, value: 2 },
    ]);
    expect(out[0]).toEqual({ applicantId: "1", baseMarks: 56, programMarks: { FCPS: 2, MS: 3 }, profileStatus: 2, extra: "kept" });
    expect(out[1]).toBe(rows[1]);
    expect(rows[0]!.baseMarks).toBe(50);
    expect(rows[0]!.programMarks).toEqual({ FCPS: 2 });
  });

  it("parses a corrections file and names each bad line", () => {
    const { corrections, errors } = parseCorrectionsCsv(
      "﻿Applicant_ID,Field,Program,Value\r\n" +
        "101,base_marks,,61.5\n" +
        '102,program_marks,"FCPS",4\n' +
        "103,profile_status,,2\n" +
        "104,program_marks,,4\n" +
        "105,profile_status,,7\n" +
        "abc,base_marks,,1\n" +
        "106,base_marks,,x\n" +
        "\n" +
        "101,base_marks,,62\n",
    );
    expect(corrections).toEqual([
      { applicantId: "101", field: "base_marks", program: null, value: 62 },
      { applicantId: "102", field: "program_marks", program: "FCPS", value: 4 },
      { applicantId: "103", field: "profile_status", program: null, value: 2 },
    ]);
    expect(errors).toEqual([
      "Line 5: Programme marks need a programme",
      "Line 6: Profile status is 1 (Accepted), 2 (Rejected) or 11 (Pending)",
      "Line 7: Applicant IDs are digits",
      "Line 8: the value is not a number",
    ]);
    expect(parseCorrectionsCsv("id,value\n1,2").errors[0]).toMatch(/header/);
    expect(parseCorrectionsCsv("applicant_id,field,value\n").errors).toEqual(["The file has no corrections"]);
  });

  it("writes CSV that spreadsheets cannot read as formulas", () => {
    expect(toCsv([["a", 1, null], ['say "hi", ok', -2, "=SUM(A1)"], ["@x", Number.NaN, "-1"]])).toBe('a,1,\r\n"say ""hi"", ok",-2,\'=SUM(A1)\r\n\'@x,,\'-1\r\n');
  });
});
