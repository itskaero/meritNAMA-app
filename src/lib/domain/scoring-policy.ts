import { z } from "zod";

/**
 * Data contract for the scoring policy, derived from the real
 * meritnama/data/scoring_policy.json (policies 2020 … 2026). The calculation
 * engine itself is NOT ported yet — this only validates the shape and the
 * invariants an admin edit must keep.
 */

const tier = z.strictObject({ label: z.string().min(1), value: z.number().min(0) });
const fcpsTier = z.strictObject({ label: z.string().min(1), marks: z.number().min(0) });
const threshold = z.strictObject({ min: z.number().min(0), value: z.number().min(0), label: z.string().min(1) });

export const COMPONENT_TYPES = [
  "percentage",
  "boolean",
  "score",
  "years",
  "months",
  "count",
  "tiered_select",
  "fcps_jcat_combo",
] as const;

export const policyComponentSchema = z
  .strictObject({
    key: z.string().regex(/^[a-z][a-z0-9_]*$/, "lowercase snake_case"),
    label: z.string().min(1),
    max_marks: z.number().min(0),
    type: z.enum(COMPONENT_TYPES),
    description: z.string().optional(),
    /** Absent means included. Not defaulted, so a stored definition stays identical to its source. */
    included: z.boolean().optional(),
    per_year: z.number().min(0).optional(),
    per_item: z.number().min(0).optional(),
    per_3_months: z.number().min(0).optional(),
    score_max: z.number().positive().optional(),
    tiers: z.array(tier).min(1).optional(),
    fcps_tiers: z.array(fcpsTier).min(1).optional(),
    jcat_thresholds: z.array(threshold).min(1).optional(),
  })
  .superRefine((c, ctx) => {
    const need = (field: keyof typeof c) => {
      if (c[field] === undefined) ctx.addIssue({ code: "custom", path: [field], message: `required for type "${c.type}"` });
    };
    switch (c.type) {
      case "years": need("per_year"); break;
      case "count": need("per_item"); break;
      case "months": need("per_3_months"); break;
      case "tiered_select": need("tiers"); break;
      case "fcps_jcat_combo": need("fcps_tiers"); need("jcat_thresholds"); break;
    }
    if (c.tiers?.some((t) => t.value > c.max_marks)) {
      ctx.addIssue({ code: "custom", path: ["tiers"], message: "a tier exceeds max_marks" });
    }
  });

export const policySchema = z
  .strictObject({
    label: z.string().min(1),
    /** A single induction number, or an inclusive range such as "9-10" or "17-19". */
    induction: z.union([z.number().int().positive(), z.string().regex(/^\d+-\d+$/, 'range like "9-10"')]),
    total_marks: z.number().positive(),
    policy_ref: z.string().optional(),
    notes: z.string().optional(),
    tidbits: z.array(z.string()).optional(),
    components: z.array(policyComponentSchema).min(1),
  })
  .superRefine((p, ctx) => {
    const [from, to] = inductionRange(p.induction);
    if (from > to) ctx.addIssue({ code: "custom", path: ["induction"], message: "range start is after its end" });

    const keys = p.components.map((c) => c.key);
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
    if (dupes.length) ctx.addIssue({ code: "custom", path: ["components"], message: `duplicate component keys: ${[...new Set(dupes)].join(", ")}` });

    const sum = includedMaxTotal(p.components);
    if (Math.abs(sum - p.total_marks) > 1e-9) {
      ctx.addIssue({
        code: "custom",
        path: ["total_marks"],
        message: `included components sum to ${sum}, but total_marks is ${p.total_marks}`,
      });
    }
  });

export const policyKeySchema = z.string().regex(/^\d{4}(-\d+)?$/, 'policy key like "2026" or "2026-1"');

export const scoringPolicyFileSchema = z
  .looseObject({
    active_policy: policyKeySchema,
    _induction_max: z.record(z.string(), z.union([z.number(), z.string()])),
    year_total_max: z.record(z.string(), z.number().positive()),
    policies: z.record(policyKeySchema, policySchema),
  })
  .superRefine((f, ctx) => {
    if (!(f.active_policy in f.policies)) {
      ctx.addIssue({ code: "custom", path: ["active_policy"], message: `"${f.active_policy}" is not a defined policy` });
    }
    for (const [key, p] of Object.entries(f.policies)) {
      for (const n of policyInductions(p)) {
        const max = f._induction_max[String(n)];
        if (typeof max === "number" && max !== p.total_marks) {
          ctx.addIssue({
            code: "custom",
            path: ["policies", key, "total_marks"],
            message: `induction ${n} max is ${max} in _induction_max but policy says ${p.total_marks}`,
          });
        }
      }
    }
  });

export type PolicyComponent = z.infer<typeof policyComponentSchema>;
export type Policy = z.infer<typeof policySchema>;
export type ScoringPolicyFile = z.infer<typeof scoringPolicyFileSchema>;

export function includedMaxTotal(components: Pick<PolicyComponent, "included" | "max_marks">[]): number {
  return components.filter((c) => c.included !== false).reduce((s, c) => s + c.max_marks, 0);
}

function inductionRange(induction: number | string): [number, number] {
  if (typeof induction === "number") return [induction, induction];
  const [a, b] = induction.split("-").map(Number);
  return [a!, b!];
}

/** Every induction number a policy applies to. */
export function policyInductions(p: Pick<Policy, "induction">): number[] {
  const [from, to] = inductionRange(p.induction);
  return Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);
}

