import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { classifyByContents, classifyByPath, cleanRelPath, gitBlobSha, missingDetail, selectSyncFiles, simulationTarget, SIM_ROLE_PATTERNS } from "@/lib/domain/data-files";

const fixture = (f: string) => JSON.parse(readFileSync(path.join(__dirname, "fixtures", f), "utf8")) as unknown;

describe("classifyByPath: the old repository layout", () => {
  it.each([
    ["inductions/21/merit/round_8.json", "merit", 21, 8],
    ["induction21_merit_round3.json", "merit", 21, 3],
    ["i20_round_6.json", "merit", 20, 6],
    ["round_2.json", "merit", null, 2],
    ["inductions/21/consent/round_4.json", "consent", 21, 4],
    ["induction21_consent_round3.json", "consent", 21, 3],
    ["consent_round5.json", "consent", null, 5],
    ["inductions/21/seats.json", "seats", 21, null],
    ["induction22_seats.json", "seats", 22, null],
  ])("%s → %s", (rel, kind, induction, round) => {
    expect(classifyByPath(rel)).toMatchObject({ kind, induction, round });
  });

  it.each([
    ["inductions/21/gazette/gazette_21.json", "gazette", 21],
    ["induction21_candidates.json", "candidates", 21],
    ["induction21_components.json", "components", 21],
    ["induction21_certificates.json", "certificates", 21],
    ["inductions/21/marks.json", "marks", 21],
    ["inductions/21/preferences.json", "preferences", 21],
    ["ProfileStatus.json", "profileStatus", null],
  ])("%s is an estimate input (%s)", (rel, role, induction) => {
    expect(classifyByPath(rel)).toMatchObject({ kind: "sim_input", role, induction });
  });

  it("recognises policy and reference documents", () => {
    expect(classifyByPath("scoring_policy.json")).toMatchObject({ kind: "policy" });
    expect(classifyByPath("data/disciplineFullData.json")).toMatchObject({ kind: "reference", refKind: "disciplines" });
    expect(classifyByPath("cpsp_accreditation.json")).toMatchObject({ kind: "reference", refKind: "cpsp_accreditation" });
    expect(classifyByPath("induction21_specialty_groups.json")).toMatchObject({ kind: "reference", refKind: "specialty_groups", induction: 21 });
  });

  it.each(["closing_merit.json", "trends.json", "flat_lookup.json", "induction21_normalized_merit.json", "specialty_ranking.json", "policy_impact.json", "sim_merit_cascade_r2.json"])(
    "%s is worked out by the app, not imported",
    (name) => expect(classifyByPath(name)).toMatchObject({ kind: "derived" }),
  );

  it("knows schedule and joining status but does not import them yet", () => {
    expect(classifyByPath("induction21_schedule.json")).toMatchObject({ kind: "later" });
    expect(classifyByPath("induction21_joining_status.json")).toMatchObject({ kind: "later" });
  });

  it("returns null for names that say nothing", () => {
    expect(classifyByPath("notes.json")).toBeNull();
    expect(classifyByPath("final_final_v2.json")).toBeNull();
  });
});

describe("classifyByContents", () => {
  it("recognises seats, policy and a reference document by shape", () => {
    expect(classifyByContents(fixture("seats_induction21.json"))).toMatchObject({ kind: "seats" });
    expect(classifyByContents(fixture("scoring_policy.json"))).toMatchObject({ kind: "policy" });
    expect(classifyByContents(fixture("disciplines.json"))).toMatchObject({ kind: "reference", refKind: "disciplines" });
    expect(classifyByContents(fixture("cpsp_accreditation_sample.json"))).toMatchObject({ kind: "reference", refKind: "cpsp_accreditation" });
  });

  it("reads the induction from a merit file's own table", () => {
    const merit = classifyByContents(fixture("merit_i20_round1_sample.json"));
    expect(merit).toMatchObject({ kind: "merit", induction: 20 });
  });

  it("gives up on unrelated JSON", () => {
    expect(classifyByContents({ hello: "world" })).toBeNull();
    expect(classifyByContents([1, 2, 3])).toBeNull();
    expect(classifyByContents(null)).toBeNull();
  });
});

