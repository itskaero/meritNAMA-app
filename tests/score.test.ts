import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { policySchema } from "@/lib/domain/scoring-policy";
import { computeScore } from "@/lib/engine/score";

const policies = JSON.parse(readFileSync(path.join(__dirname, "fixtures", "scoring_policy.json"), "utf8")).policies;
const p2026 = policySchema.parse(policies["2026"]);

describe("merit calculator", () => {
  it("adds up the 2026 policy: MDCAT, degree, positions, house job, FCPS/JCAT", () => {
    const r = computeScore(p2026, {
      mdcat: 80, // 80% of 2
      mbbs_bds_degree: 70, // 70% of 15
      university_positions: 1, // 0.6 each
      house_job: 0, // first tier: Punjab institution, 5
      fcps_jcat: { kind: "jcat", pct: 70 }, // 65–75% → 4
    });
    expect(r.lines.map((l) => [l.key, l.contribution])).toEqual([
      ["mdcat", 1.6],
      ["mbbs_bds_degree", 10.5],
      ["university_positions", 0.6],
      ["house_job", 5],
      ["fcps_jcat", 4],
    ]);
    expect(r).toMatchObject({ total: 21.7, totalMarks: 30, percent: 72.33 });
  });

  it("caps each component at its max marks and counts blanks as 0", () => {
    const r = computeScore(p2026, { mdcat: 250, university_positions: 99, fcps_jcat: { kind: "fcps", tier: 0 } });
    expect(Object.fromEntries(r.lines.map((l) => [l.key, l.contribution]))).toEqual({ mdcat: 2, mbbs_bds_degree: 0, university_positions: 3, house_job: 0, fcps_jcat: 5 });
  });

  it("gives nothing for 'neither', an unknown tier, or no choice", () => {
    for (const fcps_jcat of [{ kind: "none" as const }, { kind: "fcps" as const, tier: 9 }, null]) {
      expect(computeScore(p2026, { fcps_jcat }).lines.find((l) => l.key === "fcps_jcat")!.contribution).toBe(0);
    }
  });
});
