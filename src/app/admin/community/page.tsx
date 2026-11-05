import Link from "next/link";
import { AreaPage } from "@/components/area-page";
import { StatTiles } from "@/components/charts/stat-tiles";
import { whenDatabaseDown } from "@/components/database-unavailable";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getSession, requireSection } from "@/lib/auth/session";
import { communityStats, listOpenReports } from "@/lib/data/community";
import { getDb } from "@/lib/db/client";
import { findSection } from "@/lib/navigation";
import { ModerationControls } from "./forms";

export const metadata = { title: "Community moderation" };
export const dynamic = "force-dynamic";

export default async function ModerationPage() {
  await requireSection("/admin/community");
  const s = findSection("/admin/community");
  const down = await whenDatabaseDown({ area: "admin", trail: [{ label: s.label }], title: s.label, description: s.description });
  if (down) return down;const db = getDb();
  const session = await getSession();
  const [reports, stats] = await Promise.all([listOpenReports(db, session), communityStats(db, session)]);
  return (
    <AreaPage area="admin" trail={[{ label: s.label }]} title={s.label} description={s.description}>
      <StatTiles stats={[{ label: "Open reports", value: stats.openReports }, { label: "Visible discussions", value: stats.threads }, { label: "Visible replies", value: stats.replies }]} />
      <Card>
        <CardHeader title="Reports" description="Most-reported first. Hiding a post resolves its reports; every action is audited with your reason." />
        {reports.length === 0 ? (
          <EmptyState title="Nothing to review">Reports from members appear here.</EmptyState>
        ) : (
          <ul className="grid gap-3">
            {reports.map((r) => (
              <li key={`${r.target_kind}-${r.target_id}`} className="grid gap-3 rounded-2xl border border-line bg-canvas p-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge tone="danger">{r.reports} {r.reports === 1 ? "report" : "reports"}</Badge>
                  <Badge>{r.target_kind === "thread" ? "Question" : r.target_kind === "post" ? "Answer" : "Hospital review"}</Badge>
                  {r.status === "hidden" ? <Badge tone="warning">Already hidden</Badge> : null}
                  {r.thread_id ? <Link href={`/portal/community/${r.thread_id}`} className="font-medium text-signal hover:underline">{r.thread_title}</Link> : r.review_hospital_id ? <Link href={`/portal/explore/hospitals/${r.review_hospital_id}#reviews`} className="font-medium text-signal hover:underline">{r.thread_title}</Link> : <span className="text-muted">Removed</span>}
                </div>
                {r.excerpt ? <blockquote className="border-l-2 border-line-strong pl-3 text-sm text-muted">{r.excerpt}</blockquote> : null}
                <p className="text-xs text-subtle">Reasons: {r.reasons.join(" · ")}</p>
                <ModerationControls kind={r.target_kind} id={r.target_id} state={{ hidden: r.status === "hidden" }} allowDismiss />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </AreaPage>
  );
}
