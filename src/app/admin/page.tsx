import { AreaPage } from "@/components/area-page";
import { BarList } from "@/components/charts/bar-list";
import { StatTiles } from "@/components/charts/stat-tiles";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Metric } from "@/components/ui/metric";
import { can } from "@/lib/auth/roles";
import { getSession, requireSection } from "@/lib/auth/session";
import { latestRoundChange, listInductionsWithRounds, listUnmatchedNames, meritOverview } from "@/lib/data/merit";
import { latestRoundStats } from "@/lib/round-stats";
import { InductionTimeline } from "@/components/charts/induction-timeline";
import { WorkQueues, type Queue } from "@/components/work-queues";
import { pendingChangeCount } from "@/lib/data/changes";
import { communityStats } from "@/lib/data/community";
import { listInbox } from "@/lib/data/inbox";
import { listPolicyVersions } from "@/lib/data/policies";
import { getReferenceOverview } from "@/lib/data/reference-data";
import { checkDatabase, getDb } from "@/lib/db/client";
import { findSection } from "@/lib/navigation";

export const metadata = { title: "Admin overview" };
export const dynamic = "force-dynamic";

const dbBadge = {
  ok: <Badge tone="success">Connected</Badge>,
  unreachable: <Badge tone="danger">Unreachable</Badge>,
  not_configured: <Badge tone="warning">Not configured</Badge>,
} as const;

export default async function AdminOverviewPage() {
  await requireSection("/admin");
  const s = findSection("/admin");
  const status = await checkDatabase();
  const frame = { area: "admin" as const, trail: [{ label: s.label }], isRoot: true, title: s.label, description: "System health, what has been imported, and what needs attention." };
  if (status !== "ok") {
    return (
      <AreaPage {...frame}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Database" value={null} badge={dbBadge[status]} hint="Live check" /></div>
      </AreaPage>
    );
  }
  const db = getDb();
  const session = await getSession();
  const [policies, merit, inductions, unmatched, reference, pendingChanges, change, community] = await Promise.all([
    listPolicyVersions(db, session),
    meritOverview(db, session),
    listInductionsWithRounds(db, session),
    listUnmatchedNames(db, session),
    getReferenceOverview(db, session),
    pendingChangeCount(db, session),
    latestRoundChange(db, session),
    communityStats(db, session),
  ]);
  const reports = community.openReports;
  const active = policies.find((r) => r.status === "active");
  const toMap = unmatched.speciality.length + unmatched.hospital.length;
  const inbox = can(session, "data.edit") || can(session, "policy.edit") ? await listInbox(db, session).catch(() => null) : null;
  const inboxWaiting = inbox?.filter((i) => i.kind !== "unrecognised").length ?? 0;
  const queues: Queue[] = [
    { title: "Changes to review", count: pendingChanges, icon: "history", href: "/admin/changes", cta: pendingChanges ? "Review" : "Open", text: pendingChanges ? "Staged changes wait for a decision before they go live." : "Nothing is waiting to be published." },
    ...(inbox ? [{ title: "Files in the inbox", count: inboxWaiting, icon: "upload" as const, href: "/admin/inductions#inbox", cta: inboxWaiting ? "Import" : "Open", text: inboxWaiting ? "New files on the server, checked and ready to import." : "Drop round, seat or policy files into the server's inbox folder." }] : []),
    ...(can(session, "data.edit") ? [{ title: "Names to map", count: toMap, icon: "list" as const, href: "/admin/inductions", cta: "Map names", text: toMap ? "Published names that match no hospital or speciality yet." : "Every published name is mapped." }] : []),
    ...(can(session, "community.moderate") ? [{ title: "Community reports", count: reports, icon: "flag" as const, href: "/admin/community", cta: "Moderate", text: reports ? "Posts members reported for review." : "No reports waiting." }] : []),
    ...(can(session, "data.edit") && reference.seatMatrices.length === 0 ? [{ title: "Seat matrix", count: 1, icon: "database" as const, href: "/admin/reference-data", cta: "Import", text: "No seat matrix yet: import induction<n>_seats.json." }] : []),
    ...(can(session, "policy.edit") && !active ? [{ title: "Scoring policy", count: 1, icon: "sliders" as const, href: "/admin/policies", cta: "Import", text: "No active policy: import scoring_policy.json so merit shows out of each total." }] : []),
    ...(can(session, "candidates.verify") ? [{ title: "Records to verify", count: null, icon: "users" as const, text: "Arrives with candidate accounts." }] : []),
  ];

  return (
    <AreaPage {...frame}>
      <WorkQueues queues={queues} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Database" value="Online" badge={dbBadge.ok} hint="Live check" />
        <Metric label="Active scoring policy" value={active ? active.policyKey : null} unit={active ? `v${active.version}` : undefined} hint={active ? "Manage under Scoring policies" : "Not imported yet"} />
        <Metric label="Latest induction" value={inductions[0] ? String(inductions[0].id) : null} unit={inductions[0] ? `${inductions[0].rounds.length} rounds` : undefined} hint={inductions[0]?.rounds[0]?.cycleName ?? "No merit rounds yet"} />
        <Metric label="Candidates" value={null} hint="Arrives with candidate accounts" />
      </div>
      <StatTiles
        stats={[
          { label: "Merit rounds", value: merit.rounds },
          { label: "Allocations", value: merit.allocations },
          { label: "Seats in the latest matrix", value: merit.seats },
          { label: "Policy versions", value: policies.length },
        ]}
      />
      {change ? <StatTiles stats={latestRoundStats(change, inductions[0]?.maxMarks ?? undefined)} /> : null}
      {inductions.length ? (
        <Card>
          <CardHeader title="Timeline" description="Imported induction cycles and their rounds." />
          <InductionTimeline inductions={inductions} />
        </Card>
      ) : null}
      <div className="grid grid-cols-1 gap-5">
        <Card>
          <CardHeader title="Allocations per induction" description="Latest round of each." />
          {inductions.length ? (
            <BarList items={inductions.map((i) => ({ label: `Induction ${i.id}`, detail: i.rounds[0]!.cycleName, value: i.rounds.at(-1)!.allocations, href: `/portal/history/${i.id}` }))} format={(v) => v.toLocaleString("en-US")} />
          ) : <p className="text-sm text-muted">No merit rounds imported yet.</p>}
        </Card>
      </div>
    </AreaPage>
  );
}
