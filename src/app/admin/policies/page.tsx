import { PlaceholderPage } from "@/components/placeholder-page";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { getSession } from "@/lib/auth/session";
import { listPolicyVersions } from "@/lib/data/policies";
import { checkDatabase, getDb } from "@/lib/db/client";

export const metadata = { title: "Scoring policies" };
export const dynamic = "force-dynamic";

export default async function PoliciesPage() {
  const session = await getSession();
  const dbStatus = await checkDatabase();
  const rows = dbStatus === "ok" ? await listPolicyVersions(getDb(), session) : [];

  return (
    <PlaceholderPage href="/admin/policies">
      <Card>
        <CardHeader title="Stored policy versions" description="Read through the server-side data-access layer, which re-checks the admin role." />
        {dbStatus !== "ok" ? (
          <EmptyState title="Database not available">Configure DATABASE_URL and run migrations to list policy versions.</EmptyState>
        ) : (
          <DataTable
            caption="Scoring policy versions"
            rows={rows}
            rowKey={(r) => r.id}
            empty={<EmptyState title="No policy versions stored yet">Importing the existing scoring_policy.json is part of delivery 2.</EmptyState>}
            columns={[
              { key: "key", header: "Policy", cell: (r) => r.policyKey },
              { key: "version", header: "Version", cell: (r) => `v${r.version}`, align: "right" },
              { key: "status", header: "Status", cell: (r) => <Badge tone={r.status === "active" ? "current" : "neutral"}>{r.status}</Badge> },
              { key: "created", header: "Created", cell: (r) => r.createdAt.toISOString().slice(0, 16).replace("T", " ") },
            ]}
          />
        )}
      </Card>
    </PlaceholderPage>
  );
}
