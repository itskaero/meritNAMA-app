import Link from "next/link";
import { ChartSource } from "@/components/charts/chart-source";
import { notFound } from "next/navigation";
import { AreaPage } from "@/components/area-page";
import { snippetParam } from "@/lib/domain/community";
import { DiscussionPanel } from "@/components/community/discussion-panel";
import { RoundRoomPanel } from "@/components/rooms/round-room-panel";
import { BarList } from "@/components/charts/bar-list";
import { RoundChips } from "@/components/round-chips";
import { MeritDelta } from "@/components/merit-delta";
import { ActionBar } from "@/components/ui/action-bar";
import { Button, ButtonLink } from "@/components/ui/button";
import { selectClass } from "@/components/ui/styles";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EntityLink } from "@/components/entity-link";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/page-header";
import { getSession } from "@/lib/auth/session";
import { getRound, inductionMaxMarks, roundCandidates, listInductionsWithRounds, roundFacets, roundGroups, type RoundFilters } from "@/lib/data/merit";
import { getDb } from "@/lib/db/client";
import { formatMarks } from "@/lib/format";
import { inductionRunning, methodCheck, predictRound } from "@/lib/data/predictions";
import { MethodNote, PredictionBadge } from "@/components/charts/prediction-badge";
import { intParam, oneOf } from "@/lib/params";

export const metadata = { title: "Merit round" };
export const dynamic = "force-dynamic";

const LIMIT = 400;
const PAGE = 100;
const FILTERS = [
  ["program", "Programme"],
  ["quota", "Quota"],
  ["speciality", "Speciality"],
  ["hospital", "Hospital"],
] as const;

