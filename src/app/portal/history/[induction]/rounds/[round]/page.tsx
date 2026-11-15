import Link from "next/link";
import { notFound } from "next/navigation";
import { AreaPage } from "@/components/area-page";
import { BarList } from "@/components/charts/bar-list";
import { ChartSource } from "@/components/charts/chart-source";
import { MethodNote, PredictionBadge } from "@/components/charts/prediction-badge";
import { DiscussionPanel } from "@/components/community/discussion-panel";
import { EntityLink } from "@/components/entity-link";
import { MeritDelta } from "@/components/merit-delta";
import { RoundRoomPanel } from "@/components/rooms/round-room-panel";
import { AuroraHeader } from "@/components/ui/aurora-header";
import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { DataTable } from "@/components/ui/data-table";
import { getSession } from "@/lib/auth/session";
import { myMerit } from "@/lib/data/candidates";
import { inductionTracks } from "@/lib/data/insights";
import { roundJoinStates } from "@/lib/data/joining";
import { getRound, inductionMaxMarks, inductionTimeline, listInductionsWithRounds, marksStanding, roundCandidates, roundFacets, roundGroups, seatsInRound, type RoundFilters } from "@/lib/data/merit";
import { inductionRunning, methodCheck, predictRound } from "@/lib/data/predictions";
import { gazetteCandidate, publishedEstimates } from "@/lib/data/simulation";
import { getDb } from "@/lib/db/client";
import { snippetParam } from "@/lib/domain/community";
import { JOIN_LABELS, joinKey } from "@/lib/domain/joining";
import { formatMarks } from "@/lib/format";
import { intParam, oneOf } from "@/lib/params";

export const metadata = { title: "Merit round" };
export const dynamic = "force-dynamic";

