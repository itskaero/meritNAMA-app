import { AreaPage } from "@/components/area-page";
import { whenDatabaseDown } from "@/components/database-unavailable";
import { StatTiles } from "@/components/charts/stat-tiles";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/page-header";
import { can } from "@/lib/auth/roles";
import { requireSection } from "@/lib/auth/session";
import { accessSettings, listAccessRequests } from "@/lib/data/access";
import { getDb } from "@/lib/db/client";
import { formatUtc } from "@/lib/format";
import { findSection } from "@/lib/navigation";
import { AccessSettingsForm, GrantForm, ReviewForm, RevokeForm } from "./forms";

export const metadata = { title: "Access" };
export const dynamic = "force-dynamic";

export default async function AdminAccessPage() {
  const session = await requireSection("/admin/access");
  const s = findSection("/admin/access");
  const frame = { area: "admin" as const, trail: [{ label: s.label }], title: s.label, description: s.description };
  const down = await whenDatabaseDown(frame);
  if (down) return down;
  const db = getDb();
  const [settings, requests] = await Promise.all([accessSettings(db, session), listAccessRequests(db, session)]);
  const pending = requests.filter((r) => r.status === "pending");
  const approved = requests.filter((r) => r.status === "approved");
  const rejected = requests.filter((r) => r.status === "rejected");

  return (
    <AreaPage {...frame} status={<StatusPill tone={settings.paywall ? "warning" : "live"}>{settings.paywall ? "Paywall on" : "Paywall off: link sign-in"}</StatusPill>}>
      <StatTiles stats={[{ label: "Waiting", value: pending.length }, { label: "Approved", value: approved.length }, { label: "Rejected", value: rejected.length }]} />
      <Card id="waiting">
        <CardHeader title={`Waiting for payment check · ${pending.length}`} description="Check the amount and reference in the bank account, then approve. The person is emailed and signs in with an email link." />
        {pending.length === 0 ? <p className="text-sm text-muted">Nothing waiting.</p> : (
          <ul className="grid gap-4">
            {pending.map((r) => (
              <li key={r.id} className="grid gap-3 rounded-xl border border-line p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
                <div className="min-w-0 text-sm">
                  <p className="break-all font-semibold text-heading">{r.email}</p>
                  <p className="text-muted">
                    {r.amountPkr != null ? <>PKR <span className="font-mono text-ink">{r.amountPkr.toLocaleString("en-US")}</span></> : "No amount"}
                    {r.reference ? <> · ref <span className="font-mono text-ink">{r.reference}</span></> : null}
                    {r.applicantId ? <> · applicant <span className="font-mono text-ink">{r.applicantId}</span></> : null}
                  </p>
                  {r.message ? <p className="mt-1 text-muted">&ldquo;{r.message}&rdquo;</p> : null}
                  <p className="mt-1 text-xs text-subtle">asked {formatUtc(r.createdAt)} UTC</p>
                </div>
                <ReviewForm id={r.id} />
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <CardHeader title="Give access to an email" description="For someone who paid another way, or a friend of the project. They are emailed." />
        <GrantForm />
      </Card>
      <Card>
        <CardHeader title={`Approved · ${approved.length}`} />
        {approved.length === 0 ? <p className="text-sm text-muted">No one yet.</p> : (
          <ul className="divide-y divide-line text-sm">
            {approved.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="break-all font-medium text-heading">{r.email}</span>
                  <span className="block text-xs text-subtle">{r.amountPkr != null ? `PKR ${r.amountPkr.toLocaleString("en-US")} · ` : ""}{r.note ?? ""} · by {r.reviewedBy}</span>
                </span>
                <RevokeForm id={r.id} />
              </li>
            ))}
          </ul>
        )}
      </Card>
      {rejected.length ? (
        <Card>
          <CardHeader title="Rejected" description="They can ask again from the sign-in page." />
          <ul className="divide-y divide-line text-sm">
            {rejected.slice(0, 30).map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 py-2"><span className="break-all">{r.email}</span><Badge tone="danger">rejected</Badge><span className="text-xs text-subtle">{r.note}</span></li>
            ))}
          </ul>
        </Card>
      ) : null}
      {can(session, "roles.manage") ? (
        <Card id="settings">
          <CardHeader title="Paywall settings" description="Turning the paywall on asks new people for approval. The owner and team members are never locked out." />
          <AccessSettingsForm s={settings} />
        </Card>
      ) : (
        <Card><p className="text-sm text-muted">Only the owner can change the paywall settings.</p></Card>
      )}
    </AreaPage>
  );
}
