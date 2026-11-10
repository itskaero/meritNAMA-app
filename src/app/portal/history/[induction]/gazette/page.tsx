import { notFound } from "next/navigation";
import { AreaPage } from "@/components/area-page";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { selectClass } from "@/components/ui/styles";
import { getSession } from "@/lib/auth/session";
import { verifiedApplicant } from "@/lib/data/candidates";
import { gazetteList } from "@/lib/data/gazette";
import { ensureUser } from "@/lib/data/users";
import { getDb } from "@/lib/db/client";
import { gazetteStatus } from "@/lib/domain/gazette";
import { formatMarks } from "@/lib/format";
import { intParam } from "@/lib/params";

export const metadata = { title: "Candidates list (gazette)" };
export const dynamic = "force-dynamic";

const PAGE = 300;

/**
 * The gazette as PHF prints it: every candidate, best marks first, with a rank. Applicant ids
 * and marks only; names are never stored.
 */
export default async function GazettePage({ params, searchParams }: {
  params: Promise<{ induction: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const induction = intParam((await params).induction);
  if (induction === null) notFound();
  const db = getDb();
  const session = await getSession();
  const g = await gazetteList(db, session, induction);
  const trail = [{ label: "Merit lists", href: "/portal/history" }, { label: `Induction ${induction}`, href: `/portal/history/${induction}` }, { label: "Candidates list" }];
  if (!g) {
    return (
      <AreaPage area="portal" trail={trail} title={`Induction ${induction} · candidates list`} description="PHF's list of eligible candidates and their marks.">
        <EmptyState title="No candidates list for this induction yet">It appears here once the gazette has been added to the data.</EmptyState>
      </AreaPage>
    );
  }
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const me = session ? await verifiedApplicant(db, (await ensureUser(db, session)).id) : null;
  const q = one("q").replace(/\D/g, "");
  const status = ["eligible", "rejected"].includes(one("status")) ? one("status") : "";
  const filtered = g.rows.filter((r) => (!q || r.applicantId.includes(q)) && (!status || gazetteStatus(r.profileStatus) === status));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const page = Math.min(Math.max(intParam(one("page")) ?? 1, 1), pages);
  const shown = filtered.slice((page - 1) * PAGE, page * PAGE);
  const mine = me ? g.rows.find((r) => r.applicantId === me) : undefined;
  const base = `/portal/history/${induction}/gazette`;
  const link = (p: number) => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    if (status) u.set("status", status);
    if (p > 1) u.set("page", String(p));
    const s = u.toString();
    return s ? `${base}?${s}` : base;
  };
  const rejected = g.rows.filter((r) => gazetteStatus(r.profileStatus) === "rejected").length;

  return (
    <AreaPage
      area="portal"
      trail={trail}
      title={`Induction ${induction} · candidates list`}
      description={`${g.rows.length.toLocaleString("en-US")} candidates${g.total ? `, marks out of ${g.total}` : ""}${g.policy ? ` · ${g.policy} scoring` : ""}. As PHF published the gazette: applicant id and marks only.`}
      status={<Badge tone="official" className="mx-2">Gazette</Badge>}
    >
      {mine ? (
        <Card>
          <CardHeader title="You in the gazette" description={`Applicant ${mine.applicantId}, from your linked record.`} />
          <p className="text-sm">
            Rank <span className="font-mono font-semibold">{mine.rank.toLocaleString("en-US")}</span> of {g.rows.length.toLocaleString("en-US")} · marks <span className="font-mono font-semibold">{formatMarks(mine.marks)}</span>
          </p>
        </Card>
      ) : null}
      <Card>
        <form method="get" className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem_auto] sm:items-end">
          <label className="grid gap-1.5 text-sm font-medium">Applicant id
            <input name="q" inputMode="numeric" defaultValue={q} placeholder="e.g. 27267" className={`${selectClass} font-mono`} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">Status
            <select name="status" defaultValue={status} className={selectClass}>
              <option value="">All</option>
              <option value="eligible">Eligible</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>
          <div className="flex gap-2">
            <Button type="submit" variant="secondary">Filter</Button>
            {q || status ? <ButtonLink href={base} variant="ghost">Clear</ButtonLink> : null}
          </div>
        </form>
        <p className="mt-3 text-sm text-muted" aria-live="polite">
          {filtered.length.toLocaleString("en-US")} candidate{filtered.length === 1 ? "" : "s"}{q || status ? " match" : ""}{rejected ? ` · ${rejected.toLocaleString("en-US")} rejected in the gazette` : ""}
        </p>
      </Card>
      <Card>
        <CardHeader title="The list" description={pages > 1 ? `Page ${page} of ${pages}, ${PAGE} per page.` : "Best marks first. Equal marks share a rank."} />
        <DataTable
          caption={`Induction ${induction} gazette`}
          rows={shown}
          rowKey={(r) => r.applicantId}
          columns={[
            { key: "rank", header: "Rank", align: "right", tone: "mono", sort: (r) => r.rank, cell: (r) => r.rank.toLocaleString("en-US") },
            { key: "id", header: "Applicant", tone: "mono", sort: (r) => Number(r.applicantId), cell: (r) => <>{r.applicantId}{r.applicantId === me ? <Badge tone="current" className="ml-2">you</Badge> : null}</> },
            { key: "m", header: "Marks", align: "right", tone: "mono", sort: (r) => r.marks, cell: (r) => formatMarks(r.marks) },
            { key: "pct", header: "Of total", align: "right", tone: "muted", sort: (r) => r.marks, cell: (r) => (g.total ? `${((r.marks / g.total) * 100).toFixed(1)}%` : "—") },
            { key: "st", header: "Status", tone: "muted", sort: (r) => gazetteStatus(r.profileStatus), cell: (r) => ({ eligible: "Eligible", rejected: "Rejected", unknown: "—" })[gazetteStatus(r.profileStatus)] },
          ]}
        />
        {pages > 1 ? (
          <nav aria-label="Pages" className="mt-4 flex items-center justify-between text-sm">
            {page > 1 ? <ButtonLink href={link(page - 1)} variant="secondary" size="sm">← Previous</ButtonLink> : <span />}
            <span className="text-muted">Page {page} of {pages}</span>
            {page < pages ? <ButtonLink href={link(page + 1)} variant="secondary" size="sm">Next →</ButtonLink> : <span />}
          </nav>
        ) : null}
      </Card>
    </AreaPage>
  );
}
