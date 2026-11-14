import Link from "next/link";
import { notFound } from "next/navigation";
import { AreaPage } from "@/components/area-page";
import { BarList } from "@/components/charts/bar-list";
import { ChartSource } from "@/components/charts/chart-source";
import { MethodNote, PredictionBadge } from "@/components/charts/prediction-badge";
import { DiscussionPanel } from "@/components/community/discussion-panel";
import { EntityLink } from "@/components/entity-link";
import { Icon } from "@/components/icon";
import { JoinPill } from "@/components/joining";
import { MeritDelta } from "@/components/merit-delta";
import { RoundRoomPanel } from "@/components/rooms/round-room-panel";
import { AuroraHeader } from "@/components/ui/aurora-header";
import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Pill, Segmented } from "@/components/ui/segmented";
import { selectClass } from "@/components/ui/styles";
import { getSession } from "@/lib/auth/session";
import { roundJoinStates } from "@/lib/data/joining";
import { getRound, inductionMaxMarks, inductionTimeline, listInductionsWithRounds, roundCandidates, roundFacets, roundGroups, seatsInRound, type RoundFilters } from "@/lib/data/merit";
import { inductionRunning, methodCheck, predictRound } from "@/lib/data/predictions";
import { gazetteCandidate, publishedEstimates } from "@/lib/data/simulation";
import { getDb } from "@/lib/db/client";
import { snippetParam } from "@/lib/domain/community";
import { joinKey } from "@/lib/domain/joining";
import { formatMarks } from "@/lib/format";
import { intParam, oneOf } from "@/lib/params";

export const metadata = { title: "Merit round" };
export const dynamic = "force-dynamic";

