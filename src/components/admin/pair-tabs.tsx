import { Segmented } from "../ui/segmented";

/** Two admin pages that share one menu item (Policies & rules, Changes & audit). */
const PAIRS = {
  policies: [{ href: "/admin/policies", label: "Scoring policies" }, { href: "/admin/rules", label: "Allocation rules" }],
  changes: [{ href: "/admin/changes", label: "Changes to review" }, { href: "/admin/audit", label: "Audit history" }],
} as const;

export function PairTabs({ pair, current }: { pair: keyof typeof PAIRS; current: string }) {
  return <Segmented label={pair === "policies" ? "Policies and rules" : "Changes and audit"} items={PAIRS[pair].map((t) => ({ ...t, active: t.href === current }))} />;
}
