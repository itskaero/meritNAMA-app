import type { Policy, PolicyComponent } from "@/lib/domain/scoring-policy";

/**
 * Merit marks from a candidate's own inputs under a scoring policy, ported from the
 * legacy calculator (`js/app-predict-calc.js` runCalculator, public repo
 * itskaero/meritnama @ f686206). Pure. Parity with the legacy code is pinned by
 * tests/score-golden.test.ts.
 *
 * Per component type (only components the policy includes count):
 *   boolean          yes → max marks
 *   percentage       pct/100 × max
 *   years            years × per_year
 *   count            count × per_item
 *   score            score / score_max (default 1100) × max
 *   tiered_select    the chosen tier's value
 *   months           whole 3-month blocks × per_3_months (default 1.25)
 *   fcps_jcat_combo  FCPS Part-I by attempt (the tier's marks), or JCAT % by threshold, or none
 * Each is capped at the component's max marks. Missing inputs count 0.
 */

export type ComboInput = { kind: "fcps"; tier: number } | { kind: "jcat"; pct: number } | { kind: "none" };
/** Per component key: a number (or tier index for tiered_select), a boolean, or a combo choice. */
export type ScoreInputs = Record<string, number | boolean | ComboInput | null | undefined>;

export type ScoreLine = { key: string; label: string; value: string; contribution: number; max: number };
export type ScoreResult = { total: number; totalMarks: number; percent: number; lines: ScoreLine[] };

const round2 = (v: number) => Math.round(v * 100) / 100;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function includedComponents(policy: Policy): PolicyComponent[] {
  return policy.components.filter((c) => c.included !== false);
}

/** The JCAT tier a percentage reaches (highest minimum first), or null. */
export function jcatTier(c: PolicyComponent, pct: number) {
  return [...(c.jcat_thresholds ?? [])].sort((a, b) => b.min - a.min).find((t) => pct >= t.min) ?? null;
}

function line(c: PolicyComponent, input: ScoreInputs[string]): { contribution: number; value: string } {
  const max = c.max_marks;
  const n = num(input);
  switch (c.type) {
    case "boolean":
      return input === true ? { contribution: max, value: "Yes" } : { contribution: 0, value: "No" };
    case "percentage":
      return n == null ? { contribution: 0, value: "—" } : { contribution: Math.min((n / 100) * max, max), value: `${n}%` };
    case "years":
      return n == null ? { contribution: 0, value: "—" } : { contribution: Math.min(n * (c.per_year || 1), max), value: `${n} yr(s)` };
    case "count":
      return n == null ? { contribution: 0, value: "—" } : { contribution: Math.min(n * (c.per_item || 1), max), value: String(n) };
    case "score": {
      const scoreMax = c.score_max || 1100;
      return n == null ? { contribution: 0, value: "—" } : { contribution: Math.min((n / scoreMax) * max, max), value: String(n) };
    }
    case "tiered_select": {
      const tier = n == null ? undefined : c.tiers?.[n];
      return tier ? { contribution: Math.min(tier.value, max), value: tier.label } : { contribution: 0, value: "—" };
    }
    case "months": {
      const per3 = c.per_3_months || 1.25;
      return n == null ? { contribution: 0, value: "—" } : { contribution: Math.min(Math.floor(n / 3) * per3, max), value: `${n} month(s)` };
    }
    case "fcps_jcat_combo": {
      const combo = input && typeof input === "object" ? input : null;
      if (combo?.kind === "fcps") {
        const tier = c.fcps_tiers?.[combo.tier];
        return tier
          ? { contribution: Math.min(tier.marks, max), value: `FCPS ${tier.label} — ${tier.marks} mark${tier.marks !== 1 ? "s" : ""}` }
          : { contribution: 0, value: "—" };
      }
      if (combo?.kind === "jcat" && Number.isFinite(combo.pct)) {
        const tier = jcatTier(c, combo.pct);
        const contribution = tier ? Math.min(tier.value, max) : 0;
        return { contribution, value: `JCAT ${combo.pct}% → ${contribution} mark${contribution !== 1 ? "s" : ""} (${tier?.label ?? "—"})` };
      }
      if (combo?.kind === "none") return { contribution: 0, value: "None / Not applicable" };
      return { contribution: 0, value: "—" };
    }
  }
}

export function computeScore(policy: Policy, inputs: ScoreInputs): ScoreResult {
  let total = 0;
  const lines: ScoreLine[] = [];
  for (const c of includedComponents(policy)) {
    const { contribution, value } = line(c, inputs[c.key]);
    total += contribution;
    lines.push({ key: c.key, label: c.label, value, contribution: round2(contribution), max: c.max_marks });
  }
  total = round2(total);
  const totalMarks = policy.total_marks || 100;
  return { total, totalMarks, percent: round2((total / totalMarks) * 100), lines };
}
