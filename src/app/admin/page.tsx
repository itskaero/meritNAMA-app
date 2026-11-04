import Link from "next/link";
import { AreaPage } from "@/components/area-page";
import { BarList } from "@/components/charts/bar-list";
import { StatTiles } from "@/components/charts/stat-tiles";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Metric } from "@/components/ui/metric";
import { can } from "@/lib/auth/roles";
import { getSession, requireSection } from "@/lib/auth/session";
import { listInductionsWithRounds, listUnmatchedNames, meritOverview } from "@/lib/data/merit";
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
  const [policies, merit, inductions, unmatched, reference] = await Promise.all([
    listPolicyVersions(db, session),
    meritOverview(db, session),
    listInductionsWithRounds(db, session),
    listUnmatchedNames(db, session),
    getReferenceOverview(db, session),
  ]);
  const active = policies.find((r) => r.status === "active");
  const toMap = unmatched.speciality.length + unmatched.hospital.length;
  const todo = [
    !active && can(session, "policy.edit") && { href: "/admin/policies", text: "Import scoring_policy.json, so merit can be shown out of each induction's total" },
    reference.seatMatrices.length === 0 && can(session, "data.edit") && { href: "/admin/reference-data", text: "Import a seat matrix (induction<n>_seats.json)" },
    inductions.length === 0 && can(session, "data.edit") && { href: "/admin/inductions", text: "Import merit round files" },
    toMap > 0 && can(session, "data.edit") && { href: "/admin/inductions", text: `Map ${toMap} published names to hospitals and specialities` },
  ].filter(Boolean) as { href: string; text: string }[];

  return (
    <AreaPage {...frame}>
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
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Needs attention" />
          {todo.length ? (
            <ul className="grid gap-2">
              {todo.map((t) => (
                <li key={t.text}><Link href={t.href} className="flex items-center justify-between gap-3 rounded-xl bg-elevated px-4 py-3 text-sm hover:bg-hover"><span>{t.text}</span><span aria-hidden className="text-subtle">→</span></Link></li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">Nothing outstanding.</p>}
        </Card>
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