const LIMIT = 400;
const PAGE = 50;
const IV = "text-[#F3EEE5]/[.68]";
const fmt = (n: number) => n.toLocaleString("en-US");
const AV = ["#5B3FF5", "#176B67", "#8C5426", "#263C4D", "#7B3F7A", "#3A3A42"];
const avColor = (id: string) => AV[[...id].reduce((s, c) => s + c.charCodeAt(0), 0) % AV.length]!;
const initials = (name: string | null, id: string) => (name ? name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") : id.slice(-2));
const shortSeat = (s: string, h: string) => `${s} · ${h.split(",")[0]}`;

/** One published round (docs/mockups/v4/Round.dc.html): who got which seat, consent, what changed, and one person's record. */
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
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const tab = str("tab") === "closing" ? "closing" : "candidates";
  const [facets, tracks, all] = await Promise.all([roundFacets(db, session, round.id), inductionTracks(db, session, induction), listInductionsWithRounds(db, session)]);
  const track = tracks.find((t) => t.value === str("track"))?.value ?? "";
  const filters: RoundFilters = {
    program: track ? track.split("|")[0] : oneOf(sp.program, facets.program),
    quota: track ? track.split("|")[1] : oneOf(sp.quota, facets.quota),
    speciality: oneOf(sp.speciality, facets.speciality),
    hospital: oneOf(sp.hospital, facets.hospital),
  };
  const ind = all.find((i) => i.id === induction)!;
  const prevNo = ind.rounds.filter((r) => r.roundNo < roundNo).at(-1)?.roundNo ?? null;
  const nextNo = ind.rounds.find((r) => r.roundNo > roundNo)?.roundNo ?? null;
  const prev = prevNo ? await getRound(db, session, induction, prevNo) : null;
  const base = `/portal/history/${induction}/rounds/${roundNo}`;
  const q = str("q").replace(/\s+/g, " ").trim().slice(0, 60);
  const cpage = Math.max(intParam(str("cp") || undefined) ?? 1, 1);
  const picked = str("c").replace(/\D/g, "").slice(0, 10);

  const [timeline, maxMarks, runningNow, estimates, join] = await Promise.all([
    inductionTimeline(db, session, induction), inductionMaxMarks(db), inductionRunning(db, induction),
    publishedEstimates(db, session, { induction }), nextNo ? Promise.resolve(null) : roundJoinStates(db, session, induction, roundNo),
  ]);
  const running = !nextNo && runningNow;
  const max = maxMarks[induction];
  const t = timeline.find((x) => x.roundNo === roundNo);
  const tPrev = prevNo ? timeline.find((x) => x.roundNo === prevNo) : null;
  const est = estimates.find((e) => !e.official && e.roundNo === roundNo + 1);
  const hasConsent = Boolean(t && t.accepted + t.rejected + t.notAvail > 0);
  const accepted = hasConsent ? Math.round((t!.accepted / t!.allocations) * 100) : null;

  const keep = (extra: Record<string, string>) => {
    const u = new URLSearchParams();
    if (track) u.set("track", track);
    else { if (filters.program) u.set("program", filters.program); if (filters.quota) u.set("quota", filters.quota); }
    if (filters.speciality) u.set("speciality", filters.speciality);
    if (filters.hospital) u.set("hospital", filters.hospital);
    if (q) u.set("q", q);
    if (tab === "closing") u.set("tab", "closing");
    for (const [k, v] of Object.entries(extra)) if (v) u.set(k, v); else u.delete(k);
    const s = u.toString();
    return `${base}${s ? `?${s}` : ""}`;
  };
  const header = <TableHeader tab={tab} keep={keep} induction={induction} q={q} track={track} tracks={tracks} speciality={filters.speciality ?? ""} specialities={facets.speciality as string[]} base={base} />;

  return (
    <AreaPage area="portal" trail={[{ label: "Merit lists", href: "/portal/history" }, { label: `Induction ${induction}`, href: `/portal/history/${induction}` }, { label: `Round ${roundNo}` }]} title={`Round ${roundNo}`} bare>
      <AuroraHeader as="section" className="grid gap-4 px-5 py-[22px] sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className={cn("text-[13px]", IV)}>
              <Link href="/portal/history" className="text-[#F3EEE5]/70 hover:underline">Merit lists</Link> / <Link href={`/portal/history/${induction}`} className="text-[#F3EEE5]/70 hover:underline">Induction {induction}</Link> · {round.cycleName}
            </p>
            <h1 className="mt-1.5 text-[2rem] font-bold tracking-[-0.03em]">Round {roundNo} <span className={cn("text-base font-medium", IV)}>{max ? `· out of ${max} ` : ""}· official</span></h1>
          </div>
          <nav aria-label="Rounds" className="mn-seg mn-seg-iv max-w-full overflow-x-auto">
            {ind.rounds.map((r) => (
              <Link key={r.roundNo} href={`/portal/history/${induction}/rounds/${r.roundNo}`} aria-current={r.roundNo === roundNo ? "page" : undefined}>R{r.roundNo}</Link>
            ))}
            {est ? <Link href={`/portal/estimates?run=${est.id}`} className="border border-dashed border-[rgba(229,160,75,.6)] !text-[#E5A04B]">R{est.roundNo} est.</Link> : null}
          </nav>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="mn-glass"><p className={cn("text-xs", IV)}>Allocations</p><p className="mt-1 text-2xl font-bold tabular-nums">{fmt(round.allocations)}</p></div>
          <div className="mn-glass flex items-center gap-3">
            {accepted != null ? (
              <>
                <svg role="img" aria-label={`${accepted} percent accepted`} width="52" height="52" viewBox="0 0 52 52" className="flex-none"><circle cx="26" cy="26" r="20" fill="none" stroke="rgba(243,238,229,0.15)" strokeWidth="7" /><circle cx="26" cy="26" r="20" fill="none" stroke="#3DDC97" strokeWidth="7" strokeLinecap="round" pathLength="100" strokeDasharray={`${accepted} 100`} transform="rotate(-90 26 26)" style={{ filter: "drop-shadow(0 0 6px rgba(61,220,151,0.6))" }} /></svg>
                <div><p className={cn("text-xs", IV)}>Accepted</p><p className="text-2xl font-bold">{accepted}%</p></div>
              </>
            ) : <div><p className={cn("text-xs", IV)}>Candidates</p><p className="mt-1 text-2xl font-bold tabular-nums">{t ? fmt(t.applicants) : "—"}</p></div>}
          </div>
          <div className="mn-glass">
            {hasConsent ? <><p className={cn("text-xs", IV)}>Seats freed for R{roundNo + 1}</p><p className="mt-1 text-2xl font-bold tabular-nums text-[#FF9A8A]">{fmt(t!.rejected + t!.notAvail)}</p></>
              : join ? <><p className={cn("text-xs", IV)}>Did not join</p><p className="mt-1 text-2xl font-bold tabular-nums text-[#FF9A8A]">{fmt([...join.values()].filter((s) => s === "not_joined").length)}</p></>
              : <><p className={cn("text-xs", IV)}>Round</p><p className="mt-1 text-2xl font-bold">{nextNo ? "superseded" : running ? "latest" : "final"}</p></>}
          </div>
          <div className="mn-glass">
            <p className={cn("text-xs", IV)}>{tPrev ? `Median vs R${tPrev.roundNo}` : "Median closing"}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{t?.medianClosing != null ? formatMarks(t.medianClosing) : "—"}
              {t?.medianClosing != null && tPrev?.medianClosing != null ? <span className={cn("ml-1.5 text-[13px]", t.medianClosing <= tPrev.medianClosing ? "text-[#3DDC97]" : "text-[#FF7A7A]")}>{t.medianClosing <= tPrev.medianClosing ? "▼" : "▲"} {Math.abs(t.medianClosing - tPrev.medianClosing).toFixed(2)}</span> : null}
            </p>
          </div>
        </div>
      </AuroraHeader>

      {join ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[rgba(61,220,151,.3)] bg-[rgba(23,23,28,.82)] px-4 py-3 text-[13px]">
          <span className="font-semibold text-heading">Joining is in for this last list:</span>
          <span className="mn-pill g">{fmt([...join.values()].filter((s) => s === "joined").length)} joined</span>
          <span className="mn-pill a">{fmt([...join.values()].filter((s) => s === "pending").length)} pending</span>
          <span className="mn-pill r">{fmt([...join.values()].filter((s) => s === "not_joined").length)} did not join</span>
          <span className="flex-1" />
          <Link href={`/portal/history/${induction}/joining`} className="mn-ob">Wasted seats →</Link>
        </div>
      ) : null}

      {tab === "candidates" ? (
        <Candidates db={db} session={session} roundId={round.id} prevId={prev?.id ?? null} prevNo={prevNo} filters={filters} q={q} cpage={cpage} keep={keep}
          join={join} hasConsent={hasConsent} picked={picked} induction={induction} roundNo={roundNo} running={running} inductionRounds={ind.rounds.map((r) => r.roundNo)} header={header} />
      ) : (
        <Closing db={db} session={session} induction={induction} roundNo={roundNo} roundId={round.id} prevId={prev?.id ?? null} prevNo={prevNo} filters={filters} running={running} base={base} header={header} />
      )}

      <div className="flex flex-wrap gap-2">
        {prevNo ? <Link href={`/portal/history/${induction}/compare?from=${prevNo}&to=${roundNo}`} className="mn-ob">Compare with R{prevNo}</Link> : null}
        <Link href={`/portal/finder?induction=${induction}`} className="mn-ob">Score finder</Link>
      </div>
      <RoundRoomPanel induction={induction} roundNo={roundNo} live={running} />
      <DiscussionPanel topic={{ kind: "round", key: `${induction}:${roundNo}` }} label={`round ${roundNo} of induction ${induction}`} />
    </AreaPage>
  );
}