export default async function RoundPage({ params, searchParams }: {
  params: Promise<{ induction: string; round: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const p = await params;
  const induction = intParam(p.induction), roundNo = intParam(p.round, 2);
  if (induction === null || roundNo === null) notFound();
  const db = getDb();
  const session = await getSession();
  const round = await getRound(db, session, induction, roundNo);
  if (!round) notFound();

  const sp = await searchParams;
  const facets = await roundFacets(db, session, round.id);
  const filters: RoundFilters = {};
  for (const [k] of FILTERS) filters[k] = oneOf(sp[k], facets[k]);
  const all = await listInductionsWithRounds(db, session);
  const ind = all.find((i) => i.id === induction)!;
  const prevNo = ind.rounds.filter((r) => r.roundNo < roundNo).at(-1)?.roundNo;
  const nextNo = ind.rounds.find((r) => r.roundNo > roundNo)?.roundNo;
  const prev = prevNo ? await getRound(db, session, induction, prevNo) : null;
  const [groups, maxMarks] = await Promise.all([roundGroups(db, session, round.id, prev?.id ?? null, filters), inductionMaxMarks(db)]);
  const max = maxMarks[induction];
  const filtered = Object.keys(filters).length > 0;
  // Predictions: the range we would have given for this round (from the round before),
  // and, for the latest round of a running cycle, the range for the next one.
  const running = !nextNo && (await inductionRunning(db, induction));
  const [back, fwd, check] = await Promise.all([
    prevNo ? predictRound(db, session, { induction, fromRound: prevNo }) : Promise.resolve(null),
    running ? predictRound(db, session, { induction, fromRound: roundNo }) : Promise.resolve(null),
    running ? Promise.resolve(null) : methodCheck(db, session, { induction }),
  ]);
  const gkey = (g: { program: string; quota: string; speciality: string; hospital: string }) => `${g.program}|${g.quota}|${g.speciality}|${g.hospital}`;

  // Busiest specialities in view, for the bar list.
  const bySpec = new Map<string, number>();
  for (const g of groups) bySpec.set(g.speciality, (bySpec.get(g.speciality) ?? 0) + g.allocations);
  const topSpecs = [...bySpec].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const base = `/portal/history/${induction}/rounds/${roundNo}`;
  const q = typeof sp.q === "string" ? sp.q.replace(/\s+/g, " ").trim().slice(0, 60) : "";
  const cpage = Math.max(intParam(typeof sp.cp === "string" ? sp.cp : undefined) ?? 1, 1);
  const cands = await roundCandidates(db, session, { roundId: round.id, filters, q, offset: (cpage - 1) * PAGE, limit: PAGE });
  const cpages = Math.max(1, Math.ceil(cands.total / PAGE));
  const keep = (extra: Record<string, string>) => {
    const u = new URLSearchParams();
    for (const [k] of FILTERS) if (filters[k]) u.set(k, filters[k]!);
    if (q) u.set("q", q);
    for (const [k, v] of Object.entries(extra)) u.set(k, v);
    return `${base}?${u.toString()}#candidates`;
  };

  return (
    <AreaPage
      area="portal"
      trail={[{ label: "Merit lists", href: "/portal/history" }, { label: `Induction ${induction}`, href: `/portal/history/${induction}` }, { label: `Round ${roundNo}` }]}
      title={`Induction ${induction} · round ${roundNo}`}
      description={`${round.cycleName} (${round.cycleCode}) · ${round.allocations.toLocaleString("en-US")} allocations. Closing merit is the lowest marks allocated in each group${max ? `, out of ${max}` : ""}.`}
      status={<StatusPill>{prev ? `Compared with round ${prev.roundNo}` : "First round"}</StatusPill>}
    >
      <ActionBar
        actions={[
          ...(prevNo ? [{ label: `Compare with round ${prevNo}`, href: `/portal/history/${induction}/compare?from=${prevNo}&to=${roundNo}`, icon: "trend" as const, primary: true }] : []),
          ...(prevNo ? [{ label: `Round ${prevNo}`, href: `/portal/history/${induction}/rounds/${prevNo}`, icon: "history" as const }] : []),
          ...(nextNo ? [{ label: `Round ${nextNo}`, href: `/portal/history/${induction}/rounds/${nextNo}`, icon: "arrow" as const }] : []),
          { label: "Score finder", href: `/portal/finder?induction=${induction}`, icon: "target" as const },
          { label: running ? "Round room (live)" : "Round room", href: "#room", icon: "chat" as const },
        ]}
      />
      <Card>
        <div className="grid gap-3">
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted">Rounds of induction {induction}</p>
            <RoundChips label="Rounds" items={ind.rounds.map((r) => ({ key: r.roundNo, label: `R${r.roundNo}`, href: `/portal/history/${induction}/rounds/${r.roundNo}`, current: r.roundNo === roundNo }))} />
          </div>
          {all.length > 1 ? (
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted">Other inductions (opens their latest round)</p>
              <RoundChips label="Inductions" items={[...all].sort((a, b) => b.id - a.id).map((i) => ({ key: i.id, label: `I${i.id}`, hint: `${i.rounds.length} rounds`, href: `/portal/history/${i.id}/rounds/${i.rounds.at(-1)!.roundNo}`, current: i.id === induction }))} />
            </div>
          ) : null}
        </div>
      </Card>
      <Card className="lg:sticky lg:top-0 lg:z-20 lg:rounded-t-none lg:shadow-[var(--mn-shadow-2)]">
        <form method="get" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))_auto] xl:items-end">
          {FILTERS.map(([k, label]) => (
            <label key={k} className="grid gap-1.5 text-sm font-medium">
              {label}
              <select name={k} defaultValue={filters[k] ?? ""} className={selectClass}>
                <option value="">All</option>
                {(facets[k] as string[]).map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
          ))}
          <div className="flex gap-2">
            <Button type="submit" variant="secondary">Filter</Button>
            {filtered ? <ButtonLink href={base} variant="ghost">Clear</ButtonLink> : null}
          </div>
        </form>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
          <span aria-live="polite">{groups.length.toLocaleString("en-US")} groups{filtered ? " match" : ""}</span>
        </div>
      </Card>
      {running ? <RoundRoomPanel induction={induction} roundNo={roundNo} live /> : null}

      {groups.length === 0 ? (
        <EmptyState title="No allocations match these filters" action={<ButtonLink href={base} variant="secondary">Clear filters</ButtonLink>} />
      ) : (
        <>
          {filters.speciality ? null : (
            <Card>
              <CardHeader title="Most allocations" description={filtered ? "Within your filters. Select a speciality to filter by it." : "Select a speciality to filter by it."} />
              <BarList items={topSpecs.map(([label, value]) => ({ label, value, href: `${base}?speciality=${encodeURIComponent(label)}` }))} />
              <ChartSource tone="official" source={`PHF merit list, induction ${induction} round ${roundNo}`} induction={induction} />
            </Card>
          )}
          <Card>
            <CardHeader title="Closing merit" description={groups.length > LIMIT ? `Showing the first ${LIMIT}; filter to narrow down.` : undefined} />
            <DataTable
              caption="Closing merit by programme, quota, speciality and hospital"
              rows={groups.slice(0, LIMIT)}
              rowKey={(g) => `${g.program}|${g.quota}|${g.speciality}|${g.hospital}`}
              columns={[
                { key: "s", header: "Speciality", sort: (g) => g.speciality, cell: (g) => <EntityLink kind="speciality" id={g.specialityId} name={g.speciality} /> },
                { key: "h", header: "Hospital", tone: "muted", sort: (g) => g.hospital, cell: (g) => <EntityLink kind="hospital" id={g.hospitalId} name={g.hospital} /> },
                { key: "pq", header: "Programme · quota", tone: "muted", sort: (g) => `${g.program} ${g.quota}`, cell: (g) => `${g.program} · ${g.quota}` },
                { key: "n", header: "Allocated", align: "right", sort: (g) => g.allocations, cell: (g) => g.allocations },
                { key: "c", header: "Closing", align: "right", tone: "mono", sort: (g) => g.closing, cell: (g) => formatMarks(g.closing) },
                {
                  key: "d",
                  header: `vs R${prev?.roundNo ?? "–"}`,
                  align: "right",
                  sort: (g) => (g.prevClosing == null || g.closing == null ? null : g.closing - g.prevClosing),
                  cell: (g) => (prev ? <MeritDelta value={g.prevClosing == null ? null : (g.closing ?? 0) - g.prevClosing} /> : <span className="text-subtle">—</span>),
                },
                ...(back ? [{
                  key: "pb",
                  header: <span title="The range this method gave from the round before. ✓ when the real closing fell inside.">Predicted from R{prevNo}</span>,
                  align: "right" as const,
                  cell: (g: (typeof groups)[number]) => {
                    const b = back.hospitals.get(gkey(g));
                    return b ? <PredictionBadge {...b} compact /> : <span className="text-subtle">—</span>;
                  },
                }] : []),
                ...(fwd ? [{
                  key: "pf",
                  header: <span title="Estimated closing merit for the next round. Not official.">Likely R{roundNo + 1}</span>,
                  align: "right" as const,
                  cell: (g: (typeof groups)[number]) => {
                    const b = fwd.hospitals.get(gkey(g));
                    return b ? <PredictionBadge {...b} /> : <span className="text-subtle">—</span>;
                  },
                }] : []),
                {
                  key: "ask",
                  header: <span className="sr-only">Ask</span>,
                  align: "right",
                  cell: (g) => (
                    <Link
                      href={`/portal/community/new?${new URLSearchParams({ topic: `round|${induction}:${roundNo}`, snippet: snippetParam({ induction, round: roundNo, program: g.program, quota: g.quota, speciality: g.speciality, hospital: g.hospital }) })}`}
                      className="whitespace-nowrap text-xs font-semibold text-signal hover:underline"
                      aria-label={`Ask about ${g.speciality} at ${g.hospital}`}
                    >
                      Ask
                    </Link>
                  ),
                },
              ]}
            />
          </Card>
        </>
      )}
      <Card id="candidates">
        <CardHeader title="Candidates" description={`${cands.total.toLocaleString("en-US")} allocation${cands.total === 1 ? "" : "s"}${filtered || q ? " match" : ""}, best marks first. Names, PMDC numbers and applicant ids as PHF publishes them.`} />
        <form method="get" action={`${base}#candidates`} className="mb-4 flex flex-wrap items-end gap-3">
          {FILTERS.map(([k]) => (filters[k] ? <input key={k} type="hidden" name={k} value={filters[k]} /> : null))}
          <label className="grid gap-1.5 text-sm font-medium">Name, PMDC or applicant id
            <input name="q" defaultValue={q} placeholder="e.g. Ayesha, 97937-P or 27267" className={`${selectClass} w-64`} />
          </label>
          <Button type="submit" variant="secondary">Search</Button>
          {q ? <ButtonLink href={keep({ q: "" })} variant="ghost">Clear</ButtonLink> : null}
        </form>
        <DataTable
          caption="Candidates in this round"
          rows={cands.rows}
          rowKey={(r) => `${r.applicantId}|${r.program}|${r.quota}|${r.speciality}|${r.hospital}`}
          columns={[
            {
              key: "id", header: "Candidate", sort: (r) => r.name ?? r.applicantId,
              cell: (r) => (
                <Link href={`/portal/history/find?id=${r.applicantId}`} className="hover:underline">
                  <span className="block font-medium text-ink">{r.name ?? "Name not published"}</span>
                  <span className="block font-mono text-xs text-muted">{r.applicantId}{r.pmdcNo ? ` · ${r.pmdcNo}` : ""}</span>
                </Link>
              ),
            },
            { key: "m", header: "Marks", align: "right", tone: "mono", sort: (r) => r.marks, cell: (r) => formatMarks(r.marks) },
            { key: "s", header: "Speciality", sort: (r) => r.speciality, cell: (r) => r.speciality },
            { key: "h", header: "Hospital", tone: "muted", sort: (r) => r.hospital, cell: (r) => r.hospital },
            { key: "pq", header: "Programme · quota", tone: "muted", sort: (r) => `${r.program} ${r.quota}`, cell: (r) => `${r.program} · ${r.quota}` },
            { key: "p", header: "Pref.", align: "right", sort: (r) => r.preferenceNo ?? 0, cell: (r) => (r.preferenceNo ? `#${r.preferenceNo}` : "—") },
            { key: "c", header: "Consent", tone: "muted", sort: (r) => r.consent ?? "", cell: (r) => r.consent || "—" },
          ]}
        />
        {cpages > 1 ? (
          <nav aria-label="Pages" className="mt-4 flex items-center justify-between text-sm">
            {cpage > 1 ? <ButtonLink href={keep({ cp: String(cpage - 1) })} variant="secondary" size="sm">← Previous</ButtonLink> : <span />}
            <span className="text-muted">Page {cpage} of {cpages}</span>
            {cpage < cpages ? <ButtonLink href={keep({ cp: String(cpage + 1) })} variant="secondary" size="sm">Next →</ButtonLink> : <span />}
          </nav>
        ) : null}
      </Card>
      {back || fwd ? (
        <Card>
          <CardHeader title={fwd ? `Likely closing merit in round ${roundNo + 1}` : "How the predictions did"} description={fwd ? "Ranges, not single numbers: where each group's closing merit will probably land next round." : `Each group's range was made from round ${prevNo} using the other inductions. ✓ marks a closing that fell inside.`} />
          <MethodNote share={check?.share ?? null} n={check?.n ?? 0} induction={check ? induction : null} />
          <p className="mt-2 text-xs text-subtle">Based on inductions {(fwd ?? back)!.method.inductions.join(", ")}.</p>
        </Card>
      ) : null}
      {running ? null : <RoundRoomPanel induction={induction} roundNo={roundNo} live={false} />}
      <DiscussionPanel topic={{ kind: "round", key: `${induction}:${roundNo}` }} label={`round ${roundNo} of induction ${induction}`} />
    </AreaPage>
  );
}
