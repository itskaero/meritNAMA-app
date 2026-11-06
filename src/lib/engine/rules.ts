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

// ── Helpers for storing, choosing and reviewing rules ──────────────────────────

type PolicyVersionLike = { policyKey: string; version: number; status: string; definition: Policy };

/**
 * The scoring policy that applies to an induction: per policy key the active version,
 * else the newest; then the key whose `induction` covers it (the active key wins if
 * two do). Null when no policy covers the induction.
 */
export function policyForInduction<T extends PolicyVersionLike>(versions: readonly T[], induction: number, covers: (p: Policy) => number[]): T | null {
  const current = new Map<string, T>();
  for (const v of versions) {
    const seen = current.get(v.policyKey);
    if (!seen || (v.status === "active" && seen.status !== "active") || (seen.status !== "active" && v.version > seen.version)) current.set(v.policyKey, v);
  }
  const matching = [...current.values()].filter((v) => covers(v.definition).includes(induction));
  return matching.find((v) => v.status === "active") ?? matching.sort((a, b) => b.version - a.version || a.policyKey.localeCompare(b.policyKey))[0] ?? null;
}

function flatten(value: unknown, prefix = "", out = new Map<string, string>()) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  } else {
    out.set(prefix, JSON.stringify(value));
  }
  return out;
}

/** Settings that differ between two rule sets, as dotted paths with JSON values. */
export function rulesDiff(before: AllocationRules, after: AllocationRules) {
  const a = flatten(before);
  const b = flatten(after);
  const rows: { setting: string; from: string; to: string }[] = [];
  for (const k of new Set([...a.keys(), ...b.keys()])) {
    if (k === "label") continue;
    const x = a.get(k) ?? "—";
    const y = b.get(k) ?? "—";
    if (x !== y) rows.push({ setting: k, from: x, to: y });
  }
  return rows;
}

/** One line per rule, in words, for admin pages and previews. */
export function describeRules(r: ResolvedRules): { topic: string; text: string }[] {
  const c = r.certificateBonus;
  const onOff = (x: { on: boolean; cap: number | null }, enabled: boolean | "auto", component: string) =>
    `${x.on ? `counted${x.cap != null ? `, at most ${x.cap} marks` : ""}` : "not counted"} (${enabled === "auto" ? `follows the scoring policy's ${component}` : `set ${enabled ? "on" : "off"} here`})`;
  const sourceName = { certificateMarks: "portal certificate marks", computerizedMarks: "computerised marks", preferenceProgramMarks: "the preference's programme marks" } as const;
  return [
    { topic: "Certificate bonus", text: onOff(r.certificate, c.enabled, c.component) },
    {
      topic: "Which certificate",
      text: `${c.combine === "max" ? "the best" : "the first"} matching certificate, matched by discipline${c.matchByName ? " (or by speciality name when a preference has no discipline)" : ""}, ${c.typeMatch === "strict" ? "same programme type only" : "programme type ignored when missing"}${c.requirePass ? ", passed only" : ""}; worth the first of ${c.sources.map((s) => sourceName[s]).join(", ")}${c.fallback === "programMarks" ? "; otherwise the candidate's per-programme marks" : ""}`,
    },
    { topic: "Parent-institute bonus", text: onOff(r.parent, r.parentBonus.enabled, r.parentBonus.component) },
    {
      topic: "Tracks",
      text: `${r.tracks.separate.map((t) => `${t.id} (quotas containing ${t.quotaContains.map((q) => `“${q}”`).join(" or ")})`).join(", ") || "none"} separate from ${r.tracks.defaultTrack}; one seat per track`,
    },
    {
      topic: "First round",
      text: `best mark first${r.placement.orderBy === "bestMarkWithoutParentBonus" ? " (ordered without the parent bonus, as the legacy simulator did)" : ""}; a full seat changes hands only on a strictly higher mark; at most ${r.placement.maxPasses} passes`,
    },
    {
      topic: "Later rounds",
      text: `profile status ${r.cascade.eligibleProfileStatus.join(" or ")} may hold seats; ${r.cascade.lockAcceptedFirstPreference === "programme" ? "accepting the 1st preference blocks moving to another programme" : "nobody is locked"}; one seat per ${r.cascade.seatHolding === "perProgramme" ? "programme" : "quota"}; at most ${r.cascade.maxWaves} waves`,
    },
  ];
}
