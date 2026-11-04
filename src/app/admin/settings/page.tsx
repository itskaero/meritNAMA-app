import { AreaPage } from "@/components/area-page";
import { whenDatabaseDown } from "@/components/database-unavailable";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { CAPABILITIES, ROLE_DESCRIPTIONS, ROLE_LABELS, STAFF_ROLES, type Capability } from "@/lib/auth/roles";
import { requireSection } from "@/lib/auth/session";
import { listTeam } from "@/lib/data/team";
import { getDb } from "@/lib/db/client";
import { findSection } from "@/lib/navigation";
import { AddMemberForm, RoleRow } from "./forms";

export const metadata = { title: "Team & roles" };
export const dynamic = "force-dynamic";

const CAPABILITY_LABELS: Record<Capability, string> = {
  staff: "Admin workspace",
  "data.edit": "Merit rounds and reference data",
  "policy.edit": "Scoring policies",
  "candidates.verify": "Candidate verification",
  "community.moderate": "Community moderation",
  "roles.manage": "Team & roles",
};

export default async function TeamPage() {
  const session = await requireSection("/admin/settings");
  const s = findSection("/admin/settings");
  const frame = { area: "admin" as const, trail: [{ label: s.label }], title: s.label, description: s.description };
  const down = await whenDatabaseDown(frame);
  if (down) return down;
  const team = await listTeam(getDb(), session);

  return (
    <AreaPage {...frame}>
      {session.isStub ? (
        <Notice tone="warning" title="Development sign-in">
          You are signed in through the development stub, whose role comes from DEV_AUTH_STUB_ROLE. Roles saved here apply to real accounts once sign-in is connected.
        </Notice>
      ) : null}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title={`Team · ${team.length}`} description="Change a role or remove it (choose “No team role”). The last owner cannot be removed." />
          {team.length === 0 ? (
            <EmptyState title="No team members yet">Give someone a role with the form.</EmptyState>
          ) : (
            <ul className="grid gap-3">
              {team.map((m) => (
                <li key={m.id} className="rounded-xl bg-canvas p-3">
                  <RoleRow email={m.email} role={m.role} isMe={m.email === session.email} />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="grid content-start gap-5">
          <Card>
            <CardHeader title="Add someone" />
            <AddMemberForm />
          </Card>
        </div>
      </div>
      <Card>
        <CardHeader title="What each role can do" />
        <div className="relative overflow-x-auto rounded-2xl border border-line">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Roles and the areas they can open</caption>
            <thead className="bg-elevated text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Role</th>
                {(Object.keys(CAPABILITIES) as Capability[]).map((c) => <th key={c} scope="col" className="px-3 py-3 text-center font-medium">{CAPABILITY_LABELS[c]}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {STAFF_ROLES.map((r) => (
                <tr key={r}>
                  <th scope="row" className="px-4 py-3 text-left font-medium">{ROLE_LABELS[r]}<span className="block text-xs font-normal text-muted">{ROLE_DESCRIPTIONS[r]}</span></th>
                  {(Object.keys(CAPABILITIES) as Capability[]).map((c) => {
                    const yes = (CAPABILITIES[c] as readonly string[]).includes(r);
                    return <td key={c} className="px-3 py-3 text-center">{yes ? <span className="text-success">✓<span className="sr-only">yes</span></span> : <span className="text-subtle">–<span className="sr-only">no</span></span>}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </AreaPage>
  );
}
