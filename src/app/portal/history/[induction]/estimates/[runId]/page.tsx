import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AreaPage } from "@/components/area-page";
import { CandidateList, ListFilters, ListNav, Pager, qs, ViewTabs, type CandidateRow } from "@/components/merit-lists";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { getSession } from "@/lib/auth/session";
import { verifiedApplicant } from "@/lib/data/candidates";
import { inductionLists, namesFor, PAGE_SIZE } from "@/lib/data/lists";
import { getRound } from "@/lib/data/merit";
import { estimateList } from "@/lib/data/simulation";
import { ensureUser } from "@/lib/data/users";
import { getDb } from "@/lib/db/client";
import { formatMarks, formatUtc, isUuid } from "@/lib/format";
import { intParam, oneOf } from "@/lib/params";

export const metadata = { title: "Estimated merit list" };
export const dynamic = "force-dynamic";

const FILTERS = [["program", "Programme"], ["quota", "Quota"], ["speciality", "Speciality"], ["hospital", "Hospital"]] as const;
type Key = (typeof FILTERS)[number][0];
const VIEWS = ["list", "merit"] as const;

/**
 * An estimated (simulated) merit list of the current induction, in full: name (from the
 * gazette or the official lists), mark, seat and preference for every allocation, and
 * the lowest and highest merit per seat. Published estimates are for every member; a
 * person's own what-if runs are private to them. Once the induction is over, a
 * published estimate gives way to the official list.
 */
