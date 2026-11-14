import { AreaPage } from "@/components/area-page";
import { StatTiles } from "@/components/charts/stat-tiles";
import { whenDatabaseDown } from "@/components/database-unavailable";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/page-header";
import { Pill, Segmented } from "@/components/ui/segmented";
import { can } from "@/lib/auth/roles";
import { requireSection } from "@/lib/auth/session";
import { accessCounts, accessSettings, currentCycle, listAccessRequests, listPayments, listVouchers } from "@/lib/data/access";
import { getDb } from "@/lib/db/client";
import { AUTO_LABELS, type AutoResult } from "@/lib/domain/payments";
import { formatUtc } from "@/lib/format";
import { findSection } from "@/lib/navigation";
import { CHANNEL_LABELS, type Channel } from "@/lib/payments/parse";
import { CandidateTabs } from "../candidates/tabs";
import { revokeVoucherAction } from "./actions";
import { AccessSettingsForm, BulkBar, GrantForm, ImportPaymentsForm, ReviewForm, RevokeForm, VoucherForm } from "./forms";

export const metadata = { title: "Access" };
export const dynamic = "force-dynamic";

const TABS = ["requests", "payments", "vouchers", "settings"] as const;
type Tab = (typeof TABS)[number];
const day = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Karachi" });
const pkr = (n: number) => `PKR ${n.toLocaleString("en-US")}`;
const channelLabel = (c: string | null) => (c === "voucher" ? "Voucher" : c ? CHANNEL_LABELS[c as Channel] ?? c : null);

function AutoPill({ r }: { r: string | null }) {
  if (!r) return null;
  const a = AUTO_LABELS[r as AutoResult];
  return a ? <Pill tone={a.tone === "neutral" ? "neutral" : a.tone} className="w-fit">{a.label}</Pill> : null;
}

export default async function AdminAccessPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const session = await requireSection("/admin/access");
  const s = findSection("/admin/access");
  const frame = { area: "admin" as const, trail: [{ label: "Candidates & access", href: "/admin/candidates" }, { label: s.label }], title: s.label, description: s.description };
  const down = await whenDatabaseDown(frame);
  if (down) return down;
  const asked = (await searchParams).tab;
  const tab: Tab = (TABS as readonly string[]).includes(asked ?? "") ? (asked as Tab) : "requests";
  const db = getDb();
  const [settings, counts, cycle] = await Promise.all([accessSettings(db, session), accessCounts(db, session), currentCycle(db)]);

  const tabs = [
    { href: "/admin/access", label: "Requests", active: tab === "requests", count: counts.waiting || undefined },
    { href: "/admin/access?tab=payments", label: "Payments", active: tab === "payments", count: counts.unmatchedPayments || undefined },
    { href: "/admin/access?tab=vouchers", label: "Vouchers", active: tab === "vouchers" },
    { href: "/admin/access?tab=settings", label: "Settings", active: tab === "settings" },
  ];

  return (
    <AreaPage {...frame} status={<StatusPill tone={settings.paywall ? "warning" : "live"}>{settings.paywall ? "Paywall on" : "Paywall off: link sign-in"}</StatusPill>}>
      <CandidateTabs current="/admin/access" />
      <Segmented label="Access" items={tabs} />
      {settings.perInduction && cycle.induction ? (
        <p className="text-sm text-muted">Access bought now is for induction {cycle.induction}{cycle.end ? ` and ends ${day(cycle.end)} (or 30 days from approval, if later)` : "; no end date is known yet, so it does not end"}.</p>
      ) : null}
      {tab === "requests" ? <Requests session={session} counts={counts} /> : null}
      {tab === "payments" ? <Payments session={session} /> : null}
      {tab === "vouchers" ? <Vouchers session={session} /> : null}
      {tab === "settings" ? (
        can(session, "roles.manage") ? (
          <Card id="settings">
            <CardHeader title="Paywall settings" description="Turning the paywall on asks new people for approval. The owner and team members are never locked out." />
            <AccessSettingsForm s={settings} />
          </Card>
        ) : <Card><p className="text-sm text-muted">Only the owner can change the paywall settings.</p></Card>
      ) : null}
    </AreaPage>
  );
}

type S = Awaited<ReturnType<typeof requireSection>>;

