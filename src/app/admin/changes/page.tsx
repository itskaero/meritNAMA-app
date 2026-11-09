import Link from "next/link";
import { AreaPage } from "@/components/area-page";
import { whenDatabaseDown } from "@/components/database-unavailable";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { requireSection } from "@/lib/auth/session";
import { listChanges } from "@/lib/data/changes";
import { getDb } from "@/lib/db/client";
import { formatUtc } from "@/lib/format";
import { findSection } from "@/lib/navigation";
import { STATUS_TONE, statusLabel } from "./status";

export const metadata = { title: "Changes to review" };
export const dynamic = "force-dynamic";


export default async function ChangesPage() {
  const session = await requireSection("/admin/changes");
  const s = findSection("/admin/changes");
  const frame = { area: "admin" as const, trail: [{ label: s.label }], title: s.label, description: s.description };
  const down = await whenDatabaseDown(frame);
  if (down) return down;
  const changes = await listChanges(getDb(), session);
  const pending = changes.filter((c) => c.status === "pending");
  const decided = changes.filter((c) => c.status !== "pending");

  return (
    <AreaPage {...frame}>
      <Card>
        <CardHeader title={`Waiting for review · ${pending.length}`} description="Each one shows what will change before anything is applied." />
        {pending.length === 0 ? (
          <EmptyState title="Nothing waiting">Replacing a seat matrix or a merit round, removing a round, activating a policy or re-importing the policy file lands here first.</EmptyState>
        ) : (
          <ul className="grid gap-3">
            {pending.map((c) => (
              <li key={c.id}>
                <Link href={`/admin/changes/${c.id}`} className="mn-rise flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber/30 bg-amber/5 px-4 py-3 hover:border-amber/60">
                  <span className="min-w-0">
                    <span className="block font-semibold">{c.title}</span>
                    <span className="block text-sm text-muted">Proposed by {c.createdBy} · {formatUtc(c.createdAt)} UTC · “{c.reason}”</span>
                  </span>
                  <span className="text-sm font-semibold text-signal">{c.canDecide ? "Review →" : "View →"}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <CardHeader title="History" description="Published changes can be rolled back from their page while no later change to the same data was published." />
        <DataTable
          caption="Decided changes"
          rows={decided}
          rowKey={(c) => c.id}
          empty={<p className="text-sm text-muted">No decisions yet.</p>}
          columns={[
            { key: "t", header: "Change", cell: (c) => <Link href={`/admin/changes/${c.id}`} className="text-signal hover:underline">{c.title}</Link> },
            { key: "s", header: "Status", cell: (c) => <Badge tone={STATUS_TONE[c.status]}>{statusLabel(c.status)}</Badge> },
            { key: "b", header: "Decided by", tone: "muted", cell: (c) => c.decidedBy ?? "—" },
            { key: "w", header: "When (UTC)", tone: "muted", cell: (c) => formatUtc(c.decidedAt) },
          ]}
        />
      </Card>
    </AreaPage>
  );
}
