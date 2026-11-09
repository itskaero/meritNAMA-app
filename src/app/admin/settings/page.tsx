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
import { Badge } from "@/components/ui/badge";
import { RETENTION, backupStatus, featureFlags, mailStatus, retentionPreview, retentionSettings, type RetentionKey } from "@/lib/data/settings";
import { formatUtc } from "@/lib/format";
import { AddMemberForm, ApplyRetentionForm, FeaturesForm, RetentionForm, RoleRow, TestEmailForm } from "./forms";

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
  const db = getDb();
  const team = await listTeam(db, session);
  const flags = await featureFlags(db, session);
  const retention = await retentionSettings(db, session);
  const mail = await mailStatus(session);
  const due = await retentionPreview(db, session);
  const dueTotal = Object.values(due).reduce((a, b) => a + b, 0);
  const backups = await backupStatus(session);
  const newest = backups.backups.find((b) => b.database);
  const mb = (n: number) => `${(n / 1_048_576).toFixed(n < 10_485_760 ? 1 : 0)} MB`;

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
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Candidate features" description="Switch a feature off to hide it from candidates and refuse their changes to it (their data is kept). Staff keep access, to try it before switching it back on." />
          <FeaturesForm flags={flags} />
        </Card>
        <Card>
          <CardHeader
            title="Backups"
            description={backups.readable ? `scripts/backup.sh writes to ${backups.dir}. Schedule it daily and copy each backup off the NAS.` : `The app cannot read ${backups.dir}. Mount the backups folder read-only into the app (see docs/DEPLOYMENT.md).`}
            action={<Badge className="whitespace-nowrap" tone={backups.state === "ok" ? "success" : backups.state === "stale" ? "warning" : "danger"}>{backups.state === "ok" ? "up to date" : backups.state === "stale" ? "more than a day old" : backups.state === "missing" ? "no backup yet" : "not visible"}</Badge>}
          />
          {newest ? (
            <p className="mb-3 text-sm">Latest: <span className="font-mono">{formatUtc(newest.at)} UTC</span> · {mb(newest.bytes)}</p>
          ) : null}
          {backups.backups.length ? (
            <ul className="divide-y divide-line text-sm">
              {backups.backups.map((b) => (
                <li key={b.name} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="font-mono text-xs">{b.name}</span>
                  <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    {mb(b.bytes)}
                    {b.database ? <Badge tone="success">database</Badge> : <Badge tone="danger">no database dump</Badge>}
                    {b.storage ? <Badge>files</Badge> : null}
                    {b.checksums ? <Badge>checksums</Badge> : <Badge tone="warning">no checksums</Badge>}
                  </span>
                </li>
              ))}
            </ul>
          ) : backups.readable ? <p className="text-sm text-muted">No backups found. Run scripts/backup.sh on the NAS.</p> : null}
          <p className="mt-3 text-xs text-subtle">The app cannot see off-site copies; check those where they are kept.</p>
        </Card>
      </div>
      <Card>
        <CardHeader title="Email" description="Sign-in links are emailed. Settings live in .env on the server (SMTP_URL, MAIL_FROM); see docs/NAS-SETUP.md, step 3." />
        {mail.configured ? (
          <dl className="mb-4 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="text-muted">Server</dt><dd className="font-mono">{mail.host}:{mail.port}</dd>
            <dt className="text-muted">Account</dt><dd className="font-mono">{mail.user || "—"}</dd>
            <dt className="text-muted">From</dt><dd>{mail.from}</dd>
          </dl>
        ) : (
          <p className="mb-4 text-sm text-amber">SMTP_URL is not set: sign-in emails cannot be sent{process.env.NODE_ENV === "production" ? "" : " (in development they go to /dev/mailbox)"}.</p>
        )}
        <TestEmailForm />
      </Card>
      <Card>
        <CardHeader
          title="Data retention"
          description={`Short-lived data is removed once a day by the background worker (or after a staff page loads). The audit history, merit data and accounts are never removed here. ${retention.lastRun ? `Last run ${formatUtc(retention.lastRun)} UTC.` : "Not run yet."}`}
        />
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <RetentionForm days={retention.days} />
          <div className="grid content-start gap-3">
            <p className="text-sm font-medium">Past its period now</p>
            <ul className="grid gap-1.5 text-sm">
              {(Object.keys(RETENTION) as RetentionKey[]).map((k) => (
                <li key={k} className="flex justify-between gap-3"><span className="text-muted">{RETENTION[k].label}</span><span className="font-mono tabular-nums">{due[k].toLocaleString("en-US")}</span></li>
              ))}
            </ul>
            <ApplyRetentionForm pending={dueTotal} />
          </div>
        </div>
      </Card>
      <Card>
        <CardHeader title="What each role can do" />
        <div tabIndex={0} role="region" aria-label="What each role can do" className="relative overflow-x-auto rounded-2xl border border-line">
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
