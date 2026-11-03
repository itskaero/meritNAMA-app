import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  cpspAccreditationFileSchema,
  disciplinesFileSchema,
  seatFileSchema,
  specialtyGroupsFileSchema,
  summarizeDocument,
} from "@/lib/domain/reference-data";

// Copies of the public meritnama/data/ files (CPSP trimmed to the first 40 hospitals).
const load = (f: string) => JSON.parse(readFileSync(path.join(__dirname, "fixtures", f), "utf8"));
const seats = load("seats_induction21.json");
const disciplines = load("disciplines.json");
const groups = load("specialty_groups_induction21.json");
const cpsp = load("cpsp_accreditation_sample.json");

const ok = (r: { success: boolean; error?: { issues: unknown[] } }) => expect(r.success, JSON.stringify(r.error?.issues?.slice(0, 3))).toBe(true);

describe("reference data contracts accept the real files", () => {
  it("seats", () => ok(seatFileSchema.safeParse(seats)));
  it("disciplines", () => ok(disciplinesFileSchema.safeParse(disciplines)));
  it("specialty groups", () => ok(specialtyGroupsFileSchema.safeParse(groups)));
  it("CPSP accreditation (sample)", () => ok(cpspAccreditationFileSchema.safeParse(cpsp)));

  // The full 850 KB file is not committed; set CPSP_FULL=/path/to/cpsp_accreditation.json to check it.
  it.skipIf(!process.env.CPSP_FULL || !existsSync(process.env.CPSP_FULL ?? ""))("CPSP accreditation (full file)", () => {
    ok(cpspAccreditationFileSchema.safeParse(JSON.parse(readFileSync(process.env.CPSP_FULL!, "utf8"))));
  });

  it("summarises documents", () => {
    expect(summarizeDocument("disciplines", disciplines)).toMatch(/^13 disciplines/);
    expect(summarizeDocument("cpsp_accreditation", cpsp)).toMatch(/^40 hospitals/);
  });
});

describe("reference data contracts catch mistakes", () => {
  it("rejects a duplicate seat line", () => {
    const r = seatFileSchema.safeParse([...seats, { ...seats[0], seats: 9 }]);
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain("duplicate seat line");
  });

  it("rejects an id that has two names", () => {
    const bad = structuredClone(seats);
    bad[5].hospitalName = "Renamed Hospital";
    const r = seatFileSchema.safeParse(bad);
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain("hospitalId");
  });

  it("rejects negative or fractional seats and unknown fields", () => {
    expect(seatFileSchema.safeParse([{ ...seats[0], seats: -1 }]).success).toBe(false);
    expect(seatFileSchema.safeParse([{ ...seats[0], seats: 1.5 }]).success).toBe(false);
    expect(seatFileSchema.safeParse([{ ...seats[0], seat: 1 }]).success).toBe(false);
  });

  it("rejects a specialty group pointing at an unknown discipline", () => {
    const bad = structuredClone(groups);
    bad.programs.FCPS.groups.anaesthesia.disciplineId = 999;
    const r = specialtyGroupsFileSchema.safeParse(bad);
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain("discipline 999");
  });

  it("rejects duplicate disciplines and malformed CPSP dates", () => {
    expect(disciplinesFileSchema.safeParse([...disciplines, disciplines[0]]).success).toBe(false);
    const bad = structuredClone(cpsp);
    bad[0].programs[0].since = "2017-05-22";
    expect(cpspAccreditationFileSchema.safeParse(bad).success).toBe(false);
  });
});