async function Requests({ session, counts }: { session: S; counts: { waiting: number; nearMiss: number } }) {
  const requests = await listAccessRequests(getDb(), session);
  const pending = requests.filter((r) => r.status === "pending");
  const approved = requests.filter((r) => r.status === "approved");
  const rejected = requests.filter((r) => r.status === "rejected");
  const now = new Date();
  return (
    <>
      <StatTiles stats={[{ label: "Waiting", value: pending.length }, { label: "Near misses", value: counts.nearMiss, hint: "Found, but something is off" }, { label: "Approved", value: approved.length }, { label: "Rejected", value: rejected.length }]} />
      <Card id="waiting">
        <CardHeader title={`Waiting · ${pending.length}`} description="Requests whose transaction ID is in an imported statement are approved by themselves. What is left here has the automatic check's reason. Import the latest statement under Payments first." />
        {pending.length === 0 ? <p className="text-sm text-muted">Nothing waiting.</p> : (
          <div className="grid gap-3">
            <BulkBar count={pending.length} />
            <ul className="grid gap-3">
              {pending.map((r) => (
                <li key={r.id} className="grid gap-3 rounded-xl border border-line p-4 md:grid-cols-[auto_minmax(0,1fr)_minmax(0,22rem)]">
                  <input type="checkbox" name="ids" value={r.id} form="bulk" aria-label={`Tick ${r.email}`} className="mt-1 h-4 w-4 accent-[var(--mn-violet-soft)]" />
                  <div className="min-w-0 text-sm">
                    <p className="flex flex-wrap items-center gap-2"><span className="break-all font-semibold text-heading">{r.email}</span><AutoPill r={r.autoResult} /></p>
                    <p className="text-muted">
                      {channelLabel(r.channel) ?? "Payment"}
                      {r.reference ? <> · TID <span className="font-mono text-ink">{r.reference}</span></> : null}
                      {r.amountPkr != null ? <> · {pkr(r.amountPkr)}</> : null}
                      {r.applicantId ? <> · applicant <span className="font-mono text-ink">{r.applicantId}</span></> : null}
                    </p>
                    {r.autoResult ? <p className="mt-1 text-xs text-muted">{AUTO_LABELS[r.autoResult as AutoResult]?.note}</p> : null}
                    {r.message ? <p className="mt-1 text-muted">&ldquo;{r.message}&rdquo;</p> : null}
                    <p className="mt-1 text-xs text-subtle">asked {formatUtc(r.createdAt)} UTC</p>
                  </div>
                  <ReviewForm id={r.id} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
      <Card>
        <CardHeader title="Give access to an email" description="For someone who paid another way, or a friend of the project. They are emailed. A voucher code does the same without you typing their email." />
        <GrantForm />
      </Card>
      <Card>
        <CardHeader title={`Approved · ${approved.length}`} />
        {approved.length === 0 ? <p className="text-sm text-muted">No one yet.</p> : (
          <ul className="divide-y divide-line text-sm">
            {approved.map((r) => {
              const ended = r.expiresAt != null && r.expiresAt <= now;
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2"><span className="break-all font-medium text-heading">{r.email}</span>{ended ? <Badge tone="neutral">ended</Badge> : null}</span>
                    <span className="block text-xs text-subtle">
                      {[channelLabel(r.channel), r.amountPkr != null ? pkr(r.amountPkr) : null, r.note, r.reviewedBy === "system" ? "approved automatically" : r.reviewedBy ? `by ${r.reviewedBy}` : null, r.expiresAt ? `${ended ? "ended" : "until"} ${day(r.expiresAt)}` : "no end"].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  {ended ? null : <RevokeForm id={r.id} />}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {rejected.length ? (
        <Card>
          <CardHeader title="Rejected" description="They were emailed why, and can ask again." />
          <ul className="divide-y divide-line text-sm">
            {rejected.slice(0, 30).map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 py-2"><span className="break-all">{r.email}</span><Badge tone="danger">rejected</Badge><span className="text-xs text-subtle">{r.note}</span></li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}

async function Payments({ session }: { session: S }) {
  const list = await listPayments(getDb(), session);
  const unmatched = list.filter((p) => !p.matchedEmail);
  return (
    <>
      <Card>
        <CardHeader title="Import payments" description="Paste the SMS or app notifications for money received, or upload the statement CSV. Every waiting request is then checked against them." />
        <ImportPaymentsForm />
      </Card>
      <Card>
        <CardHeader title={`Payments · ${list.length}`} description={`${unmatched.length} not used by any request yet. An unused payment usually means the person has not sent their request, or typed the transaction ID differently.`} />
        {list.length === 0 ? <p className="text-sm text-muted">No payments imported yet.</p> : (
          <div className="-mx-5 overflow-x-auto sm:-mx-6">
            <table className="w-full min-w-[36rem] text-sm">
              <thead className="text-left text-xs text-subtle">
                <tr><th className="px-5 py-2 font-medium sm:px-6">TID</th><th className="px-2 py-2 font-medium">From</th><th className="px-2 py-2 text-right font-medium">Amount</th><th className="px-2 py-2 font-medium">Paid</th><th className="px-2 py-2 pr-5 font-medium sm:pr-6">Used by</th></tr>
              </thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id} className="border-t border-line">
                    <td className="px-5 py-2 font-mono sm:px-6">{p.tid}</td>
                    <td className="px-2 py-2 text-muted">{channelLabel(p.channel)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{pkr(p.amountPkr)}</td>
                    <td className="px-2 py-2 text-muted">{p.paidAt ? day(p.paidAt) : "—"}</td>
                    <td className="px-2 py-2 pr-5 sm:pr-6">{p.matchedEmail ? <span className="break-all">{p.matchedEmail}</span> : <Pill tone="amber">not used yet</Pill>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

async function Vouchers({ session }: { session: S }) {
  const list = await listVouchers(getDb(), session);
  return (
    <>
      <Card>
        <CardHeader title="Make access codes" description="Single-use codes for cash payments, promotions or refunds. Someone enters one on the request form and is in at once, until the end of this induction. Codes are shown once; only a fingerprint is kept." />
        <VoucherForm />
      </Card>
      <Card>
        <CardHeader title={`Codes · ${list.length}`} />
        {list.length === 0 ? <p className="text-sm text-muted">No codes made yet.</p> : (
          <ul className="divide-y divide-line text-sm">
            {list.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <span className="font-mono text-ink">…{v.hint}</span>
                {v.usedAt ? <Badge tone="success">used</Badge> : v.revokedAt ? <Badge tone="neutral">cancelled</Badge> : <Badge tone="warning">unused</Badge>}
                <span className="min-w-0 flex-1 text-xs text-subtle">{[v.note, v.induction ? `induction ${v.induction}` : null, `made by ${v.createdBy} ${day(v.createdAt)}`, v.usedBy ? `used by ${v.usedBy}` : null].filter(Boolean).join(" · ")}</span>
                {!v.usedAt && !v.revokedAt ? (
                  <form action={revokeVoucherAction}><input type="hidden" name="id" value={v.id} /><button type="submit" className="mn-btn-ghost h-8 rounded-lg px-2.5 text-xs">Cancel</button></form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
