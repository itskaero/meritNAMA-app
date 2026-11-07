import Link from "next/link";
import { AreaPage } from "@/components/area-page";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/page-header";
import { requireSection } from "@/lib/auth/session";
import { AUDIT_PAGE, listAudit } from "@/lib/data/audit";
import { checkDatabase, getDb } from "@/lib/db/client";
import { formatUtc } from "@/lib/format";
import { findSection } from "@/lib/navigation";

export const metadata = { title: "Audit history" };
export const dynamic = "force-dynamic";

type Params = { q?: string; type?: string; result?: string; page?: string };

/** "scoring_policy.activate" → "Scoring policy · activate" */
const actionLabel = (a: string) => {
  const [what, ...verb] = a.split(".");
  return `${(what ?? a).replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())}${verb.length ? ` · ${verb.join(".").replace(/_/g, " ")}` : ""}`;
};

/** Before/after values, compact; large values fold away. */
function Value({ label, v }: { label: string; v: unknown }) {
  if (v == null) return null;
  const compact = JSON.stringify(v);
  const short = compact.length <= 160;
  const text = short ? compact : JSON.stringify(v, null, 2);
  return (
    <div className="min-w-0">
      <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-subtle">{label}</p>
      {short ? (
        <code className="block break-all font-mono text-xs text-muted">{text}</code>
      ) : (
        <details>
          <summary className="cursor-pointer text-xs text-signal">Show ({text.length.toLocaleString("en-US")} characters)</summary>
          <pre className="mt-1 max-h-72 overflow-auto rounded-lg bg-canvas p-2 font-mono text-[0.7rem] text-muted">{text}</pre>
        </details>
      )}
    </div>
  );
}

export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<Params> }) {
  const session = await requireSection("/admin/audit");
  const s = findSection("/admin/audit");
  const sp = await searchParams;
  const dbStatus = await checkDatabase();
  const page = (children: React.ReactNode) => (
    <AreaPage
      area="admin"
      trail={[{ label: s.label }]}
      title={s.label}
      description="Every change made in the app, with who made it, when, why and what it changed. Newest first."
      status={dbStatus === "ok" ? <StatusPill tone="live">Live data</StatusPill> : <StatusPill tone="warning">Database unavailable</StatusPill>}
    >
      {children}
    </AreaPage>
  );
  if (dbStatus !== "ok") return page(<EmptyState title="Database not available">Configure DATABASE_URL to read the audit history.</EmptyState>);

  const result = sp.result === "success" || sp.result === "failure" ? sp.result : undefined;
  const pageNo = Math.max(0, Number(sp.page) || 0);
  const { rows, total, types } = await listAudit(getDb(), session, { q: sp.q, type: sp.type, result, page: pageNo });
  const link = (o: Partial<Params>) => {
    const p = new URLSearchParams();
    const merged = { q: sp.q, type: sp.type, result: sp.result, ...o };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/admin/audit${p.size ? `?${p}` : ""}`;
  };
  const pages = Math.max(1, Math.ceil(total / AUDIT_PAGE));

  return page(
    <Card>
      <CardHeader title={`${total.toLocaleString("en-US")} entries`} description="Search by person, action, item or reason. Values that were replaced are shown as before and after." />
      <form action="/admin/audit" className="mb-3 flex flex-wrap items-center gap-2">
        {sp.type ? <input type="hidden" name="type" value={sp.type} /> : null}
        <input name="q" defaultValue={sp.q} placeholder="e.g. policy, induction 21, someone@…" className="w-72 rounded-full border border-line-strong bg-surface px-3.5 py-1.5 text-sm" />
        <button className="rounded-full bg-elevated px-3.5 py-1.5 text-sm">Search</button>
        {sp.q || sp.type || sp.result ? <Link href="/admin/audit" className="text-sm text-muted hover:text-ink">Clear</Link> : null}
      </form>
      <nav aria-label="Filter by item" className="mb-4 flex flex-wrap gap-1.5">
        {["", ...types].map((t) => (
          <Link key={t || "all"} href={link({ type: t || undefined, page: undefined })} className={cn("rounded-full px-3 py-1 text-xs ring-1 ring-line-strong", (sp.type ?? "") === t ? "bg-ink text-canvas" : "text-muted hover:text-ink")}>
            {t ? t.replace(/_/g, " ") : "Everything"}
          </Link>
        ))}
        <Link href={link({ result: sp.result === "failure" ? undefined : "failure", page: undefined })} className={cn("rounded-full px-3 py-1 text-xs ring-1", sp.result === "failure" ? "bg-danger/20 text-danger ring-danger/50" : "text-muted ring-line-strong hover:text-ink")}>
          Failures only
        </Link>
      </nav>

      {rows.length ? (
        <ol className="grid gap-2">
          {rows.map((r) => (
            <li key={r.id} className="rounded-2xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="text-sm font-semibold">
                  {actionLabel(r.action)} <span className="font-mono text-xs font-normal text-muted">{r.entityId}</span>
                </p>
                <p className="text-xs text-muted">
                  {formatUtc(r.createdAt)} UTC · {r.actorEmail}
                  {r.result === "failure" ? <Badge tone="danger" className="ml-2">failed</Badge> : null}
                </p>
              </div>
              {r.reason ? <p className="mt-1 text-sm text-muted">“{r.reason}”</p> : null}
              {r.before != null || r.after != null ? (
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <Value label="Before" v={r.before} />
                  <Value label="After" v={r.after} />
                </div>
              ) : null}
              {r.entityType === "staged_change" ? (
                <Link href={`/admin/changes/${r.entityId}`} className="mt-2 inline-block text-xs font-semibold text-signal underline-offset-4 hover:underline">Open the change (rollback is there) →</Link>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState title="Nothing matches">Change the search or the filters.</EmptyState>
      )}

      {pages > 1 ? (
        <div className="mt-4 flex items-center gap-3 text-sm">
          {pageNo > 0 ? <Link href={link({ page: String(pageNo - 1) })} className="text-signal">← Newer</Link> : null}
          <span className="text-muted">Page {pageNo + 1} of {pages}</span>
          {pageNo + 1 < pages ? <Link href={link({ page: String(pageNo + 1) })} className="text-signal">Older →</Link> : null}
        </div>
      ) : null}
    </Card>,
  );
}
