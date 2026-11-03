import { PlaceholderPage } from "@/components/placeholder-page";
import { Badge } from "@/components/ui/badge";
import { Metric } from "@/components/ui/metric";
import { getSession } from "@/lib/auth/session";
import { listPolicyVersions } from "@/lib/data/policies";
import { checkDatabase, getDb } from "@/lib/db/client";

export const metadata = { title: "Admin overview" };
export const dynamic = "force-dynamic";

const dbBadge = {
  ok: <Badge tone="success">Connected</Badge>,
  unreachable: <Badge tone="danger">Unreachable</Badge>,
  not_configured: <Badge tone="warning">Not configured</Badge>,
} as const;

export default async function AdminOverviewPage() {
  const db = await checkDatabase();
  const active = db === "ok" ? (await listPolicyVersions(getDb(), await getSession())).find((r) => r.status === "active") : undefined;
  return (
    <PlaceholderPage href="/admin">
      {/* Only system health is live; induction figures stay empty until real data is imported. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Database" value={db === "ok" ? "Online" : null} badge={dbBadge[db]} hint="Live check" />
        <Metric label="Active induction" value={null} hint="Available after data import" />
        <Metric label="Candidates" value={null} hint="Available after data import" />
        <Metric
          label="Active scoring policy"
          value={active ? active.policyKey : null}
          unit={active ? `v${active.version}` : undefined}
          hint={active ? "Manage under Scoring policies" : "Import scoring_policy.json under Scoring policies"}
        />
      </div>
    </PlaceholderPage>
  );
}
