import Link from "next/link";
import { notFound } from "next/navigation";
import { AreaPage } from "@/components/area-page";
import { StatTiles } from "@/components/charts/stat-tiles";
import { ListFilters, ListNav, Pager, qs, StatusBadge } from "@/components/merit-lists";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { getSession } from "@/lib/auth/session";
import { verifiedApplicant } from "@/lib/data/candidates";
import { gazetteInfo, gazetteList, inductionLists, type GazetteRow } from "@/lib/data/lists";
import { ensureUser } from "@/lib/data/users";
import { getDb } from "@/lib/db/client";
import { formatMarks, formatUtc } from "@/lib/format";
import { intParam } from "@/lib/params";

export const metadata = { title: "Gazette" };
export const dynamic = "force-dynamic";

/** The score parts PHF prints, in its order, with plain labels. */
const PARTS: [string, string][] = [
  ["matric", "Matric"], ["fsc", "FSc"], ["degree", "Degree"], ["houseJob", "House job"], ["experience", "Experience"],
  ["hardArea", "Hard area"], ["research", "Research"], ["position", "Position"], ["attempts", "Attempts"],
];
const parts = (r: GazetteRow) => PARTS.filter(([k]) => r.parts[k] != null).map(([k, label]) => `${label} ${formatMarks(r.parts[k]!)}`).join(" · ");

/**
 * PHF's gazette for an induction: every applicant with name, merit marks, the parts
 * of the score and eligibility, best marks first. The first list of a cycle; round 1
 * is estimated from it until PHF publishes the real one.
 */
export default async function GazettePage({ params, searchParams }: {
  params: Promise<{ induction: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const induction = intParam((await params).induction);
  if (induction === null) notFound();
  const db = getDb();
  const session = await getSession();
  const info = await gazetteInfo(db, session, induction);
  if (!info) notFound();
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const statuses = info.statuses.map((s) => s.status);
  const status = statuses.includes(str("status")) ? str("status") : "";
  const q = str("q").trim().slice(0, 60);
  const page = intParam(sp.page, 4) ?? 1;
  const [list, lists] = await Promise.all([gazetteList(db, session, { induction, status, q, page }), inductionLists(db, session, induction)]);
  const me = session ? await verifiedApplicant(db, (await ensureUser(db, session)).id) : null;
  const base = `/portal/history/${induction}/gazette`;
  const href = (n?: number) => `${base}${qs({ status, q, page: n && n > 1 ? n : undefined })}`;
  const round1 = lists.steps.find((s) => s.kind !== "gazette");

  return (
    <AreaPage
      area="portal"
      trail={[{ label: "Merit lists", href: "/portal/history" }, { label: `Induction ${induction}`, href: `/portal/history/${induction}` }, { label: "Gazette" }]}
      title={`Induction ${induction} · gazette`}
      description={`Everyone who applied, with merit marks and eligibility, as PHF published it before round 1. Imported ${formatUtc(info.importedAt)} UTC.`}
      status={<Badge tone="official" className="mx-2">Official PHF gazette</Badge>}
    >
      <Card>
        <ListNav steps={lists.steps} current={base} title={`Induction ${induction}: gazette and rounds`} />
        {round1 ? (
          <p className="mt-3 text-sm text-muted">
            Next: <Link href={round1.href} className="font-semibold text-signal hover:underline">{round1.label} ({round1.note.toLowerCase()})</Link>
            {round1.kind === "estimate" ? ", simulated from this gazette and the preferences entered on the portal." : "."}
          </p>
        ) : <p className="mt-3 text-sm text-muted">Round 1 appears here as an estimate once it is simulated from this gazette, and as the official list once PHF publishes it.</p>}
      </Card>

      <StatTiles
        stats={[
          { label: "Applicants", value: info.entries },
          ...info.statuses.slice(0, 2).map((s) => ({ label: s.status, value: s.n })),
          ...(info.highest != null ? [{ label: "Highest marks", value: info.highest, format: formatMarks, hint: info.median != null ? `Median ${formatMarks(info.median)}` : undefined }] : []),
        ]}
      />

      <Card>
        <ListFilters
          fields={[{ name: "status", label: "Status", options: statuses, value: status }]}
          search={{ value: q, placeholder: "Name or applicant ID" }}
          clearHref={base}
          filtered={Boolean(status || q)}
        />
      </Card>

      {list.total === 0 ? <EmptyState title="Nobody in the gazette matches" action={<ButtonLink href={base} variant="secondary">Clear filters</ButtonLink>} /> : (
        <Card>
          <CardHeader title="Applicants by merit" description="Best marks first; # is the place within your filters. Select a name to see that candidate in every list." />
          <div className="grid gap-3">
            <Pager page={list.page} pages={list.pages} total={list.total} noun="applicants" hrefFor={href} />
            <ol className="grid gap-2 sm:hidden" aria-label="Gazette applicants">
              {list.rows.map((r) => (
                <li key={r.applicantId} className={`rounded-xl border bg-surface p-3 ${r.applicantId === me ? "border-signal" : "border-line"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="mr-2 font-mono text-xs text-subtle">#{r.rank}</span>
                      <Link href={`/portal/history/find?id=${r.applicantId}`} className="font-semibold text-heading hover:underline">{r.name ?? "Name not published"}</Link>
                      <span className="block font-mono text-xs text-muted">{r.applicantId}{r.applicantId === me ? <Badge tone="current" className="ml-2">you</Badge> : null}</span>
                    </div>
                    <span className="font-mono text-base font-semibold tabular-nums text-heading">{formatMarks(r.marksTotal)}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                    <span>{parts(r)}</span>
                    <StatusBadge value={r.status} />
                  </div>
                </li>
              ))}
            </ol>
            <div className="hidden sm:block">
              <DataTable
                caption={`Induction ${induction} gazette`}
                rows={list.rows}
                rowKey={(r) => r.applicantId}
                columns={[
                  { key: "rank", header: "#", align: "right", tone: "mono", cell: (r) => r.rank },
                  {
                    key: "who", header: "Candidate",
                    cell: (r) => (
                      <>
                        <Link href={`/portal/history/find?id=${r.applicantId}`} className="font-semibold text-heading hover:underline">{r.name ?? "Name not published"}</Link>
                        <span className="block font-mono text-xs text-muted">{r.applicantId}{r.applicantId === me ? <Badge tone="current" className="ml-2">you</Badge> : null}</span>
                      </>
                    ),
                  },
                  { key: "m", header: "Marks", align: "right", tone: "mono", cell: (r) => formatMarks(r.marksTotal) },
                  { key: "parts", header: "Score parts", tone: "muted", cell: (r) => <span className="text-xs">{parts(r) || "—"}</span> },
                  { key: "s", header: "Status", cell: (r) => <StatusBadge value={r.status} /> },
                ]}
              />
            </div>
            <Pager page={list.page} pages={list.pages} total={list.total} noun="applicants" hrefFor={href} />
          </div>
        </Card>
      )}
    </AreaPage>
  );
}
