import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { StatusPill } from "@/components/ui/page-header";
import { AreaPage } from "@/components/area-page";
import { getSession } from "@/lib/auth/session";
import { formatUtc } from "@/lib/format";
import { exportScoringPolicyFile, listPolicyVersions } from "@/lib/data/policies";
import { checkDatabase, getDb } from "@/lib/db/client";
import { findSection } from "@/lib/navigation";
import { ImportForm } from "./forms";

export const metadata = { title: "Scoring policies" };
export const dynamic = "force-dynamic";

const statusTone = { active: "current", draft: "neutral", retired: "historical" } as const;

export default async function PoliciesPage() {
  const s = findSection("/admin/policies");
  const session = await getSession();
  const dbStatus = await checkDatabase();
  const db = dbStatus === "ok" ? getDb() : null;
  const rows = db ? await listPolicyVersions(db, session) : [];
  const exported = db ? await exportScoringPolicyFile(db, session) : null;

  return (
    <AreaPage
      area="admin"
      trail={[{ label: s.label }]}
      title={s.label}
      description="Import, review, edit and activate scoring policies, and export them back to the public site's scoring_policy.json."
      status={dbStatus === "ok" ? <StatusPill tone="live">Live data</StatusPill> : <StatusPill tone="warning">Database unavailable</StatusPill>}
    >
      {dbStatus !== "ok" ? (
        <EmptyState title="Database not available">Configure DATABASE_URL and run migrations to manage scoring policies.</EmptyState>
      ) : (
        <>
          <Card>
            <CardHeader
              title="Stored versions"
              description="Every save creates a new version; nothing is overwritten. Open a version to view, edit or activate it."
              action={
                exported?.ok ? (
                  <ButtonLink href="/admin/policies/export" variant="secondary" size="sm" prefetch={false}>Export JSON</ButtonLink>
                ) : null
              }
            />
            {exported && !exported.ok && exported.reason === "invalid" ? (
              <div className="mb-4">
                <Notice tone="warning" title="The stored policies do not form a valid file right now">
                  <ul className="list-disc pl-5 font-mono text-xs">
                    {exported.issues.slice(0, 10).map((i, n) => <li key={n}>{i}</li>)}
                  </ul>
                </Notice>
              </div>
            ) : null}
            <DataTable
              caption="Scoring policy versions"
              rows={rows}
              rowKey={(r) => r.id}
              empty={<EmptyState title="No policy versions stored yet">Import the public site&apos;s scoring_policy.json below to get started.</EmptyState>}
              columns={[
                {
                  key: "key",
                  header: "Policy",
                  cell: (r) => (
                    <Link href={`/admin/policies/${r.id}`} className="font-medium text-signal underline-offset-4 hover:underline">
                      {r.policyKey}
                    </Link>
                  ),
                },
                { key: "version", header: "Version", cell: (r) => `v${r.version}`, align: "right" },
                { key: "status", header: "Status", cell: (r) => <Badge tone={statusTone[r.status]}>{r.status}</Badge> },
                { key: "created", header: "Created (UTC)", cell: (r) => formatUtc(r.createdAt) },
                { key: "activated", header: "Activated (UTC)", cell: (r) => formatUtc(r.activatedAt) },
              ]}
            />
          </Card>
          <Card>
            <CardHeader title="Import scoring_policy.json" description="Use the file from the public meritnama repository (data/scoring_policy.json)." />
            <ImportForm />
          </Card>
        </>
      )}
    </AreaPage>
  );
}
