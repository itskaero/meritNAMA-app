import Link from "next/link";
import { AreaPage } from "@/components/area-page";
import { whenDatabaseDown } from "@/components/database-unavailable";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { fieldClass } from "@/components/ui/styles";
import { requireSection } from "@/lib/auth/session";
import { RECORD_FILTERS, RECORDS_PAGE, recordInductions, searchRecords, type RecordFilter } from "@/lib/data/candidate-records";
import { getDb } from "@/lib/db/client";
import { formatMarks } from "@/lib/format";
import { CorrectionsImportForm } from "../forms";
import { CandidateTabs } from "../tabs";

export const metadata = { title: "Candidate records" };
export const dynamic = "force-dynamic";

type Params = { i?: string; q?: string; program?: string; filter?: string; page?: string };

const FILTER_LABEL: Record<RecordFilter, string> = {
  all: "Everyone",
  linked: "Linked to an account",
  unlinked: "Not linked",
  corrected: "With corrections",
  placed: "On a published list",
  not_placed: "Never placed",
  rejected_profile: "Profile rejected",
};

export default async function CandidateRecordsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const session = await requireSection("/admin/candidates/records");
  const frame = { area: "admin" as const, trail: [{ label: "Candidates", href: "/admin/candidates" }, { label: "Records" }], title: "Candidate records", description: "Applicants on published merit lists or in an induction's simulation data. Open one to see their marks, preferences, consent and corrections." };
  const down = await whenDatabaseDown(frame);
  if (down) return down;
  const db = getDb();
  const sp = await searchParams;
  const inductions = await recordInductions(db, session);
  if (!inductions.length) {
    return (
      <AreaPage {...frame}>
        <CandidateTabs current="/admin/candidates/records" />
        <EmptyState title="No candidate data yet">Import a merit round or an induction&apos;s simulation data first.</EmptyState>
      </AreaPage>
    );
  }
  const induction = inductions.find((x) => String(x.induction) === sp.i)?.induction ?? inductions[0]!.induction;
  const filter = (RECORD_FILTERS as readonly string[]).includes(sp.filter ?? "") ? (sp.filter as RecordFilter) : "all";
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const { rows, total, programs } = await searchRecords(db, session, { induction, q: sp.q, program: sp.program, filter, page });
  const pages = Math.max(1, Math.ceil(total / RECORDS_PAGE));
  const link = (p: number) => `/admin/candidates/records?${new URLSearchParams({ i: String(induction), ...(sp.q ? { q: sp.q } : {}), ...(sp.program ? { program: sp.program } : {}), filter, page: String(p) })}`;

  return (
    <AreaPage {...frame}>
      <CandidateTabs current="/admin/candidates/records" />
      <Card>
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[9rem_minmax(0,1fr)_12rem_14rem_auto] lg:items-end">
          <label className="grid gap-1.5 text-sm font-medium">Induction
            <select name="i" defaultValue={induction} className={fieldClass}>
              {inductions.map((x) => <option key={x.induction} value={x.induction}>{x.induction}{x.simulation ? "" : " (lists only)"}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">Applicant ID
            <input name="q" defaultValue={sp.q ?? ""} inputMode="numeric" placeholder="Starts with…" className={fieldClass} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">Programme
            <select name="program" defaultValue={sp.program ?? ""} className={fieldClass}>
              <option value="">Any</option>
              {programs.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">Show
            <select name="filter" defaultValue={filter} className={fieldClass}>
              {RECORD_FILTERS.map((f) => <option key={f} value={f}>{FILTER_LABEL[f]}</option>)}
            </select>
          </label>
          <button type="submit" className="h-11 rounded-full bg-signal px-5 text-sm font-semibold text-signal-ink hover:bg-signal-strong">Search</button>
        </form>
      </Card>

      <Card>
        <CardHeader
          title={`${total.toLocaleString("en-US")} applicant${total === 1 ? "" : "s"}`}
          description={`Induction ${induction}${filter !== "all" ? ` · ${FILTER_LABEL[filter]}` : ""}${sp.program ? ` · ${sp.program}` : ""}. Seat and marks are from the latest published round they appear in.`}
          action={<ButtonLink href={`/admin/candidates/records/export?i=${induction}`} variant="secondary" size="sm" prefetch={false}>Export CSV</ButtonLink>}
        />
        <DataTable
          caption="Candidate records"
          rows={rows}
          rowKey={(r) => r.applicantId}
          empty={<EmptyState title="No one matches">Try a shorter applicant ID or another filter.</EmptyState>}
          columns={[
            { key: "id", header: "Applicant", tone: "mono", cell: (r) => <Link href={`/admin/candidates/records/${r.applicantId}?i=${induction}`} className="font-semibold text-signal hover:underline">{r.applicantId}</Link> },
            { key: "seat", header: "Latest seat", cell: (r) => (r.lastSeat ? <><span className="text-muted">R{r.lastRound} · </span>{r.lastSeat}</> : <span className="text-subtle">Not placed</span>) },
            { key: "best", header: "Merit", align: "right", tone: "mono", cell: (r) => (r.bestMarks == null ? "—" : formatMarks(r.bestMarks)) },
            { key: "base", header: "Base marks", align: "right", tone: "mono", cell: (r) => (r.baseMarks == null ? "—" : formatMarks(r.baseMarks)) },
            { key: "status", header: "Profile", cell: (r) => r.profileStatus ?? <span className="text-subtle">No sim data</span> },
            {
              key: "flags", header: "", cell: (r) => (
                <span className="flex flex-wrap gap-1">
                  {r.linked ? <Badge tone="success">linked</Badge> : null}
                  {r.corrections ? <Badge tone="warning">{r.corrections} correction{r.corrections > 1 ? "s" : ""}</Badge> : null}
                </span>
              ),
            },
          ]}
        />
        {pages > 1 ? (
          <nav aria-label="Pages" className="mt-4 flex items-center justify-between gap-3 text-sm">
            {page > 1 ? <Link href={link(page - 1)} className="font-semibold text-signal hover:underline">← Previous</Link> : <span />}
            <span className="text-muted">Page {page} of {pages}</span>
            {page < pages ? <Link href={link(page + 1)} className="font-semibold text-signal hover:underline">Next →</Link> : <span />}
          </nav>
        ) : null}
      </Card>

      <Card>
        <CardHeader title="Import corrections" description="Correct many applicants at once, for example after a grievance committee. The file is checked line by line and staged as one change to review and publish; nothing changes until then." />
        <CorrectionsImportForm inductions={inductions.filter((x) => x.simulation).map((x) => x.induction)} />
      </Card>
    </AreaPage>
  );
}