export default async function EstimatePage({ params, searchParams }: {
  params: Promise<{ induction: string; runId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const p = await params;
  const induction = intParam(p.induction);
  if (induction === null || !isUuid(p.runId)) notFound();
  const db = getDb();
  const session = await getSession();
  const est = await estimateList(db, session, p.runId);
  if (!est || est.run.inductionId !== induction) notFound();
  const [official, lists] = await Promise.all([getRound(db, session, induction, est.roundNo), inductionLists(db, session, induction)]);
  // Finished inductions show official lists only.
  if (est.published && !lists.current && official) redirect(`/portal/history/${induction}/rounds/${est.roundNo}`);

  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const view = oneOf(sp.view, VIEWS) ?? "list";
  const me = session ? await verifiedApplicant(db, (await ensureUser(db, session)).id) : null;
  const names = await namesFor(db, session, { induction, applicantIds: est.rows.map((r) => r.applicantId) });

  const facets = Object.fromEntries(FILTERS.map(([k]) => [k, [...new Set(est.rows.map((r) => r[k]))].sort()])) as Record<Key, string[]>;
  const filters = Object.fromEntries(FILTERS.map(([k]) => [k, facets[k].includes(one(k)) ? one(k) : ""])) as Record<Key, string>;
  const q = one("q").trim().slice(0, 60);
  const qLower = q.toLowerCase();
  const mineOnly = one("show") === "mine" && Boolean(me);
  const rows = est.rows
    .filter((r) => FILTERS.every(([k]) => !filters[k] || r[k] === filters[k])
      && (!q || (/^\d+$/.test(q) ? r.applicantId.includes(q) : (names.get(r.applicantId) ?? "").toLowerCase().includes(qLower)))
      && (!mineOnly || r.applicantId === me))
    .sort((a, b) => b.mark - a.mark);

  const base = `/portal/history/${induction}/estimates/${est.run.id}`;
  const filtered = Object.values(filters).some(Boolean) || Boolean(q) || mineOnly;
  const keepFilters = { ...filters, ...(view === "list" ? { q } : {}), show: mineOnly ? "mine" : undefined };
  const mySeats = me ? est.rows.filter((r) => r.applicantId === me) : [];

  return (
    <AreaPage
      area="portal"
      trail={[{ label: "Merit lists", href: "/portal/history" }, { label: `Induction ${induction}`, href: `/portal/history/${induction}` }, { label: `Estimated round ${est.roundNo}` }]}
      title={`Induction ${induction} · estimated round ${est.roundNo}`}
      description={`${est.published ? `Published ${formatUtc(est.run.publishedAt)} UTC` : "Your own what-if simulation, visible only to you"} · ${est.rows.length.toLocaleString("en-US")} allocations · ${est.run.kind === "first_round" ? "simulated from the gazette and the preferences on the portal" : `simulated from round ${est.run.fromRound} and its consent replies`}.`}
      status={<Badge tone="simulated" className="mx-2">Estimate · not official</Badge>}
    >
      <Card>
        <ListNav steps={lists.steps} current={base} title={`Induction ${induction}: gazette and rounds`} />
      </Card>
      {official ? (
        <Notice tone="warning" title={`PHF has published round ${est.roundNo}`}>
          This estimate is kept for comparison. <Link href={`/portal/history/${induction}/rounds/${est.roundNo}`} className="font-semibold text-signal hover:underline">Open the official round {est.roundNo} →</Link>
        </Notice>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <ButtonLink href={`/portal/simulation?i=${induction}&base=${encodeURIComponent(`run:${est.run.id}`)}`} size="sm">What if… change consent on this list</ButtonLink>
      </div>

      {me ? (
        <Card>
          <CardHeader title="Your place in this estimate" description={`Applicant ${me}, from your linked record.`} />
          {mySeats.length ? (
            <ul className="grid gap-1.5 text-sm">
              {mySeats.map((m) => (
                <li key={`${m.program}|${m.quota}`} className="rounded-lg border border-line px-3 py-2">
                  <span className="font-semibold text-heading">{m.speciality}</span> · {m.hospital}
                  <span className="block text-xs text-muted">{m.program} · {m.quota} · preference #{m.preferenceNo} · mark {formatMarks(m.mark)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">This estimate places you nowhere. Try What if… to see how others&apos; consent could change that.</p>}
        </Card>
      ) : null}

      <ViewTabs
        label="View"
        current={view}
        items={[
          { key: "list", href: `${base}${qs({ ...filters, q, show: mineOnly ? "mine" : undefined })}`, label: "Candidates" },
          { key: "merit", href: `${base}${qs({ view: "merit", ...filters })}`, label: "Merit range" },
        ]}
      />
      <Card>
        <ListFilters
          fields={FILTERS.map(([k, label]) => ({ name: k, label, options: facets[k], value: filters[k] }))}
          search={view === "list" ? { value: q, placeholder: "Name or applicant ID" } : undefined}
          keep={view === "merit" ? { view } : mineOnly ? { show: "mine" } : {}}
          clearHref={view === "merit" ? `${base}?view=merit` : base}
          filtered={filtered}
        />
        {me && view === "list" ? <p className="mt-3 text-sm"><Link href={`${base}?show=mine`} className="text-signal underline underline-offset-2">Show only my seats</Link></p> : null}
      </Card>

      {view === "list" ? listView() : meritView()}
    </AreaPage>
  );

  function listView() {
    if (!rows.length) return <EmptyState title="Nobody in this estimate matches" action={<ButtonLink href={base} variant="secondary">Clear filters</ButtonLink>} />;
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    const page = Math.min(intParam(sp.page, 4) ?? 1, pages);
    const pageRows: CandidateRow[] = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((r, i) => ({
      rank: (page - 1) * PAGE_SIZE + i + 1, applicantId: r.applicantId, name: names.get(r.applicantId) ?? null, marks: r.mark,
      program: r.program, quota: r.quota, speciality: r.speciality, hospital: r.hospital, preferenceNo: r.preferenceNo,
    }));
    const href = (n: number) => `${base}${qs({ ...keepFilters, page: n > 1 ? n : undefined })}`;
    return (
      <Card>
        <CardHeader title="Everyone in this estimate" description="Best marks first. Names from the gazette or the official lists. Not official." action={<Badge tone="simulated">Estimate</Badge>} />
        <div className="grid gap-3">
          <Pager page={page} pages={pages} total={rows.length} noun="allocations" hrefFor={href} />
          <CandidateList rows={pageRows} me={me} caption="Estimated allocations" showConsent={false} />
          <Pager page={page} pages={pages} total={rows.length} noun="allocations" hrefFor={href} />
        </div>
      </Card>
    );
  }

  function meritView() {
    const groups = new Map<string, { program: string; quota: string; speciality: string; hospital: string; placed: number; lowest: number; highest: number }>();
    for (const r of rows) {
      const k = `${r.program}|${r.quota}|${r.speciality}|${r.hospital}`;
      const g = groups.get(k) ?? { program: r.program, quota: r.quota, speciality: r.speciality, hospital: r.hospital, placed: 0, lowest: Infinity, highest: -Infinity };
      g.placed++;
      g.lowest = Math.min(g.lowest, r.mark);
      g.highest = Math.max(g.highest, r.mark);
      groups.set(k, g);
    }
    const list = [...groups.values()].sort((a, b) => b.highest - a.highest);
    if (!list.length) return <EmptyState title="Nothing matches these filters" />;
    return (
      <Card>
        <CardHeader title="Estimated lowest and highest merit" description="Per seat, within each programme and quota. The lowest is the estimated closing merit. Not official." action={<Badge tone="simulated">Estimate</Badge>} />
        <DataTable
          caption="Estimated lowest and highest merit by seat"
          rows={list}
          rowKey={(g) => `${g.program}|${g.quota}|${g.speciality}|${g.hospital}`}
          columns={[
            { key: "s", header: "Seat", sort: (g) => `${g.speciality} ${g.hospital}`, cell: (g) => <><span className="font-medium">{g.speciality}</span><span className="block text-xs text-muted">{g.hospital}</span><span className="block text-xs text-subtle">{g.program} · {g.quota}</span></> },
            { key: "n", header: "Placed", align: "right", sort: (g) => g.placed, cell: (g) => g.placed },
            { key: "lo", header: "Lowest", align: "right", tone: "mono", sort: (g) => g.lowest, cell: (g) => formatMarks(g.lowest) },
            { key: "hi", header: "Highest", align: "right", tone: "mono", sort: (g) => g.highest, cell: (g) => formatMarks(g.highest) },
          ]}
        />
      </Card>
    );
  }
}
