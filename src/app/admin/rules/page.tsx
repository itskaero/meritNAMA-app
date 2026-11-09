import Link from "next/link";
import { AreaPage } from "@/components/area-page";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/page-header";
import { getSession, requireSection } from "@/lib/auth/session";
import { listRulesVersions, rulesOverview } from "@/lib/data/allocation-rules";
import { checkDatabase, getDb } from "@/lib/db/client";
import { DEFAULT_RULES } from "@/lib/engine/rules";
import { formatUtc } from "@/lib/format";
import { findSection } from "@/lib/navigation";
import { RulesDraftForm } from "./forms";

export const metadata = { title: "Allocation rules" };
export const dynamic = "force-dynamic";

const statusTone = { active: "current", draft: "neutral", retired: "historical" } as const;
const bonus = (b: { on: boolean; cap: number | null } | undefined) => (!b ? "—" : b.on ? `on${b.cap != null ? ` · max ${b.cap}` : ""}` : "off");

export default async function RulesPage() {
  await requireSection("/admin/rules");
  const s = findSection("/admin/rules");
  const session = await getSession();
  const dbStatus = await checkDatabase();
  const db = dbStatus === "ok" ? getDb() : null;
  const overview = db ? await rulesOverview(db, session) : [];
  const versions = db ? await listRulesVersions(db, session) : [];

  return (
    <AreaPage
      area="admin"
      trail={[{ label: s.label }]}
      title={s.label}
      description="How each induction's seats are allocated in the simulation. The scoring policy decides whether the certificate and parent bonuses count and caps them; these rules decide how they are applied, how quotas split into tracks and how later rounds behave."
      status={dbStatus === "ok" ? <StatusPill tone="live">Live data</StatusPill> : <StatusPill tone="warning">Database unavailable</StatusPill>}
    >
      {!db ? (
        <EmptyState title="Database not available">Configure DATABASE_URL and run migrations to manage allocation rules.</EmptyState>
      ) : (
        <>
          <Card>
            <CardHeader title="Inductions" description="The rules each induction runs under. An induction without its own active rules uses the default rules." />
            <DataTable
              caption="Rules per induction"
              rows={overview}
              rowKey={(r) => String(r.induction)}
              empty={<EmptyState title="No inductions yet">Import merit rounds or seats, or save rules for an induction below.</EmptyState>}
              columns={[
                { key: "n", header: "Induction", cell: (r) => r.induction },
                {
                  key: "rules",
                  header: "Rules",
                  cell: (r) =>
                    r.origin.kind === "stored" ? (
                      <Link href={`/admin/rules/${r.origin.id}`} className="font-medium text-signal underline-offset-4 hover:underline">
                        {r.rules.label} · v{r.origin.version}
                      </Link>
                    ) : (
                      <span className="text-muted">Default rules</span>
                    ),
                },
                { key: "policy", header: "Scoring policy", cell: (r) => (r.policy ? `${r.policy.policyKey} v${r.policy.version}` : <span className="text-muted">none covers it</span>) },
                { key: "cert", header: "Certificate bonus", cell: (r) => (r.problem ? <Badge tone="warning">needs a policy</Badge> : bonus(r.resolved?.certificate)) },
                { key: "parent", header: "Parent bonus", cell: (r) => (r.problem ? "—" : bonus(r.resolved?.parent)) },
              ]}
            />
          </Card>

          <Card>
            <CardHeader title="Stored versions" description="Every save creates a new version. Open one to read it in words, edit it or activate it." />
            <DataTable
              caption="Allocation rule versions"
              rows={versions}
              rowKey={(r) => r.id}
              empty={<EmptyState title="No versions stored yet">Every induction uses the default rules until you save and activate its own.</EmptyState>}
              columns={[
                { key: "n", header: "Induction", cell: (r) => r.inductionId },
                {
                  key: "label",
                  header: "Rules",
                  cell: (r) => (
                    <Link href={`/admin/rules/${r.id}`} className="font-medium text-signal underline-offset-4 hover:underline">
                      {r.label} · v{r.version}
                    </Link>
                  ),
                },
                { key: "status", header: "Status", cell: (r) => <Badge tone={statusTone[r.status]}>{r.status}</Badge> },
                { key: "by", header: "Saved by", cell: (r) => r.createdBy },
                { key: "created", header: "Saved (UTC)", cell: (r) => formatUtc(r.createdAt) },
                { key: "activated", header: "Activated (UTC)", cell: (r) => formatUtc(r.activatedAt) },
              ]}
            />
          </Card>

          <Card>
            <CardHeader title="New rules for an induction" description="Starts from the default rules. To change an induction that already has rules, open its version and edit that instead." />
            <RulesDraftForm definition={JSON.stringify(DEFAULT_RULES, null, 2)} />
          </Card>
        </>
      )}
    </AreaPage>
  );
}
