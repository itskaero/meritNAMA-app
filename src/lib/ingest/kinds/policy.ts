import { eq } from "drizzle-orm";
import { proposePolicyFile } from "@/lib/data/changes";
import { scoringPolicies } from "@/lib/db/schema";
import { scoringPolicyFileSchema } from "@/lib/domain/scoring-policy";
import { PARSED_MAX_BYTES, plainIssues, type FileKind } from "../kind";

/** scoring_policy.json: every policy version. A new active policy is staged for review. */
export const policyKind: FileKind = {
  kind: "policy",
  label: "Scoring policy",
  order: 0,
  official: true,
  fromPath: (p) => (/^scoring_policy\.json$/i.test(p.name) ? { kind: "policy", induction: null, round: null } : null),
  fromContents: { rank: 3, match: (d) => (scoringPolicyFileSchema.safeParse(d).success ? { kind: "policy", induction: null, round: null } : null) },
  maxBytes: PARSED_MAX_BYTES,
  async check({ db, json }) {
    const r = scoringPolicyFileSchema.safeParse(await json());
    if (!r.success) return { status: "problem", summary: null, message: plainIssues(r).join("; ") };
    const [a] = await db.select({ id: scoringPolicies.id }).from(scoringPolicies).where(eq(scoringPolicies.status, "active")).limit(1);
    return { status: a ? "replaces" : "new", summary: `${Object.keys(r.data.policies).length} policies, active "${r.data.active_policy}"`, message: a ? "A scoring policy is live now; this one waits for your review." : null };
  },
  async apply({ db, session, json, reason }) {
    return { result: await proposePolicyFile(db, session, { file: await json(), reason }), status: "live" };
  },
};
