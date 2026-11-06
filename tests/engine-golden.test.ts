/**
 * The simulation engine reproduces the legacy simulator exactly.
 *
 * Inputs and expected outputs in tests/fixtures/engine/ were produced by running the
 * legacy JS (public repo itskaero/meritnama, commit in each file's `legacyCommit`)
 * through scripts/golden/legacy-engine.mjs. Inputs are synthetic. The engines run
 * under the LEGACY_* rule presets, which describe what the legacy code did.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { marksContext, effectiveMark, programBonus, type EngineCandidate, type Preference } from "@/lib/engine/marks";
import { buildSeatTree, candidatePool, preferenceOutcomes, runPlacement, type SeatLine } from "@/lib/engine/placement";
import { compareWithActual, runCascade, type CascadeInput } from "@/lib/engine/cascade";
import { LEGACY_CASCADE_RULES, LEGACY_FIRST_ROUND_RULES, resolveRules } from "@/lib/engine/rules";

const dir = path.join(__dirname, "fixtures/engine");
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));

type LegacyCandidate = {
  applicantId: number;
  marksTotal: number;
  preference: Record<string, Preference[]>;
  programMarks?: Record<string, number | string>;
  applied_in?: Record<string, boolean>;
  certificates?: EngineCandidate["certificates"];
};

const toEngine = (c: LegacyCandidate): EngineCandidate => ({
  applicantId: c.applicantId,
  baseMarks: c.marksTotal,
  programMarks: c.programMarks,
  appliedIn: c.applied_in,
  certificates: c.certificates,
  preferences: c.preference,
});

describe("placement engine vs legacy", () => {
  const input = load("placement.input.json");
  const golden = load("placement.golden.json");
  const ctx = marksContext({ specialtyGroups: load("specialty_groups.json") });
  const rules = resolveRules(LEGACY_FIRST_ROUND_RULES);
  // The legacy simulator's parent-bonus switch: on, and uncapped.
  const withParent = resolveRules({ ...LEGACY_FIRST_ROUND_RULES, parentBonus: { ...LEGACY_FIRST_ROUND_RULES.parentBonus, enabled: true } });
  const candidates: EngineCandidate[] = input.candidates.map(toEngine);

  it("uses the pinned legacy commit for both files", () => {
    expect(golden.legacyCommit).toBe(input.legacyCommit);
  });

  it("computes the same mark and bonus source for every candidate, programme and preference", () => {
    const byId = new Map(candidates.map((c) => [c.applicantId, c]));
    const actual = golden.marks.map((m: { applicantId: number; program: string }) => {
      const c = byId.get(m.applicantId)!;
      return {
        applicantId: m.applicantId,
        program: m.program,
        mark: effectiveMark(rules, ctx, c, m.program),
        prefs: (c.preferences[m.program] ?? []).map((p) => ({
          preferenceNo: p.preferenceNo,
          mark: effectiveMark(rules, ctx, c, m.program, p),
          bonus: programBonus(rules, ctx, c, p, m.program).source,
        })),
      };
    });
    expect(actual).toEqual(golden.marks);
  });

  for (const run of golden.runs as { program: string; parentBonus: boolean; slots: unknown[]; candidates: unknown[] }[]) {
    it(`allocates ${run.program}${run.parentBonus ? " with parent bonus" : ""} identically`, () => {
      const r = run.parentBonus ? withParent : rules;
      const pool = candidatePool(r, ctx, candidates, run.program);
      const tree = buildSeatTree(input.seats as SeatLine[], run.program);
      const res = runPlacement(r, ctx, pool, tree, run.program);

      const slots = [];
      for (const [q, specs] of Object.entries(res.seatTree))
        for (const [s, hosps] of Object.entries(specs))
          for (const [h, sl] of Object.entries(hosps)) slots.push({ q, s, h, jobs: sl.jobs, candidates: sl.candidates, others: sl.others });
      expect(slots).toEqual(run.slots);

      const working = res.candidates.map((w) => ({
        applicantId: w.applicantId,
        track: w.track,
        sortMarks: w.sortMarks,
        placed: w.placed,
        q: w.q,
        s: w.s,
        h: w.h,
        outcomes: preferenceOutcomes(w, res.seatTree).map((o) => ({
          preferenceNo: o.pref.preferenceNo,
          status: o.status,
          ...(o.status === "beaten" ? { cutoff: o.cutoff, capacity: o.capacity, filled: o.filled } : {}),
        })),
      }));
      expect(working).toEqual(run.candidates);
    });
  }
});

describe("cascade engine vs legacy", () => {
  const input = load("cascade.input.json");
  const golden = load("cascade.golden.json");
  const base: Omit<CascadeInput, "merit" | "consent"> = {
    rules: resolveRules(LEGACY_CASCADE_RULES),
    seats: input.seats,
    candidates: input.candidates,
    certificates: input.certificates,
    specialityNames: input.specialityNames,
    profileStatus: (cid) => input.profileStatus[cid] ?? null,
  };

  it("matches the published-round cascade and the chained round after it", () => {
    const [round, chained] = golden.runs;
    const first = runCascade({ ...base, merit: input.merit, consent: input.consent, extraRejected: new Set(input.extraRejected) });
    const second = runCascade({ ...base, merit: chained.merit, consent: chained.consent, extraRejected: first.consentRejected });

    for (const [r, g, merit] of [
      [first, round, input.merit],
      [second, chained, chained.merit],
    ] as const) {
      expect(r.placements).toEqual(g.placements);
      expect(r.stats).toEqual(g.stats);
      expect([...r.consentRejected].sort((a, b) => a - b)).toEqual(g.consentRejected);
      expect([...r.consentAwaited].sort((a, b) => a - b)).toEqual(g.consentAwaited);
      expect(compareWithActual(r.placements, merit)).toEqual(g.comparison);
    }
  });
});
