import Link from "next/link";
import { AreaPage } from "@/components/area-page";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { ConsentToggle } from "@/components/what-if/consent-toggle";
import { WhatIfRunForm } from "@/components/what-if/run-forms";
import { requireSection } from "@/lib/auth/session";
import { baseKey, getWhatIf, parseBase } from "@/lib/data/what-if";
import { getDb } from "@/lib/db/client";
import { formatMarks } from "@/lib/format";

export const metadata = { title: "Simulated consent" };
export const dynamic = "force-dynamic";

const PAGE = 100;

export default async function ConsentWhatIfPage({ searchParams }: { searchParams: Promise<{ induction?: string; base?: string; program?: string; q?: string; changed?: string; page?: string }> }) {
  const session = await requireSection("/admin/processing");
  const sp = await searchParams;
  const induction = Number(sp.induction);
  const base = parseBase(sp.base);
  if (!Number.isInteger(induction) || !base) {
    return (
      <AreaPage area="admin" trail={[{ label: "Processing & simulation", href: "/admin/processing" }, { label: "Simulated consent" }]} title="Simulated consent">
        <EmptyState title="Choose a list">Open this page from a consent round or a simulation run.</EmptyState>
      </AreaPage>
    );
  }
  const key = baseKey(base);
  const view = await getWhatIf(getDb(), session, { induction, base });
  const programs = [...new Set(view.rows.map((r) => r.program))].sort();
  const q = (sp.q ?? "").trim().toLowerCase();
  const filtered = view.rows.filter(
    (r) =>
      (!sp.program || r.program === sp.program) &&
      (!sp.changed || r.changed) &&
      (!q || r.applicantId.includes(q) || `${r.quota} ${r.speciality} ${r.hospital}`.toLowerCase().includes(q)),
  );
  const pageNo = Math.max(0, Number(sp.page) || 0);
  const shown = filtered.slice(pageNo * PAGE, (pageNo + 1) * PAGE);
  const link = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams({ induction: String(induction), base: key, ...(sp.program ? { program: sp.program } : {}), ...(sp.q ? { q: sp.q } : {}), ...(sp.changed ? { changed: "1" } : {}) });
    for (const [k, v] of Object.entries(o)) {
      if (v == null) p.delete(k);
      else p.set(k, v);
    }
    return `/admin/processing/consent?${p}`;
  };
  const back = link({});
  const listName = base.kind === "published" ? `round ${view.roundNo} (published)` : `simulated round ${view.roundNo}`;

  return (
    <AreaPage
      area="admin"
      trail={[{ label: "Processing & simulation", href: "/admin/processing" }, { label: `Simulated consent · induction ${induction} ${listName}` }]}
      title={`Simulated consent · ${listName}`}
      description="Your own what-if copy of this list's consent. Changes are private to you and never touch the official consent; simulating from here makes a private run."
      status={<Badge tone="simulated" className="mx-2">What-if</Badge>}
    >
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="text-sm">
            <p>
              <span className="tabular-nums">{view.total.toLocaleString("en-US")}</span> allocations · your scenario:{" "}
              <span className="text-signal">{view.counts.Accepted.toLocaleString("en-US")} accepted</span>,{" "}
              <span className="text-danger">{view.counts.Rejected.toLocaleString("en-US")} rejected</span>,{" "}
              <span className="text-amber">{view.counts.Awaited.toLocaleString("en-US")} awaited</span>
            </p>
            <p className="mt-1 text-muted">{view.changes ? `${view.changes} changed from the official consent.` : "No changes from the official consent yet."}</p>
          </div>
          <WhatIfRunForm induction={induction} base={key} back={back} nextRound={view.roundNo + 1} changes={view.changes} />
        </div>
      </Card>

      <Card>
        <CardHeader title="Allocations" description={`${filtered.length.toLocaleString("en-US")} shown by the filters; ${PAGE} per page.`} />
        <form className="mb-4 flex flex-wrap items-center gap-2" action="/admin/processing/consent">
          <input type="hidden" name="induction" value={induction} />
          <input type="hidden" name="base" value={key} />
          {sp.program ? <input type="hidden" name="program" value={sp.program} /> : null}
          <input name="q" defaultValue={sp.q} placeholder="Applicant ID, quota, speciality or hospital" className="w-72 rounded-full border border-line-strong bg-surface px-3.5 py-1.5 text-sm" />
          <button className="rounded-full bg-elevated px-3.5 py-1.5 text-sm">Search</button>
          <span className="mx-2 h-5 w-px bg-line" />
          {["", ...programs].map((p) => (
            <Link key={p || "all"} href={link({ program: p || undefined, page: undefined })} className={cn("rounded-full px-3 py-1 text-sm ring-1 ring-line-strong", (sp.program ?? "") === p ? "bg-ink text-canvas" : "text-muted hover:text-ink")}>
              {p || "All programmes"}
            </Link>
          ))}
          <Link href={link({ changed: sp.changed ? undefined : "1", page: undefined })} className={cn("rounded-full px-3 py-1 text-sm ring-1", sp.changed ? "bg-amber/20 text-amber ring-amber/50" : "text-muted ring-line-strong hover:text-ink")}>
            Changed only
          </Link>
        </form>
        <DataTable
          caption="Allocations with simulated consent"
          rows={shown}
          rowKey={(r) => `${r.applicantId}|${r.seatKey}`}
          empty={<EmptyState title="Nothing matches">Change the filters.</EmptyState>}
          columns={[
            { key: "id", header: "Applicant", tone: "mono", cell: (r) => r.applicantId },
            { key: "seat", header: "Programme · quota · speciality · hospital", cell: (r) => `${r.program} · ${r.quota} · ${r.speciality} · ${r.hospital}` },
            { key: "pref", header: "Pref.", align: "right", cell: (r) => (r.preferenceNo ? `#${r.preferenceNo}` : "—") },
            { key: "mark", header: "Mark", align: "right", tone: "mono", cell: (r) => formatMarks(r.mark) },
            { key: "off", header: "Official", cell: (r) => (base.kind === "published" ? r.official : "—") },
            {
              key: "sim",
              header: "Simulated consent",
              cell: (r) => <ConsentToggle induction={induction} base={key} back={back} applicantId={r.applicantId} seatKey={r.seatKey} official={r.official} simulated={r.simulated} changed={r.changed} />,
            },
          ]}
        />
        {filtered.length > PAGE ? (
          <div className="mt-4 flex items-center gap-3 text-sm">
            {pageNo > 0 ? <Link href={link({ page: String(pageNo - 1) })} className="text-signal">← Previous</Link> : null}
            <span className="text-muted">Page {pageNo + 1} of {Math.ceil(filtered.length / PAGE)}</span>
            {(pageNo + 1) * PAGE < filtered.length ? <Link href={link({ page: String(pageNo + 1) })} className="text-signal">Next →</Link> : null}
          </div>
        ) : null}
      </Card>
    </AreaPage>
  );
}
