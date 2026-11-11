import Link from "next/link";
import { notFound } from "next/navigation";
import { AreaPage } from "@/components/area-page";
import { snippetParam } from "@/lib/domain/community";
import { DiscussionPanel } from "@/components/community/discussion-panel";
import { RoundRoomPanel } from "@/components/rooms/round-room-panel";
import { MeritDelta } from "@/components/merit-delta";
import { CandidateList, ListFilters, ListNav, Pager, qs, ViewTabs } from "@/components/merit-lists";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EntityLink } from "@/components/entity-link";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { getSession } from "@/lib/auth/session";
import { verifiedApplicant } from "@/lib/data/candidates";
import { inductionLists, meritRanges, RANGE_BY, roundList, type ListFilters as Filters, type MeritRange, type RangeBy } from "@/lib/data/lists";
import { getRound, inductionMaxMarks, roundFacets } from "@/lib/data/merit";
import { inductionRunning, predictRound } from "@/lib/data/predictions";
import { ensureUser } from "@/lib/data/users";
import { getDb } from "@/lib/db/client";
import { formatMarks } from "@/lib/format";
import { PredictionBadge } from "@/components/charts/prediction-badge";
import { intParam, oneOf } from "@/lib/params";

export const metadata = { title: "Merit round" };
export const dynamic = "force-dynamic";

const FILTERS = [
  ["program", "Programme"],
  ["quota", "Quota"],
  ["speciality", "Speciality"],
  ["hospital", "Hospital"],
  ["consent", "Consent"],
] as const;
const VIEWS = ["list", "merit", "talk"] as const;
type View = (typeof VIEWS)[number];
const BY_LABEL: Record<RangeBy, string> = { seat: "Seat (speciality at a hospital)", speciality: "Speciality", hospital: "Hospital" };

/**
 * One official merit list. Three views: everyone on it (name, marks, seat, preference,
 * consent), the lowest and highest merit per seat, speciality or hospital, and the
 * round's room and questions.
 */