/** Tabs on the left, search and the two filters on the right (one form, no labels, as in the mockup). */
function TableHeader({ tab, keep, induction, q, track, tracks, speciality, specialities, base }: {
  tab: "candidates" | "closing"; keep: (x: Record<string, string>) => string; induction: number; q: string; track: string;
  tracks: { value: string; label: string }[]; speciality: string; specialities: string[]; base: string;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-2.5 p-3.5">
      <nav aria-label="View" className="mn-seg">
        <Link href={keep({ tab: "", cp: "", c: "" })} aria-current={tab === "candidates" ? "page" : undefined}>Candidates</Link>
        <Link href={keep({ tab: "closing", cp: "", c: "" })} aria-current={tab === "closing" ? "page" : undefined}>Closing by seat</Link>
        <Link href={`/portal/candidates?i=${induction}`}>Gazette</Link>
      </nav>
      <form method="get" action={base} className="flex flex-wrap items-center gap-2">
        {tab === "closing" ? <input type="hidden" name="tab" value="closing" /> : null}
        <label className="mn-inp">
          <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input name="q" defaultValue={q} aria-label="Name, PMDC or ID" placeholder="Name, PMDC or ID" />
        </label>
        <select name="track" defaultValue={track} aria-label="Programme and quota" className="mn-sel w-40">
          <option value="">All programmes</option>
          {tracks.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
        </select>
        <select name="speciality" defaultValue={speciality} aria-label="Speciality" className="mn-sel w-44">
          <option value="">All specialities</option>
          {specialities.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <button type="submit" className="mn-ob h-9">Show</button>
      </form>
    </header>
  );
}

type Db = ReturnType<typeof getDb>;
type S = Awaited<ReturnType<typeof getSession>>;

async function Candidates({ db, session, roundId, prevId, prevNo, filters, q, cpage, keep, join, hasConsent, picked, induction, roundNo, running, inductionRounds, header }: {
  db: Db; session: S; roundId: number; prevId: number | null; prevNo: number | null; filters: RoundFilters; q: string; cpage: number;
  keep: (x: Record<string, string>) => string; join: Awaited<ReturnType<typeof roundJoinStates>>; hasConsent: boolean; picked: string;
  induction: number; roundNo: number; running: boolean; inductionRounds: number[]; header: React.ReactNode;
}) {
  const [cands, mine] = await Promise.all([roundCandidates(db, session, { roundId, filters, q, offset: (cpage - 1) * PAGE, limit: PAGE }), myMerit(db, session).catch(() => null)]);
  const before = prevId ? await seatsInRound(db, session, { roundId: prevId, applicantIds: cands.rows.map((r) => r.applicantId) }) : null;
  const pickedRow = picked
    ? cands.rows.find((r) => r.applicantId === picked) ?? (await roundCandidates(db, session, { roundId, q: picked, limit: 5 })).rows.find((r) => r.applicantId === picked) ?? null
    : null;
  const [panel, standing] = await Promise.all([
    picked ? gazetteCandidate(db, session, { induction, applicantId: picked }) : null,
    pickedRow ? marksStanding(db, session, { induction, roundNo, program: pickedRow.program, marks: pickedRow.marks }) : null,
  ]);
  const pages = Math.max(1, Math.ceil(cands.total / PAGE));
  const from = (cpage - 1) * PAGE + 1, to = Math.min(cpage * PAGE, cands.total);
  const pageNos = [...new Set([1, cpage - 1, cpage, cpage + 1, pages])].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const filterText = [filters.speciality, filters.program, filters.quota].filter(Boolean).join(" · ");
  const strip = [...inductionRounds, ...(running ? [inductionRounds.length + 1] : [])];
  const consent = (c: string | null) => (c === "Accepted" ? <span className="mn-pill g">Accepted</span> : c === "Rejected" ? <span className="mn-pill r">Rejected</span> : c === "Not Avail" ? <span className="mn-pill n">Not available</span> : c ? <span className="mn-pill a">{c}</span> : null);
  const vs = (r: (typeof cands.rows)[number]) => {
    if (!before) return null;
    const b = before.get(`${r.applicantId}|${r.program}`);
    if (!b) return <span className="mn-pill c">New</span>;
    if (b.speciality === r.speciality && b.hospital === r.hospital) return <span className="whitespace-nowrap text-muted">Same seat</span>;
    const up = r.preferenceNo && b.preferenceNo && r.preferenceNo < b.preferenceNo;
    return <span className={cn("mn-pill", up ? "g" : "a")}>{up ? "▲" : "↔"} from #{b.preferenceNo || "?"}</span>;
  };
  const prog = panel?.programmes.find((x) => pickedRow && x.program.toLowerCase() === pickedRow.program.toLowerCase() && x.preferences.length) ?? panel?.programmes.find((x) => x.preferences.length);
  const prefs = prog ? [...prog.preferences].sort((a, b) => a.preferenceNo - b.preferenceNo).slice(0, 6) : [];
  const who = panel?.name ?? pickedRow?.name ?? null;
  return (
    <div className="flex flex-col items-start gap-4 xl:flex-row">
      <section aria-label="List" id="candidates" className="mn-card-glass w-full min-w-0 flex-1 overflow-hidden rounded-[20px] border border-line">
        {header}
        <div className="overflow-x-auto">
          <table className="mn-tbl min-w-[44rem]">
            <thead><tr><th scope="col">#</th><th scope="col">Candidate</th><th scope="col" className="!text-right">Marks</th><th scope="col">Seat</th><th scope="col">{join ? "Joining" : hasConsent ? "Consent" : ""}</th><th scope="col">{prevNo ? `vs R${prevNo}` : ""}</th></tr></thead>
            <tbody>
              {cands.rows.map((r, i) => {
                const js = join?.get(joinKey(r.applicantId, r.program));
                const you = mine?.applicantId === r.applicantId;
                return (
                  <tr key={r.rowNo} className={cn(r.applicantId === picked ? "!bg-[rgba(110,86,255,.12)] shadow-[inset_3px_0_0_#7B61FF]" : you && "bg-[rgba(155,135,255,.06)]")}>
                    <td className="text-muted">{from + i}</td>
                    <td>
                      <Link href={keep({ c: r.applicantId })} scroll={false} className="flex items-center gap-2.5">
                        <span aria-hidden className="mn-av" style={you ? { background: "linear-gradient(135deg,#8B73FF,#5B3FF5)", boxShadow: "0 0 12px rgba(110,86,255,.6)" } : { background: avColor(r.applicantId) }}>{initials(r.name, r.applicantId)}</span>
                        <span className="min-w-0"><b className="text-ink">{r.name ?? "Name not published"}</b>{you ? <span className="mn-pill v ml-1.5">you</span> : null}<span className="block font-mono text-[11px] text-muted">{r.applicantId}{r.pmdcNo ? ` · ${r.pmdcNo}` : ""}</span></span>
                      </Link>
                    </td>
                    <td className="text-right font-mono">{formatMarks(r.marks)}</td>
                    <td className="max-w-64"><span className="block truncate" title={`${r.speciality} · ${r.hospital}`}>{shortSeat(r.speciality, r.hospital)}</span><span className="block text-[11px] text-muted">pref #{r.preferenceNo || "?"}</span></td>
                    <td>{js ? <span className={cn("mn-pill", js === "joined" ? "g" : js === "pending" ? "a" : "r")}>{JOIN_LABELS[js]}</span> : consent(r.consent)}</td>
                    <td>{vs(r)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {cands.rows.length === 0 ? <p className="px-4 py-8 text-center text-sm text-muted">Nobody matches. Clear the search or a filter.</p> : null}
        <footer className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-3 text-xs text-muted">
          <span>{cands.total ? `${fmt(from)}–${fmt(to)} of ${fmt(cands.total)}` : "0"}{filterText ? ` · ${filterText}` : ""}</span>
          {pages > 1 ? (
            <nav aria-label="Pages" className="flex gap-1">
              {cpage > 1 ? <Link href={keep({ cp: String(cpage - 1) })} aria-label="Previous" className="mn-page border border-white/10">‹</Link> : null}
              {pageNos.map((n) => <Link key={n} href={keep({ cp: String(n) })} aria-current={n === cpage ? "page" : undefined} className="mn-page">{n}</Link>)}
              {cpage < pages ? <Link href={keep({ cp: String(cpage + 1) })} aria-label="Next" className="mn-page border border-white/10">›</Link> : null}
            </nav>
          ) : null}
        </footer>
      </section>

      {picked ? (
        <aside aria-label="Candidate detail" className="mn-card-glass grid w-full min-w-0 flex-none content-start gap-4 overflow-hidden rounded-[20px] [&>*]:min-w-0 border border-[rgba(155,135,255,.35)] p-5 shadow-[0_0_40px_rgba(110,86,255,.15)] xl:sticky xl:top-6 xl:w-[330px]">
          <div className="flex items-center gap-3">
            <span aria-hidden className="mn-av !h-12 !w-12 !text-base" style={{ background: avColor(picked), boxShadow: "0 0 0 3px rgba(23,107,103,.4)" }}>{initials(who, picked)}</span>
            <div className="min-w-0 flex-1"><h2 className="truncate text-lg font-semibold text-heading">{who ?? `Applicant ${picked}`}</h2><p className="font-mono text-[11px] text-muted">{picked}{(panel?.pmdcNo ?? pickedRow?.pmdcNo) ? ` · PMDC ${panel?.pmdcNo ?? pickedRow?.pmdcNo}` : ""}</p></div>
            <Link href={keep({ c: "" })} scroll={false} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-[9px] border border-white/[.12] text-muted">✕</Link>
          </div>
          {pickedRow ? (
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-xl bg-white/[.03] p-3"><p className="text-[11px] text-muted">Marks</p><p className="mt-1 font-mono text-lg">{formatMarks(pickedRow.marks)}</p></div>
              <div className="rounded-xl bg-white/[.03] p-3"><p className="text-[11px] text-muted">Percentile</p><p className="mt-1 text-lg font-bold">{standing ? <>{standing.percentile}<span className="text-[11px] text-muted">th</span></> : "—"}</p></div>
            </div>
          ) : null}
          {panel ? (
            <>
              <div>
                <p className="mb-2 text-[13px] font-semibold">Every round</p>
                <div className="flex gap-[5px]">
                  {strip.map((n) => {
                    const r = panel.rounds.find((x) => x.roundNo === n);
                    const last = panel.rounds.find((x) => x.roundNo === roundNo);
                    const next = running && n === inductionRounds.length + 1;
                    const seat = r && last && r.speciality === last.speciality && r.hospital === last.hospital;
                    return <span key={n} title={r ? shortSeat(r.speciality, r.hospital) : next ? "Next round" : "Not on this list"} className={cn("h-[22px] flex-1 rounded-md", next ? "border border-dashed border-white/25" : !r ? "bg-[#FF7A7A]" : seat ? "bg-[#3DDC97] shadow-[0_0_12px_rgba(61,220,151,.5)]" : "bg-[#E5A04B]")} />;
                  })}
                </div>
                <div className="mt-1 flex justify-between text-[10px] text-muted">
                  {strip.map((n) => {
                    const r = panel.rounds.find((x) => x.roundNo === n);
                    return <span key={n} className={n === roundNo ? "text-[#3DDC97]" : undefined}>{r?.preferenceNo ? `#${r.preferenceNo}` : `R${n}`}</span>;
                  })}
                </div>
              </div>
              <div>
                <div className="flex items-baseline justify-between"><p className="mb-2 text-[13px] font-semibold">Preferences on the portal</p><span className="text-[10px] text-muted">{panel.programmes.reduce((n, x) => n + x.preferences.length, 0)} total</span></div>
                <div className="grid gap-1.5 [&>*]:min-w-0">
                  {prefs.map((x) => {
                    const seat = Boolean(pickedRow && x.preferenceNo === pickedRow.preferenceNo && x.speciality === pickedRow.speciality);
                    const above = Boolean(pickedRow && pickedRow.preferenceNo && x.preferenceNo < pickedRow.preferenceNo);
                    return (
                      <div key={x.preferenceNo} className={cn("mn-pref", seat ? "bg-[rgba(61,220,151,.10)] shadow-[inset_0_0_0_1px_rgba(61,220,151,.45),0_0_16px_rgba(61,220,151,.15)]" : above && "bg-[rgba(255,122,122,.08)]")}>
                        <span className={cn("font-mono", seat ? "text-[#3DDC97]" : "text-muted")}>#{x.preferenceNo}</span>
                        <span className={cn("min-w-0 flex-1 truncate", seat ? "font-semibold" : !above && "text-muted")}>{shortSeat(x.speciality, x.hospital)}</span>
                        {seat ? <span className="mn-pill g">Seat</span> : above ? <span className="text-[11px] text-[#FF7A7A]">missed</span> : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : <p className="text-sm text-muted">Preferences and every round show when the induction&apos;s portal data is in.</p>}
          <Link href={`/portal/simulation?i=${induction}`} className="mn-ob">What if {(who ?? "they").split(" ")[0]} rejects? →</Link>
        </aside>
      ) : null}
    </div>
  );
}

async function Closing({ db, session, induction, roundNo, roundId, prevId, prevNo, filters, running, base, header }: {
  db: Db; session: S; induction: number; roundNo: number; roundId: number; prevId: number | null; prevNo: number | null; filters: RoundFilters; running: boolean; base: string; header: React.ReactNode;
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
  return (
    <>
      <section aria-label="Closing by seat" className="mn-card-glass overflow-hidden rounded-[20px] border border-line">
        {header}
        <div className="px-3.5 pb-3.5">
          {groups.length ? (
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
                  cell: (g) => <Link href={`/portal/community/new?${new URLSearchParams({ topic: `round|${induction}:${roundNo}`, snippet: snippetParam({ induction, round: roundNo, program: g.program, quota: g.quota, speciality: g.speciality, hospital: g.hospital }) })}`} className="whitespace-nowrap text-xs font-semibold text-[#A797FF] hover:underline" aria-label={`Ask about ${g.speciality} at ${g.hospital}`}>Ask</Link>,
                },
              ]}
            />
          ) : <p className="py-8 text-center text-sm text-muted">No allocations match these filters.</p>}
        </div>
      </section>
      {filters.speciality || !groups.length ? null : (
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
