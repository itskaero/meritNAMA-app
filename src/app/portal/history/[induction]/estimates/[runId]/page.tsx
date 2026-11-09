import Link from "next/link";
import { notFound } from "next/navigation";
import { AreaPage } from "@/components/area-page";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Notice } from "@/components/ui/notice";
import { selectClass } from "@/components/ui/styles";
import { getSession } from "@/lib/auth/session";
import { verifiedApplicant } from "@/lib/data/candidates";
import { getRound } from "@/lib/data/merit";
import { estimateList } from "@/lib/data/simulation";
import { ensureUser } from "@/lib/data/users";
import { getDb } from "@/lib/db/client";
import { formatMarks, formatUtc, isUuid } from "@/lib/format";
import { intParam } from "@/lib/params";

export const metadata = { title: "Estimated merit list" };
export const dynamic = "force-dynamic";

const LIMIT = 500;
const FILTERS = [["program", "Programme"], ["quota", "Quota"], ["speciality", "Speciality"], ["hospital", "Hospital"]] as const;
type Key = (typeof FILTERS)[number][0];

/**
 * An estimated (simulated) merit list in full, as the public site showed it: applicant
 * id, mark, seat and preference for every allocation, never names. Published estimates
 * are for every member; a person's own what-if runs are private to them.
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
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const me = session ? await verifiedApplicant(db, (await ensureUser(db, session)).id) : null;
  const official = await getRound(db, session, induction, est.roundNo);

  const facets = Object.fromEntries(FILTERS.map(([k]) => [k, [...new Set(est.rows.map((r) => r[k]))].sort()])) as Record<Key, string[]>;
  const filters = Object.fromEntries(FILTERS.map(([k]) => [k, facets[k].includes(one(k)) ? one(k) : ""])) as Record<Key, string>;
  const q = one("q").replace(/\D/g, "");
  const mineOnly = one("show") === "mine" && me;
  const rows = est.rows.filter((r) =>
    FILTERS.every(([k]) => !filters[k] || r[k] === filters[k]) && (!q || r.applicantId.includes(q)) && (!mineOnly || r.applicantId === me));

  // Closing merit per seat group (lowest mark placed), within the filters.
  const groups = new Map<string, { program: string; quota: string; speciality: string; hospital: string; placed: number; closing: number }>();
  for (const r of rows) {
    const k = `${r.program}|${r.quota}|${r.speciality}|${r.hospital}`;
    const g = groups.get(k) ?? { program: r.program, quota: r.quota, speciality: r.speciality, hospital: r.hospital, placed: 0, closing: Infinity };
    g.placed++;
    g.closing = Math.min(g.closing, r.mark);
    groups.set(k, g);
  }
  const groupRows = [...groups.values()].sort((a, b) => b.closing - a.closing);
  const mySeats = me ? est.rows.filter((r) => r.applicantId === me) : [];
  const base = `/portal/history/${induction}/estimates/${est.run.id}`;
  const filtered = Object.values(filters).some(Boolean) || q || mineOnly;

  return (
    <AreaPage
      area="portal"
      trail={[{ label: "Merit lists", href: "/portal/history" }, { label: `Induction ${induction}`, href: `/portal/history/${induction}` }, { label: `Estimated round ${est.roundNo}` }]}
      title={`Induction ${induction} · estimated round ${est.roundNo}`}
      description={`${est.published ? `Published ${formatUtc(est.run.publishedAt)} UTC` : "Your own what-if simulation, visible only to you"} · ${est.rows.length.toLocaleString("en-US")} allocations · ${est.run.kind === "first_round" ? "simulated from the gazette and portal preferences" : `simulated from round ${est.run.fromRound} and its consent replies`}.`}
      status={<Badge tone="simulated" className="mx-2">Estimate · not official</Badge>}
    >
      {official ? (
        <Notice tone="warning" title={`PHF has published round ${est.roundNo}`}>
          This estimate is kept for comparison. <Link href={`/portal/history/${induction}/rounds/${est.roundNo}`} className="font-semibold text-signal hover:underline">Open the official round {est.roundNo} →</Link>
        </Notice>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <ButtonLink href={`/portal/simulation?i=${induction}&base=${encodeURIComponent(`run:${est.run.id}`)}`} size="sm">What if… change consent on this list</ButtonLink>
        {official ? <ButtonLink href={`/portal/history/${induction}/rounds/${est.roundNo}`} variant="secondary" size="sm">Official round {est.roundNo}</ButtonLink> : null}
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

      <Card className="lg:sticky lg:top-0 lg:z-20 lg:rounded-t-none lg:shadow-[var(--mn-shadow-2)]">
        <form method="get" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))_9rem_auto] xl:items-end">
          {FILTERS.map(([k, label]) => (
            <label key={k} className="grid gap-1.5 text-sm font-medium">{label}
              <select name={k} defaultValue={filters[k]} className={selectClass}>
                <option value="">All</option>
                {facets[k].map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
          ))}
          <label className="grid gap-1.5 text-sm font-medium">Applicant id
            <input name="q" inputMode="numeric" defaultValue={q} placeholder="e.g. 27267" className={`${selectClass} font-mono`} />
          </label>
          <div className="flex gap-2">
            <Button type="submit" variant="secondary">Filter</Button>
            {filtered ? <ButtonLink href={base} variant="ghost">Clear</ButtonLink> : null}
          </div>
        </form>
        <p className="mt-3 text-sm text-muted" aria-live="polite">
          {rows.length.toLocaleString("en-US")} allocation{rows.length === 1 ? "" : "s"}{filtered ? " match" : ""} · {groupRows.length.toLocaleString("en-US")} seat groups
          {me ? <> · <Link href={`${base}?show=mine`} className="text-signal underline underline-offset-2">only mine</Link></> : null}
        </p>
      </Card>

      <Card>
        <CardHeader title="Estimated closing merit" description="The lowest mark placed in each seat group in this estimate. Not official." action={<Badge tone="simulated">Estimate</Badge>} />
        <DataTable
          caption="Estimated closing merit by seat group"
          rows={groupRows.slice(0, LIMIT)}
          rowKey={(g) => `${g.program}|${g.quota}|${g.speciality}|${g.hospital}`}
          columns={[
            { key: "s", header: "Speciality", sort: (g) => g.speciality, cell: (g) => g.speciality },
            { key: "h", header: "Hospital", tone: "muted", sort: (g) => g.hospital, cell: (g) => g.hospital },
            { key: "pq", header: "Programme · quota", tone: "muted", sort: (g) => `${g.program} ${g.quota}`, cell: (g) => `${g.program} · ${g.quota}` },
            { key: "n", header: "Placed", align: "right", sort: (g) => g.placed, cell: (g) => g.placed },
            { key: "c", header: "Closing", align: "right", tone: "mono", sort: (g) => g.closing, cell: (g) => formatMarks(g.closing) },
          ]}
        />
      </Card>

      <Card>
        <CardHeader
          title="The list"
          description={rows.length > LIMIT ? `Showing the first ${LIMIT} of ${rows.length.toLocaleString("en-US")}; filter to narrow down.` : "Every allocation in this estimate. Applicant ids as PHF publishes them; names are never stored."}
        />
        <DataTable
          caption="Estimated allocations"
          rows={rows.slice(0, LIMIT)}
          rowKey={(r) => `${r.applicantId}|${r.program}|${r.quota}`}
          columns={[
            { key: "id", header: "Applicant", tone: "mono", sort: (r) => Number(r.applicantId), cell: (r) => <>{r.applicantId}{r.applicantId === me ? <Badge tone="current" className="ml-2">you</Badge> : null}</> },
            { key: "m", header: "Mark", align: "right", tone: "mono", sort: (r) => r.mark, cell: (r) => formatMarks(r.mark) },
            { key: "pq", header: "Programme · quota", tone: "muted", sort: (r) => `${r.program} ${r.quota}`, cell: (r) => `${r.program} · ${r.quota}` },
            { key: "s", header: "Speciality", sort: (r) => r.speciality, cell: (r) => r.speciality },
            { key: "h", header: "Hospital", tone: "muted", sort: (r) => r.hospital, cell: (r) => r.hospital },
            { key: "p", header: "Pref.", align: "right", sort: (r) => r.preferenceNo, cell: (r) => (r.preferenceNo ? `#${r.preferenceNo}` : "—") },
          ]}
        />
      </Card>
    </AreaPage>
  );
}
