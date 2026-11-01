import { PlaceholderPage } from "@/components/placeholder-page";
import { Badge } from "@/components/ui/badge";
import { Metric } from "@/components/ui/metric";
import { checkDatabase } from "@/lib/db/client";

export const metadata = { title: "Admin overview" };
export const dynamic = "force-dynamic";

const dbBadge = {
  ok: <Badge tone="success">Connected</Badge>,
  unreachable: <Badge tone="danger">Unreachable</Badge>,
  not_configured: <Badge tone="warning">Not configured</Badge>,
} as const;

export default async function AdminOverviewPage() {
  const db = await checkDatabase();
  return (
    <PlaceholderPage href="/admin">
      {/* Only system health is live; induction figures stay empty until real data is imported. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon="database" label="Database" value={db === "ok" ? "Online" : null} badge={dbBadge[db]} hint="Live check" />
        <Metric icon="calendar" label="Active induction" value={null} hint="Available after data import" />
        <Metric icon="users" label="Candidates" value={null} hint="Available after data import" />
        <Metric icon="sliders" label="Active scoring policy" value={null} hint="Available after policy import" />
      </div>
    </PlaceholderPage>
  );
}