describe("cleanRelPath", () => {
  it("keeps normal paths and normalises separators", () => {
    expect(cleanRelPath(["inductions", "21", "merit", "round_8.json"].join(String.fromCharCode(92)))).toBe("inductions/21/merit/round_8.json");
    expect(cleanRelPath("./a/./b.json")).toBe("a/b.json");
  });
  it.each(["../x.json", String.fromCharCode(92) + "server" + String.fromCharCode(92) + "x.json", "C:/x.json", "a/../../x.json", "/etc/passwd.json", "a/.hidden.json", "x.txt", "a//b.json", "", "a/b/c/d/e/f/g.json", "a/b:c.json"])("refuses %j", (p) => {
    // "a//b.json" is tidied rather than refused: empty parts are dropped
    if (p === "a//b.json") return expect(cleanRelPath(p)).toBe("a/b.json");
    expect(cleanRelPath(p)).toBeNull();
  });
});

describe("what is missing, and where inputs go", () => {
  it("asks for the induction when the name has none", () => {
    expect(missingDetail({ kind: "seats", induction: null, round: null })).toMatch(/induction/);
    expect(missingDetail({ kind: "merit", induction: null, round: null })).toMatch(/round number/);
    expect(missingDetail({ kind: "merit", induction: null, round: 2 })).toBeNull();
    expect(missingDetail({ kind: "policy", induction: null, round: null })).toBeNull();
  });

  it("places estimate inputs and consent where the simulation importer reads them", () => {
    expect(simulationTarget({ kind: "consent", induction: 21, round: 3 }, "round_3.json")).toBe("induction21/consent_round3.json");
    expect(simulationTarget({ kind: "sim_input", induction: 21, round: null, role: "gazette" }, "whatever.json")).toBe("induction21/gazette_21.json");
    expect(simulationTarget({ kind: "sim_input", induction: 21, round: null, role: "marks" }, "induction21_marks.json")).toBe("induction21/marks.json");
    expect(simulationTarget({ kind: "sim_input", induction: null, round: null, role: "marks" }, "marks.json")).toBeNull();
  });

  it("every placed name is one the simulation importer recognises", () => {
    for (const role of Object.keys(SIM_ROLE_PATTERNS) as (keyof typeof SIM_ROLE_PATTERNS)[]) {
      const target = simulationTarget({ kind: "sim_input", induction: 21, round: null, role }, `induction21_${role === "profileStatus" ? "profile_status" : role}.json`)!;
      expect(SIM_ROLE_PATTERNS[role].test(target.split("/")[1]!), `${role} → ${target}`).toBe(true);
    }
  });
});

describe("sync selection", () => {
  const e = (p: string, size = 100, type = "blob") => ({ path: p, type, size, sha: "x" });

  it("takes dataset files and skips the rest", () => {
    const r = selectSyncFiles(
      [e("inductions/21/merit/round_8.json"), e("package.json"), e("closing_merit.json"), e("induction21_schedule.json"), e("README.md"), e("inductions", 0, "tree"), e("scoring_policy.json"), e("inductions/21/merit/round_9.json", 99_999_999)],
      1_000_000, 100,
    );
    expect(r.take.map((t) => t.rel)).toEqual(["inductions/21/merit/round_8.json", "scoring_policy.json"]);
    expect(r.skipped).toBe(4); // package.json, closing_merit, schedule, the oversized round
    expect(r.tooMany).toBe(false);
  });

  it("caps the number of files", () => {
    const tree = Array.from({ length: 5 }, (_, i) => e(`inductions/21/merit/round_${i + 1}.json`));
    const r = selectSyncFiles(tree, 1000, 3);
    expect(r.take).toHaveLength(3);
    expect(r.tooMany).toBe(true);
  });

  it("matches Git's own blob hash", () => {
    // `printf 'hello\n' | git hash-object --stdin`
    expect(gitBlobSha(new TextEncoder().encode("hello\n"))).toBe("ce013625030ba8dba906f756967f9e9ca394464a");
    expect(gitBlobSha(new Uint8Array())).toBe("e69de29bb2d1d6434b8b29ae775ad8c2e48c5391");
  });
});