const LIMIT = 400;
const PAGE = 50;
const FILTERS = [["program", "Programme"], ["quota", "Quota"], ["speciality", "Speciality"], ["hospital", "Hospital"]] as const;
const IVORY = "text-[#F3EEE5]";
const IVORY_DIM = "text-[#F3EEE5]/65";
const fmt = (n: number) => n.toLocaleString("en-US");
const initials = (name: string | null, id: string) => (name ? name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") : id.slice(-2));
const consentTone = (c: string | null) => (c === "Accepted" ? "success" : c === "Rejected" ? "danger" : c ? "neutral" : null);

/** One published round: who got which seat, consent, what changed since the round before, closing merit by seat. */
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
  const tab = sp.tab === "closing" ? "closing" : "candidates";
  const facets = await roundFacets(db, session, round.id);
  const filters: RoundFilters = {};
  for (const [k] of FILTERS) filters[k] = oneOf(sp[k], facets[k]);
  const all = await listInductionsWithRounds(db, session);
  const ind = all.find((i) => i.id === induction)!;
  const prevNo = ind.rounds.filter((r) => r.roundNo < roundNo).at(-1)?.roundNo;
  const nextNo = ind.rounds.find((r) => r.roundNo > roundNo)?.roundNo;
  const prev = prevNo ? await getRound(db, session, induction, prevNo) : null;
  const filtered = Object.values(filters).some(Boolean);
  const base = `/portal/history/${induction}/rounds/${roundNo}`;
  const q = typeof sp.q === "string" ? sp.q.replace(/\s+/g, " ").trim().slice(0, 60) : "";
  const cpage = Math.max(intParam(typeof sp.cp === "string" ? sp.cp : undefined) ?? 1, 1);
  const picked = typeof sp.c === "string" ? sp.c.replace(/\D/g, "").slice(0, 10) : "";

  const [timeline, maxMarks, running, estimates, join] = await Promise.all([
    inductionTimeline(db, session, induction), inductionMaxMarks(db), inductionRunning(db, induction),
    publishedEstimates(db, session, { induction }), nextNo ? Promise.resolve(null) : roundJoinStates(db, session, induction, roundNo),
  ]);
  const running_ = !nextNo && running;
  const max = maxMarks[induction];
  const t = timeline.find((x) => x.roundNo === roundNo);
  const tPrev = prevNo ? timeline.find((x) => x.roundNo === prevNo) : null;
  const est = estimates.find((e) => !e.official && e.roundNo === roundNo + 1);
  const hasConsent = Boolean(t && t.accepted + t.rejected + t.notAvail > 0);

  const keep = (extra: Record<string, string>) => {
    const u = new URLSearchParams();
    for (const [k] of FILTERS) if (filters[k]) u.set(k, filters[k]!);
    if (q) u.set("q", q);
    if (tab === "closing") u.set("tab", "closing");
    for (const [k, v] of Object.entries(extra)) if (v) u.set(k, v); else u.delete(k);
    const s = u.toString();
    return `${base}${s ? `?${s}` : ""}`;
  };

  return (
    <AreaPage area="portal" trail={[{ label: "Merit lists", href: "/portal/history" }, { label: `Induction ${induction}`, href: `/portal/history/${induction}` }, { label: `Round ${roundNo}` }]} title={`Induction ${induction} · round ${roundNo}`} bare>
      <AuroraHeader as="section" className="grid gap-5 p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className={cn("text-xs", IVORY_DIM)}>
              <Link href="/portal/history" className="hover:underline">Merit lists</Link> / <Link href={`/portal/history/${induction}`} className="hover:underline">Induction {induction}</Link> · {round.cycleName}
            </p>
            <h1 className={cn("mt-1 text-3xl font-semibold tracking-tight sm:text-4xl", IVORY)}>
              Round {roundNo} <span className={cn("text-base font-normal", IVORY_DIM)}>{max ? `· out of ${max} ` : ""}· official</span>
            </h1>
          </div>
          <nav aria-label="Rounds" className="mn-seg mn-seg-iv max-w-full overflow-x-auto">
            {ind.rounds.map((r) => (
              <Link key={r.roundNo} href={`/portal/history/${induction}/rounds/${r.roundNo}`} aria-current={r.roundNo === roundNo ? "page" : undefined}>R{r.roundNo}</Link>
            ))}
            {est ? <Link href={`/portal/estimates?run=${est.id}`} className="border border-dashed border-amber/60 !text-amber">R{est.roundNo} est.</Link> : null}
          </nav>
        </div>
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3"><dt className={cn("text-xs", IVORY_DIM)}>Allocations</dt><dd className={cn("text-2xl font-semibold tabular-nums", IVORY)}>{fmt(round.allocations)}</dd></div>
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
            {hasConsent ? (
              <>
                <svg viewBox="0 0 36 36" className="h-11 w-11 flex-none -rotate-90" aria-hidden><circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="4" /><circle cx="18" cy="18" r="15" fill="none" stroke="var(--mn-success)" strokeWidth="4" strokeLinecap="round" pathLength="100" strokeDasharray={`${Math.round((t!.accepted / t!.allocations) * 100)} 100`} /></svg>
                <div><dt className={cn("text-xs", IVORY_DIM)}>Accepted</dt><dd className={cn("text-2xl font-semibold tabular-nums", IVORY)}>{Math.round((t!.accepted / t!.allocations) * 100)}%</dd></div>
              </>
            ) : <div><dt className={cn("text-xs", IVORY_DIM)}>Candidates</dt><dd className={cn("text-2xl font-semibold tabular-nums", IVORY)}>{t ? fmt(t.applicants) : "—"}</dd></div>}
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
            {hasConsent ? (
              <><dt className={cn("text-xs", IVORY_DIM)}>Seats freed for R{roundNo + 1}</dt><dd className="text-2xl font-semibold tabular-nums text-danger">{fmt(t!.rejected + t!.notAvail)}</dd></>
            ) : join ? (
              <><dt className={cn("text-xs", IVORY_DIM)}>Did not join</dt><dd className="text-2xl font-semibold tabular-nums text-danger">{fmt([...join.values()].filter((s) => s === "not_joined").length)}</dd></>
            ) : (
              <><dt className={cn("text-xs", IVORY_DIM)}>Round</dt><dd className={cn("text-2xl font-semibold", IVORY)}>{nextNo ? "superseded" : running_ ? "latest" : "final"}</dd></>
            )}
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
            <dt className={cn("text-xs", IVORY_DIM)}>{tPrev ? `Median vs R${tPrev.roundNo}` : "Median closing"}</dt>
            <dd className={cn("text-2xl font-semibold tabular-nums", IVORY)}>
              {t?.medianClosing != null ? formatMarks(t.medianClosing) : "—"}
              {t?.medianClosing != null && tPrev?.medianClosing != null ? <span className={cn("ml-2 text-sm", t.medianClosing <= tPrev.medianClosing ? "text-success" : "text-danger")}>{t.medianClosing <= tPrev.medianClosing ? "▼" : "▲"} {Math.abs(t.medianClosing - tPrev.medianClosing).toFixed(2)}</span> : null}
            </dd>
          </div>
        </dl>
      </AuroraHeader>

      {join ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-success/30 bg-card px-4 py-3 text-sm">
          <span className="font-semibold text-heading">Joining is in for this last list:</span>
          <span className="text-success">{fmt([...join.values()].filter((s) => s === "joined").length)} joined</span>
          <span className="text-amber">{fmt([...join.values()].filter((s) => s === "pending").length)} pending</span>
          <span className="text-danger">{fmt([...join.values()].filter((s) => s === "not_joined").length)} did not join</span>
          <span className="flex-1" />
          <Link href={`/portal/history/${induction}/joining`} className="font-semibold text-signal hover:underline">Wasted seats →</Link>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented label="View" items={[
          { href: keep({ tab: "", cp: "" }).replace(/([?&])tab=closing&?/, "$1").replace(/[?&]$/, ""), label: "Candidates", active: tab === "candidates" },
          { href: keep({ tab: "closing", cp: "" }), label: "Closing by seat", active: tab === "closing" },
          { href: `/portal/candidates?i=${induction}`, label: "Gazette" },
        ]} />
        <div className="flex flex-wrap gap-2 text-sm">
          {prevNo ? <Link href={`/portal/history/${induction}/compare?from=${prevNo}&to=${roundNo}`} className="mn-btn-ghost inline-flex h-9 items-center gap-1.5 rounded-lg px-3"><Icon name="trend" className="h-4 w-4" />Compare with R{prevNo}</Link> : null}
          <Link href={`/portal/finder?induction=${induction}`} className="mn-btn-ghost inline-flex h-9 items-center gap-1.5 rounded-lg px-3"><Icon name="target" className="h-4 w-4" />Score finder</Link>
          <Link href="#room" className="mn-btn-ghost inline-flex h-9 items-center gap-1.5 rounded-lg px-3"><Icon name="chat" className="h-4 w-4" />{running_ ? "Round room (live)" : "Round room"}</Link>
        </div>
      </div>

      <Card className="lg:sticky lg:top-0 lg:z-20">
        <form method="get" action={base} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_repeat(4,minmax(0,1fr))_auto] xl:items-end">
          {tab === "closing" ? <input type="hidden" name="tab" value="closing" /> : null}
          <label className="grid gap-1.5 text-sm font-medium">Search
            <input name="q" defaultValue={q} placeholder="Name, PMDC or ID" className={selectClass} />
          </label>
          {FILTERS.map(([k, label]) => (
            <label key={k} className="grid gap-1.5 text-sm font-medium">{label}
              <select name={k} defaultValue={filters[k] ?? ""} className={selectClass}>
                <option value="">All</option>
                {(facets[k] as string[]).map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
          ))}
          <div className="flex gap-2">
            <button type="submit" className="mn-btn h-10 rounded-lg px-4 text-sm font-semibold">Show</button>
            {filtered || q ? <Link href={tab === "closing" ? `${base}?tab=closing` : base} className="mn-btn-ghost inline-flex h-10 items-center rounded-lg px-3 text-sm">Clear</Link> : null}
          </div>
        </form>
      </Card>

      {tab === "candidates" ? (
        <Candidates db={db} session={session} roundId={round.id} prevId={prev?.id ?? null} prevNo={prevNo ?? null} filters={filters} q={q} cpage={cpage} keep={keep}
          join={join} hasConsent={hasConsent} picked={picked} induction={induction} roundNo={roundNo} running={running_} inductionRounds={ind.rounds.map((r) => r.roundNo)} />
      ) : (
        <Closing db={db} session={session} induction={induction} roundNo={roundNo} roundId={round.id} prevId={prev?.id ?? null} prevNo={prevNo ?? null} filters={filters} running={running_} base={base} />
      )}

      {running_ ? <RoundRoomPanel induction={induction} roundNo={roundNo} live /> : <RoundRoomPanel induction={induction} roundNo={roundNo} live={false} />}
      <DiscussionPanel topic={{ kind: "round", key: `${induction}:${roundNo}` }} label={`round ${roundNo} of induction ${induction}`} />
    </AreaPage>
  );
}

type Db = ReturnType<typeof getDb>;
type S = Awaited<ReturnType<typeof getSession>>;

async function Candidates({ db, session, roundId, prevId, prevNo, filters, q, cpage, keep, join, hasConsent, picked, induction, roundNo, running, inductionRounds }: {
  db: Db; session: S; roundId: number; prevId: number | null; prevNo: number | null; filters: RoundFilters; q: string; cpage: number;
  keep: (x: Record<string, string>) => string; join: Awaited<ReturnType<typeof roundJoinStates>>; hasConsent: boolean; picked: string;
  induction: number; roundNo: number; running: boolean; inductionRounds: number[];
}) {
  const cands = await roundCandidates(db, session, { roundId, filters, q, offset: (cpage - 1) * PAGE, limit: PAGE });
  const before = prevId ? await seatsInRound(db, session, { roundId: prevId, applicantIds: cands.rows.map((r) => r.applicantId) }) : null;
  const panel = picked ? await gazetteCandidate(db, session, { induction, applicantId: picked }) : null;
  const pickedRow = picked
    ? cands.rows.find((r) => r.applicantId === picked) ?? (await roundCandidates(db, session, { roundId, q: picked, limit: 5 })).rows.find((r) => r.applicantId === picked) ?? null
    : null;
  const pages = Math.max(1, Math.ceil(cands.total / PAGE));
  const vs = (r: (typeof cands.rows)[number]) => {
    if (!before) return null;
    const b = before.get(`${r.applicantId}|${r.program}`);
    if (!b) return <Pill tone="info">New</Pill>;
    if (b.speciality === r.speciality && b.hospital === r.hospital) return <span className="text-xs text-muted">Same seat</span>;
    return <Pill tone={r.preferenceNo && b.preferenceNo && r.preferenceNo < b.preferenceNo ? "success" : "amber"}>{r.preferenceNo && b.preferenceNo && r.preferenceNo < b.preferenceNo ? "▲" : "↔"} from #{b.preferenceNo || "?"}</Pill>;
  };
  return (
    <div className={cn("grid gap-5", picked ? "xl:grid-cols-[minmax(0,1fr)_22rem]" : "")}>
      <Card id="candidates">
        <CardHeader title={`${fmt(cands.total)} allocation${cands.total === 1 ? "" : "s"}${Object.values(filters).some(Boolean) || q ? " match" : ""}`} description="Best marks first. Names, PMDC numbers and applicant IDs as PHF publishes them. Select someone for every round and their preferences." />
        {cands.rows.length === 0 ? <EmptyState title="Nobody matches">Clear the search or a filter.</EmptyState> : (
          <div className="-mx-5 overflow-x-auto sm:-mx-6">
            <table className="w-full min-w-[42rem] text-sm">
              <thead className="text-left text-xs text-subtle">
                <tr>
                  <th className="px-5 py-2 font-medium sm:px-6">#</th><th className="px-2 py-2 font-medium">Candidate</th><th className="px-2 py-2 text-right font-medium">Marks</th>
                  <th className="px-2 py-2 font-medium">Seat</th><th className="px-2 py-2 font-medium">{join ? "Joining" : hasConsent ? "Consent" : ""}</th>
                  <th className="px-2 py-2 pr-5 font-medium sm:pr-6">{prevNo ? `vs R${prevNo}` : ""}</th>
                </tr>
              </thead>
              <tbody>
                {cands.rows.map((r, i) => {
                  const js = join?.get(joinKey(r.applicantId, r.program));
                  const tone = consentTone(r.consent);
                  return (
                    <tr key={r.rowNo} className={cn("border-t border-line hover:bg-hover/50", r.applicantId === picked && "bg-[var(--mn-violet-fill)] shadow-[inset_3px_0_0_var(--mn-violet-soft)]")}>
                      <td className="px-5 py-2 font-mono text-xs text-muted sm:px-6">{(cpage - 1) * PAGE + i + 1}</td>
                      <td className="px-2 py-2">
                        <Link href={keep({ c: r.applicantId })} scroll={false} className="flex items-center gap-2.5">
                          <span aria-hidden className="grid h-8 w-8 flex-none place-items-center rounded-full bg-[var(--mn-violet-fill)] text-[0.7rem] font-semibold text-violet-pale">{initials(r.name, r.applicantId)}</span>
                          <span className="min-w-0"><span className="block truncate font-medium text-heading hover:text-violet-pale">{r.name ?? "Name not published"}</span><span className="block font-mono text-xs text-muted">{r.applicantId}{r.pmdcNo ? ` · ${r.pmdcNo}` : ""}</span></span>
                        </Link>
                      </td>
                      <td className="px-2 py-2 text-right font-mono tabular-nums">{formatMarks(r.marks)}</td>
                      <td className="max-w-64 px-2 py-2"><span className="block truncate" title={`${r.speciality} · ${r.hospital}`}>{r.speciality} · {r.hospital.split(",")[0]}</span><span className="block text-xs text-muted">{r.program} · {r.quota} · pref #{r.preferenceNo || "—"}</span></td>
                      <td className="px-2 py-2">{js ? <JoinPill state={js} /> : tone ? <Pill tone={tone}>{r.consent === "Not Avail" ? "Not available" : r.consent}</Pill> : null}</td>
                      <td className="px-2 py-2 pr-5 sm:pr-6">{vs(r)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 ? (
          <nav aria-label="Pages" className="mt-4 flex items-center justify-between text-sm">
            {cpage > 1 ? <Link href={keep({ cp: String(cpage - 1) })} className="mn-btn-ghost rounded-lg px-3 py-1.5">‹ Previous</Link> : <span />}
            <span className="text-muted">{fmt((cpage - 1) * PAGE + 1)}–{fmt(Math.min(cpage * PAGE, cands.total))} of {fmt(cands.total)}</span>
            {cpage < pages ? <Link href={keep({ cp: String(cpage + 1) })} className="mn-btn-ghost rounded-lg px-3 py-1.5">Next ›</Link> : <span />}
          </nav>
        ) : null}
      </Card>

      {picked ? (
        <aside aria-label="Candidate" className="mn-card-glass grid min-w-0 content-start gap-4 self-start overflow-hidden rounded-2xl [&>*]:min-w-0 border border-violet-soft/40 p-5 shadow-[0_0_30px_var(--mn-violet-glow)] xl:sticky xl:top-28">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span aria-hidden className="grid h-11 w-11 place-items-center rounded-full bg-[var(--mn-violet-fill)] text-sm font-semibold text-violet-pale">{initials(panel?.name ?? pickedRow?.name ?? null, picked)}</span>
              <div><p className="font-semibold text-heading">{panel?.name ?? pickedRow?.name ?? `Applicant ${picked}`}</p><p className="font-mono text-xs text-muted">{picked}{(panel?.pmdcNo ?? pickedRow?.pmdcNo) ? ` · PMDC ${panel?.pmdcNo ?? pickedRow?.pmdcNo}` : ""}</p></div>
            </div>
            <Link href={keep({ c: "" })} scroll={false} aria-label="Close" className="mn-btn-ghost grid h-9 w-9 place-items-center rounded-lg"><Icon name="close" className="h-4 w-4" /></Link>
          </div>
          {pickedRow ? <p className="text-sm"><span className="text-muted">Marks </span><span className="font-mono text-lg font-semibold text-heading">{formatMarks(pickedRow.marks)}</span></p> : null}
          {panel ? (
            <>
              <div>
                <p className="mb-1.5 text-sm font-semibold text-heading">Every round</p>
                <ol className="grid grid-flow-col auto-cols-fr gap-1">
                  {[...inductionRounds, ...(running ? [inductionRounds.length + 1] : [])].map((n) => {
                    const r = panel.rounds.find((x) => x.roundNo === n);
                    const last = panel.rounds.find((x) => x.roundNo === roundNo);
                    const next = running && n === inductionRounds.length + 1;
                    return (
                      <li key={n} className="grid gap-1 text-center" title={r ? `${r.speciality} · ${r.hospital}` : next ? "Next round" : "Not on this list"}>
                        <span className={cn("h-4 rounded", next ? "border border-dashed border-line-strong" : !r ? "bg-danger/70" : last && r.speciality === last.speciality && r.hospital === last.hospital ? "bg-success" : "bg-amber/80")} />
                        <span className="text-[0.65rem] text-muted">{r?.preferenceNo ? `#${r.preferenceNo}` : `R${n}`}</span>
                      </li>
                    );
                  })}
                </ol>
              </div>
              <div>
                <p className="mb-1.5 flex justify-between text-sm font-semibold text-heading">Preferences on the portal <span className="text-xs font-normal text-muted">{panel.programmes.reduce((n, p) => n + p.preferences.length, 0)} total</span></p>
                <ol className="grid gap-1.5">
                  {(() => {
                    const prog = panel.programmes.find((p) => pickedRow && p.program.toLowerCase() === pickedRow.program.toLowerCase() && p.preferences.length) ?? panel.programmes.find((p) => p.preferences.length);
                    return prog ? [...prog.preferences].sort((a, b) => a.preferenceNo - b.preferenceNo).slice(0, 8).map((x) => ({ ...x, program: prog.program })) : [];
                  })().map((x) => {
                    const seat = pickedRow && x.program.toLowerCase() === pickedRow.program.toLowerCase() && x.preferenceNo === pickedRow.preferenceNo;
                    const above = pickedRow && x.program.toLowerCase() === pickedRow.program.toLowerCase() && pickedRow.preferenceNo && x.preferenceNo < pickedRow.preferenceNo;
                    return (
                      <li key={`${x.program}-${x.preferenceNo}`} className={cn("flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs", seat ? "border-success/50 bg-success/10" : above ? "border-danger/25 bg-danger/5" : "border-line")}>
                        <span className="w-7 font-mono text-muted">#{x.preferenceNo}</span>
                        <span className="min-w-0 flex-1 truncate"><span className="text-ink">{x.speciality}</span> <span className="text-muted">· {x.hospital.split(",")[0]}</span></span>
                        {seat ? <Pill tone="success">Seat</Pill> : above ? <span className="text-danger">missed</span> : null}
                      </li>
                    );
                  })}
                </ol>
              </div>
            </>
          ) : <p className="text-sm text-muted">Preferences and every round show when the induction&apos;s portal data is in.</p>}
          <Link href={`/portal/simulation?i=${induction}`} className="mn-btn inline-flex h-10 items-center justify-center rounded-lg text-sm font-semibold">What if they reject? →</Link>
        </aside>
      ) : null}
    </div>
  );
}

async function Closing({ db, session, induction, roundNo, roundId, prevId, prevNo, filters, running, base }: {
  db: Db; session: S; induction: number; roundNo: number; roundId: number; prevId: number | null; prevNo: number | null; filters: RoundFilters; running: boolean; base: string;
}) {
  const [groups, back, fwd, check] = await Promise.all([
    roundGroups(db, session, roundId, prevId, filters),
    prevNo ? predictRound(db, session, { induction, fromRound: prevNo }) : Promise.resolve(null),
    running ? predictRound(db, session, { induction, fromRound: roundNo }) : Promise.resolve(null),
    running ? Promise.resolve(null) : methodCheck(db, session, { induction }),
  ]);
  const gkey = (g: { program: string; quota: string; speciality: string; hospital: string }) => `${g.program}|${g.quota}|${g.speciality}|${g.hospital}`;
  const bySpec = new Map<string, number>();
  for (const g of groups) bySpec.set(g.speciality, (bySpec.get(g.speciality) ?? 0) + g.allocations);
  const topSpecs = [...bySpec].sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (!groups.length) return <EmptyState title="No allocations match these filters" />;
  return (
    <>
      <Card>
        <CardHeader title="Closing merit by seat" description={groups.length > LIMIT ? `Showing the first ${LIMIT}; filter to narrow down.` : "The lowest marks placed in each programme, quota, speciality and hospital."} />
        <DataTable
          caption="Closing merit by programme, quota, speciality and hospital"
          rows={groups.slice(0, LIMIT)}
          rowKey={gkey}
          columns={[
            { key: "s", header: "Speciality", sort: (g) => g.speciality, cell: (g) => <EntityLink kind="speciality" id={g.specialityId} name={g.speciality} /> },
            { key: "h", header: "Hospital", tone: "muted", sort: (g) => g.hospital, cell: (g) => <EntityLink kind="hospital" id={g.hospitalId} name={g.hospital} /> },
            { key: "pq", header: "Programme · quota", tone: "muted", sort: (g) => `${g.program} ${g.quota}`, cell: (g) => `${g.program} · ${g.quota}` },
            { key: "n", header: "Placed", align: "right", sort: (g) => g.allocations, cell: (g) => g.allocations },
            { key: "c", header: "Closing", align: "right", tone: "mono", sort: (g) => g.closing, cell: (g) => formatMarks(g.closing) },
            { key: "d", header: `vs R${prevNo ?? "–"}`, align: "right", sort: (g) => (g.prevClosing == null || g.closing == null ? null : g.closing - g.prevClosing), cell: (g) => (prevNo ? <MeritDelta value={g.prevClosing == null ? null : (g.closing ?? 0) - g.prevClosing} /> : <span className="text-subtle">—</span>) },
            ...(back ? [{ key: "pb", header: <span title="The range this method gave from the round before.">Predicted from R{prevNo}</span>, align: "right" as const, cell: (g: (typeof groups)[number]) => { const b = back.hospitals.get(gkey(g)); return b ? <PredictionBadge {...b} compact /> : <span className="text-subtle">—</span>; } }] : []),
            ...(fwd ? [{ key: "pf", header: <span title="Estimated closing merit for the next round. Not official.">Likely R{roundNo + 1}</span>, align: "right" as const, cell: (g: (typeof groups)[number]) => { const b = fwd.hospitals.get(gkey(g)); return b ? <PredictionBadge {...b} /> : <span className="text-subtle">—</span>; } }] : []),
            {
              key: "ask", header: <span className="sr-only">Ask</span>, align: "right",
              cell: (g) => (
                <Link href={`/portal/community/new?${new URLSearchParams({ topic: `round|${induction}:${roundNo}`, snippet: snippetParam({ induction, round: roundNo, program: g.program, quota: g.quota, speciality: g.speciality, hospital: g.hospital }) })}`} className="whitespace-nowrap text-xs font-semibold text-signal hover:underline" aria-label={`Ask about ${g.speciality} at ${g.hospital}`}>Ask</Link>
              ),
            },
          ]}
        />
      </Card>
      {filters.speciality ? null : (
        <Card>
          <CardHeader title="Most placed" description="Select a speciality to filter by it." />
          <BarList items={topSpecs.map(([label, value]) => ({ label, value, href: `${base}?tab=closing&speciality=${encodeURIComponent(label)}` }))} />
          <ChartSource tone="official" source={`PHF merit list, induction ${induction} round ${roundNo}`} induction={induction} />
        </Card>
      )}
      {back || fwd ? (
        <Card>
          <CardHeader title={fwd ? `Likely closing merit in round ${roundNo + 1}` : "How the predictions did"} description={fwd ? "Ranges, not single numbers." : `Each range was made from round ${prevNo}. ✓ marks a closing that fell inside.`} />
          <MethodNote share={check?.share ?? null} n={check?.n ?? 0} induction={check ? induction : null} />
        </Card>
      ) : null}
    </>
  );
}
