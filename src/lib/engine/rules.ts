import { z } from "zod";
import type { Policy } from "@/lib/domain/scoring-policy";

/**
 * Allocation rules: HOW an induction's seats are allocated, as data.
 *
 * The scoring policy says WHETHER a preference-level bonus counts and HOW MUCH it can
 * be worth (its component is included, with `max_marks`). These rules say how the
 * bonus is found and applied, how quotas split into tracks, and how the next-round
 * cascade behaves. Every setting picks one of a fixed set of behaviours implemented
 * in code; a new kind of behaviour needs code and a test, never a policy edit.
 *
 * `resolveRules` combines the two into what the engines run with.
 */

const SOURCE = z.enum(["certificateMarks", "computerizedMarks", "preferenceProgramMarks"]);

/** "auto": follow the scoring policy component; true/false: an explicit, visible override. */
const ENABLED = z.union([z.literal("auto"), z.boolean()]);

export const allocationRulesSchema = z.strictObject({
  label: z.string().min(1),
  certificateBonus: z.strictObject({
    enabled: ENABLED,
    /** Scoring-policy component that switches this bonus on and caps it. */
    component: z.string().min(1),
    /** Match a certificate to a preference by discipline id; by speciality name when the preference has no discipline ids. */
    matchByName: z.boolean(),
    /** "lenient": a missing programme type on either side still matches; "strict": types must be equal. */
    typeMatch: z.enum(["lenient", "strict"]),
    /** A certificate's value: the first of these that is a positive number. */
    sources: z.array(SOURCE).min(1),
    /** "max": best matching certificate; "first": first matching certificate in file order. */
    combine: z.enum(["max", "first"]),
    /** Only certificates with status "Pass" count. */
    requirePass: z.boolean(),
    /** When no certificate gives a value: the candidate's per-programme marks from the file, or nothing. */
    fallback: z.enum(["programMarks", "none"]),
  }),
  parentBonus: z.strictObject({
    enabled: ENABLED,
    component: z.string().min(1),
  }),
  /** Quotas whose normalised name contains one of `quotaContains` form that track; the rest form `defaultTrack`. */
  tracks: z.strictObject({
    separate: z.array(z.strictObject({ id: z.string().regex(/^[a-z][a-z0-9-]*$/), quotaContains: z.array(z.string().min(1)).min(1) })),
    defaultTrack: z.string().regex(/^[a-z][a-z0-9-]*$/),
  }),
  placement: z.strictObject({
    /**
     * A challenger takes a full seat from its lowest holder only with strictly higher
     * marks; on a tie the holder keeps it. (Letting ties displace would make two equal
     * candidates swap until the pass limit, so it is not offered.)
     */
    displaceWhen: z.literal("strictlyHigher"),
    /**
     * Order candidates are processed in: by their best mark, bonuses included; or, as the
     * legacy simulator did, by their best mark without the parent bonus (which still
     * counted when contesting a seat). Legacy parity only.
     */
    orderBy: z.enum(["bestMark", "bestMarkWithoutParentBonus"]),
    maxPasses: z.number().int().positive().max(10_000),
  }),
  cascade: z.strictObject({
    /** Profile statuses that may keep and take seats (1 = Accepted). A known other status loses its seats. */
    eligibleProfileStatus: z.array(z.number().int()).min(1),
    /** Accepting the first preference blocks moves to another programme, or nothing is locked. */
    lockAcceptedFirstPreference: z.enum(["programme", "none"]),
    /** Seats held at once: one per quota (one per programme for candidates seated in two quotas of it), or one per programme. */
    seatHolding: z.enum(["perQuota", "perProgramme"]),
    maxWaves: z.number().int().positive().max(1000),
  }),
});

export type AllocationRules = z.infer<typeof allocationRulesSchema>;

/** Rules for new inductions: the best certificate counts, and policy components decide what is on. */
export const DEFAULT_RULES: AllocationRules = {
  label: "Default",
  certificateBonus: {
    enabled: "auto",
    component: "fcps_jcat",
    matchByName: true,
    typeMatch: "lenient",
    sources: ["certificateMarks", "computerizedMarks", "preferenceProgramMarks"],
    combine: "max",
    requirePass: false,
    fallback: "programMarks",
  },
  parentBonus: { enabled: "auto", component: "parent_institute" },
  tracks: { separate: [{ id: "armed", quotaContains: ["armed force"] }], defaultTrack: "civilian" },
  placement: { displaceWhen: "strictlyHigher", orderBy: "bestMark", maxPasses: 1000 },
  cascade: { eligibleProfileStatus: [1], lockAcceptedFirstPreference: "programme", seatHolding: "perQuota", maxWaves: 100 },
};

/**
 * The legacy simulator's behaviour, for parity tests only. The legacy first round and
 * cascade found certificate marks differently, hence two presets.
 */
export const LEGACY_FIRST_ROUND_RULES: AllocationRules = {
  ...DEFAULT_RULES,
  label: "Legacy simulator, first round",
  certificateBonus: { ...DEFAULT_RULES.certificateBonus, enabled: true, combine: "first" },
  parentBonus: { ...DEFAULT_RULES.parentBonus, enabled: false },
  placement: { ...DEFAULT_RULES.placement, orderBy: "bestMarkWithoutParentBonus" },
};

export const LEGACY_CASCADE_RULES: AllocationRules = {
  ...DEFAULT_RULES,
  label: "Legacy simulator, cascade",
  certificateBonus: {
    ...DEFAULT_RULES.certificateBonus,
    enabled: true,
    matchByName: false,
    typeMatch: "strict",
    sources: ["certificateMarks", "computerizedMarks"],
    combine: "max",
    fallback: "none",
  },
  parentBonus: { ...DEFAULT_RULES.parentBonus, enabled: false },
};

/** What the engines run with: rules plus the scoring policy's switches and caps. */
export type ResolvedRules = AllocationRules & {
  certificate: { on: boolean; cap: number | null };
  parent: { on: boolean; cap: number | null };
};

export class RulesError extends Error {}

function resolveBonus(enabled: boolean | "auto", component: string, policy: Policy | null | undefined, what: string) {
  const c = policy?.components.find((x) => x.key === component);
  const counted = !!c && c.included !== false;
  if (enabled === "auto") {
    if (!policy) throw new RulesError(`${what} is "auto" but no scoring policy was given`);
    return { on: counted, cap: counted ? c!.max_marks : null };
  }
  // An explicit override keeps the policy's cap when the component is counted there.
  return { on: enabled, cap: enabled && counted ? c!.max_marks : null };
}

export function resolveRules(rules: AllocationRules, policy?: Policy | null): ResolvedRules {
  const parsed = allocationRulesSchema.parse(rules);
  return {
    ...parsed,
    certificate: resolveBonus(parsed.certificateBonus.enabled, parsed.certificateBonus.component, policy, "certificateBonus.enabled"),
    parent: resolveBonus(parsed.parentBonus.enabled, parsed.parentBonus.component, policy, "parentBonus.enabled"),
  };
}