export default async function RoundPage({ params, searchParams }: {
  params: Promise<{ induction: string; round: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const p = await params;
  const inductionParam = intParam(p.induction), roundParam = intParam(p.round, 2);
  if (inductionParam === null || roundParam === null) notFound();
  const induction: number = inductionParam, roundNo: number = roundParam;
  const db = getDb();
  const session = await getSession();
  const round = await getRound(db, session, induction, roundNo);
  if (!round) notFound();

  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const view: View = oneOf(sp.view, VIEWS) ?? "list";
  const by: RangeBy = oneOf(sp.by, RANGE_BY) ?? "seat";
  const facets = await roundFacets(db, session, round.id);
  const filters: Filters = {};
  for (const [k] of FILTERS) filters[k] = oneOf(sp[k], facets[k]);
  const q = str("q").trim().slice(0, 60);
  if (q) filters.q = q;
  const page = intParam(sp.page, 4) ?? 1;

  const lists = await inductionLists(db, session, induction);
  const prevNo = lists.official.filter((r) => r < roundNo).at(-1);
  const nextNo = lists.official.find((r) => r > roundNo);
  const prev = prevNo ? await getRound(db, session, induction, prevNo) : null;
  const maxMarks = (await inductionMaxMarks(db))[induction];
  const running = !nextNo && lists.current && (await inductionRunning(db, induction));
  const me = session ? await verifiedApplicant(db, (await ensureUser(db, session)).id) : null;

  const base = `/portal/history/${induction}/rounds/${roundNo}`;
  const filterValues = Object.fromEntries(FILTERS.map(([k]) => [k, filters[k]]));
  const filtered = Object.values(filterValues).some(Boolean) || Boolean(q);
  const hrefFor = (v: View, extra: Record<string, string | number | undefined> = {}) =>
    `${base}${qs({ ...(v === "list" ? {} : { view: v }), ...(v === "talk" ? {} : filterValues), ...(v === "list" && q ? { q } : {}), ...(v === "merit" && by !== "seat" ? { by } : {}), ...extra })}`;

  const nextStep = lists.steps.find((s) => (s.kind === "estimate" || s.kind === "simulate") && s.roundNo === roundNo + 1);

  return (
    <AreaPage
      area="portal"
      trail={[{ label: "Merit lists", href: "/portal/history" }, { label: `Induction ${induction}`, href: `/portal/history/${induction}` }, { label: `Round ${roundNo}` }]}
      title={`Induction ${induction} · round ${roundNo}`}
      description={`${round.cycleName} (${round.cycleCode}) · ${round.allocations.toLocaleString("en-US")} allocations${maxMarks ? ` · marks out of ${maxMarks}` : ""}.`}
      status={<Badge tone="official" className="mx-2">Official PHF list</Badge>}
    >
      <Card>
        <ListNav steps={lists.steps} current={base} title={lists.current ? `Induction ${induction}: gazette and rounds` : `Induction ${induction}: rounds`} />
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <Link href={`/portal/history/${induction}`} className="font-semibold text-signal hover:underline">Induction overview and charts</Link>
          {prevNo ? <Link href={`/portal/history/${induction}/compare?from=${prevNo}&to=${roundNo}`} className="font-semibold text-signal hover:underline">Compare with round {prevNo}</Link> : null}
        </p>
      </Card>

      {nextStep ? (
        <Notice tone={nextStep.kind === "estimate" ? "warning" : "info"} title={nextStep.kind === "estimate" ? `Round ${roundNo + 1} is estimated` : `What happens in round ${roundNo + 1}?`}>
          {nextStep.kind === "estimate"
            ? <>An estimate of the next list, simulated from this one and its consent replies, is ready. <Link href={nextStep.href} className="font-semibold underline">Open estimated round {roundNo + 1}</Link></>
            : <>Simulate the next list from this one: change anyone&apos;s consent on your own copy and see who moves. <Link href={nextStep.href} className="font-semibold underline">Simulate round {roundNo + 1}</Link></>}
        </Notice>
      ) : null}

      <ViewTabs
        label="View"
        current={view}
        items={[
          { key: "list", href: hrefFor("list"), label: "Candidates" },
          { key: "merit", href: hrefFor("merit"), label: "Merit range" },
          { key: "talk", href: hrefFor("talk"), label: running ? "Room (live)" : "Discussion" },
        ]}
      />

      {view === "talk" ? (
        <>
          <RoundRoomPanel induction={induction} roundNo={roundNo} live={Boolean(running)} />
          <DiscussionPanel topic={{ kind: "round", key: `${induction}:${roundNo}` }} label={`round ${roundNo} of induction ${induction}`} />
        </>
      ) : (
        <Card>
          <ListFilters
            fields={FILTERS.map(([k, label]) => ({ name: k, label, options: facets[k], value: filters[k] }))}
            search={view === "list" ? { value: q, placeholder: "Name or applicant ID" } : undefined}
            keep={{ ...(view === "list" ? {} : { view }), ...(view === "merit" && by !== "seat" ? { by } : {}) }}
            clearHref={hrefFor(view, Object.fromEntries(FILTERS.map(([k]) => [k, undefined])))}
            filtered={filtered}
          />
        </Card>
      )}

      {view === "list" ? await candidatesView() : null}
      {view === "merit" ? await meritView() : null}
    </AreaPage>
  );

  async function candidatesView() {
    const list = await roundList(db, session, { roundId: round!.id, filters, page });
    if (!list.total) return <EmptyState title="Nobody on this list matches" action={<ButtonLink href={base} variant="secondary">Clear filters</ButtonLink>} />;
    return (
      <Card>
        <CardHeader
          title="Everyone on this list"
          description="Best marks first. Select a name to see that candidate in every list. Names as PHF publishes them."
        />
        <div className="grid gap-3">
          <Pager page={list.page} pages={list.pages} total={list.total} noun="allocations" hrefFor={(n) => hrefFor("list", { page: n > 1 ? n : undefined })} />
          <CandidateList rows={list.rows} me={me} caption={`Induction ${induction} round ${roundNo}: allocations`} />
          <Pager page={list.page} pages={list.pages} total={list.total} noun="allocations" hrefFor={(n) => hrefFor("list", { page: n > 1 ? n : undefined })} />
        </div>
      </Card>
    );
  }

  async function meritView() {
    const ranges = await meritRanges(db, session, { roundId: round!.id, prevRoundId: prev?.id ?? null, by, filters });
    const fwd = running && by === "seat" ? await predictRound(db, session, { induction, fromRound: roundNo }) : null;
    const gkey = (g: MeritRange) => `${g.program}|${g.quota}|${g.speciality}|${g.hospital}`;
    const ask = (g: MeritRange) => (g.speciality && g.hospital ? (
      <Link
        href={`/portal/community/new?${new URLSearchParams({ topic: `round|${induction}:${roundNo}`, snippet: snippetParam({ induction, round: roundNo, program: g.program, quota: g.quota, speciality: g.speciality, hospital: g.hospital }) })}`}
        className="whitespace-nowrap text-xs font-semibold text-signal hover:underline"
        aria-label={`Ask about ${g.speciality} at ${g.hospital}`}
      >
        Ask
      </Link>
    ) : null);
    const name = (g: MeritRange) => (
      <>
        {g.speciality ? <span className="font-medium"><EntityLink kind="speciality" id={g.specialityId} name={g.speciality} /></span> : null}
        {g.hospital ? <span className={g.speciality ? "block text-xs text-muted" : "font-medium"}><EntityLink kind="hospital" id={g.hospitalId} name={g.hospital} /></span> : null}
        <span className="block text-xs text-subtle">{g.program} · {g.quota}</span>
      </>
    );
    return (
      <Card>
        <CardHeader
          title="Lowest and highest merit"
          description={`Within each programme and quota. The lowest is the closing merit: the last candidate who got a seat${prev ? `; the arrow compares it with round ${prev.roundNo}` : ""}.`}
        />
        <div className="mb-4">
          <ViewTabs
            label="Group by"
            current={by}
            items={RANGE_BY.map((b) => ({ key: b, href: `${base}${qs({ view: "merit", ...filterValues, by: b === "seat" ? undefined : b })}`, label: b === "seat" ? "Seat" : BY_LABEL[b] }))}
          />
        </div>
        {ranges.length === 0 ? <EmptyState title="Nothing matches these filters" /> : (
          <>
            <ol className="grid gap-2 sm:hidden" aria-label={`Lowest and highest merit by ${BY_LABEL[by].toLowerCase()}`}>
              {ranges.slice(0, 300).map((g) => (
                <li key={gkey(g)} className="rounded-xl border border-line bg-surface p-3">
                  <div className="text-sm">{name(g)}</div>
                  <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-elevated p-2"><dt className="text-[0.7rem] text-muted">Lowest</dt><dd className="font-mono font-semibold tabular-nums">{formatMarks(g.lowest)}</dd></div>
                    <div className="rounded-lg bg-elevated p-2"><dt className="text-[0.7rem] text-muted">Highest</dt><dd className="font-mono font-semibold tabular-nums">{formatMarks(g.highest)}</dd></div>
                    <div className="rounded-lg bg-elevated p-2"><dt className="text-[0.7rem] text-muted">Allocated</dt><dd className="font-mono font-semibold tabular-nums">{g.allocations}{g.seats != null ? <span className="text-xs font-normal text-muted"> / {g.seats}</span> : null}</dd></div>
                  </dl>
                  {prev && g.prevLowest != null ? <p className="mt-2 text-xs text-muted">vs round {prev.roundNo}: <MeritDelta value={g.lowest - g.prevLowest} /></p> : null}
                </li>
              ))}
            </ol>
            <div className="hidden sm:block">
              <DataTable
                caption={`Lowest and highest merit by ${BY_LABEL[by].toLowerCase()}`}
                rows={ranges}
                rowKey={gkey}
                columns={[
                  { key: "g", header: BY_LABEL[by], sort: (g) => `${g.speciality ?? ""} ${g.hospital ?? ""}`, cell: name },
                  { key: "n", header: "Allocated", align: "right", sort: (g) => g.allocations, cell: (g) => <>{g.allocations}{g.seats != null ? <span className="text-muted"> / {g.seats}</span> : null}</> },
                  { key: "lo", header: "Lowest", align: "right", tone: "mono", sort: (g) => g.lowest, cell: (g) => formatMarks(g.lowest) },
                  { key: "hi", header: "Highest", align: "right", tone: "mono", sort: (g) => g.highest, cell: (g) => formatMarks(g.highest) },
                  ...(prev ? [{
                    key: "d", header: `Lowest vs R${prev.roundNo}`, align: "right" as const,
                    sort: (g: MeritRange) => (g.prevLowest == null ? null : g.lowest - g.prevLowest),
                    cell: (g: MeritRange) => <MeritDelta value={g.prevLowest == null ? null : g.lowest - g.prevLowest} />,
                  }] : []),
                  ...(fwd ? [{
                    key: "pf", header: <span title="Estimated lowest merit in the next round. Not official.">Likely R{roundNo + 1}</span>, align: "right" as const,
                    cell: (g: MeritRange) => { const b = fwd.hospitals.get(gkey(g)); return b ? <PredictionBadge {...b} /> : <span className="text-subtle">—</span>; },
                  }] : []),
                  ...(by === "seat" ? [{ key: "ask", header: <span className="sr-only">Ask</span>, align: "right" as const, cell: ask }] : []),
                ]}
              />
            </div>
            {ranges.length > 300 ? <p className="mt-2 text-xs text-muted sm:hidden">Showing the top 300 on a phone; filter to narrow down.</p> : null}
          </>
        )}
      </Card>
    );
  }
}
