import Link from "next/link";
import type { ReactNode } from "react";
import { JoinPill } from "@/components/joining";
import { roundJoinStates } from "@/lib/data/joining";
import { joinKey, type JoinState } from "@/lib/domain/joining";
import { AreaPage } from "@/components/area-page";
import { whenDatabaseDown } from "@/components/database-unavailable";
import { AuroraHeader } from "@/components/ui/aurora-header";
import { AutoSelect } from "@/components/ui/auto-select";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { getSession } from "@/lib/auth/session";
import { verifiedApplicant } from "@/lib/data/candidates";
import { gazetteBoard, gazetteCandidate, gazetteInductions, type GazetteBoardRow } from "@/lib/data/simulation";
import { ensureUser } from "@/lib/data/users";
import { getDb } from "@/lib/db/client";
import { CORRECTION_KIND_LABELS, CORRECTION_LABELS, type CorrectionField, type CorrectionKind } from "@/lib/domain/corrections";
import { rankRows } from "@/lib/domain/gazette";
import { classifyQuery } from "@/lib/domain/merit-round";
import type { VerificationStep } from "@/lib/domain/sim-dataset";
import { formatMarks } from "@/lib/format";
import { findSection } from "@/lib/navigation";

export const metadata = { title: "Candidates" };
export const dynamic = "force-dynamic";

const PAGE = 100;
const TABS = { all: "All", running: "In the running", out: "Out of the running", corrected: "Corrected" } as const;
type Tab = keyof typeof TABS;
const CHIPS = {
  rescued: "Rescued by amendment",
  both: "Rejected at both steps",
  pending: "Still pending",
  marks: "Marks corrected",
  multi: "Applied in 2+ programmes",
  noprefs: "No preferences filed",
} as const;
type Chip = keyof typeof CHIPS;
const STEP_STATUS = { "": "Any", "1": "Accepted", "2": "Rejected", "11": "Pending", none: "Not needed" } as const;
const AVATAR = ["#5B3FF5", "#176B67", "#3A3A42", "#8C5426", "#263C4D", "#4A2F6B"];

type Sp = { i?: string; tab?: string; prog?: string; r1?: string; amend?: string; q?: string; chip?: string; page?: string; id?: string; marks?: string };

const step = (v: VerificationStep[], type: number) => v.find((s) => s.type === type) ?? null;
const R01 = 131, AMEND = 132;
const n = (v: number) => v.toLocaleString("en-US");
const initials = (s: string | null, id: string) => (s ? s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") : id.slice(-2));
const avatarOf = (id: string) => AVATAR[Number(id.replace(/\D/g, "").slice(-3) || 0) % AVATAR.length];
const short = (s: string) => s.replace(/\s*(Hospital|Teaching Hospital|Institute of)\b.*$/i, "").trim() || s;

/** One verification step as the mockup draws it: R01 ✓, Amend ✕, pending ◷. */
function StepPart({ s, label, amend }: { s: VerificationStep; label: string; amend?: boolean }) {
  const [icon, bg, fg] = s.status === 1 ? ["✓", amend ? "rgba(92,225,230,.16)" : "rgba(61,220,151,.18)", amend ? "#5CE1E6" : "#3DDC97"] : s.status === 2 ? ["✕", "rgba(255,122,122,.16)", "#FF7A7A"] : ["◷", "rgba(229,160,75,.16)", "#E5A04B"];
  return <span style={{ background: bg, color: fg }} title={s.remarks ? `PHF: ${s.remarks}` : undefined}>{label} {icon}</span>;
}

/**
 * Candidates (docs/mockups/v4/Gazette.dc.html): the gazette as published, each
 * candidate's verification steps, corrections shown on top (never in place of the
 * original), and the seat and consent from the latest round.
 */
export default async function CandidatesPage({ searchParams }: { searchParams: Promise<Sp> }) {
  const s = findSection("/portal/candidates");
  const down = await whenDatabaseDown({ area: "portal", trail: [{ label: s.label }], title: s.label, description: s.description });
  if (down) return down;
  const db = getDb();
  const session = await getSession();
  const sp = await searchParams;
  const inductions = await gazetteInductions(db, session);
  const induction = inductions.find((x) => String(x) === sp.i) ?? inductions[0];
  if (induction == null) {
    return (
      <AreaPage area="portal" trail={[{ label: s.label }]} title={s.label} description={s.description}>
        <EmptyState title="No gazette loaded yet">The gazette appears here when PHF publishes it for the running induction. Past merit lists are on <Link href="/portal/history" className="text-signal underline">Merit lists</Link>.</EmptyState>
      </AreaPage>
    );
  }
  const board = (await gazetteBoard(db, session, induction))!;
  const me = session ? await verifiedApplicant(db, (await ensureUser(db, session)).id) : null;
  const usePublished = sp.marks === "published";
  const ranked = rankRows([...board.rows].map((r) => ({ ...r, marks: usePublished ? r.published : r.marks })).sort((a, b) => b.marks - a.marks || a.applicantId.localeCompare(b.applicantId)));
  const myRow = me ? ranked.find((r) => r.applicantId === me) : null;

  const tab: Tab = sp.tab && sp.tab in TABS ? (sp.tab as Tab) : "all";
  const chip: Chip | null = sp.chip && sp.chip in CHIPS ? (sp.chip as Chip) : null;
  const programs = [...new Set(board.rows.flatMap((r) => r.programmes.map((p) => p.program)))].sort();
  const prog = programs.includes(sp.prog ?? "") ? sp.prog! : "";
  const r1 = sp.r1 && sp.r1 in STEP_STATUS ? sp.r1 : "";
  const amend = sp.amend && sp.amend in STEP_STATUS ? sp.amend : "";
  const query = classifyQuery(sp.q ?? "");
  const stepIs = (v: VerificationStep[], type: number, want: string) => {
    if (!want) return true;
    const x = step(v, type);
    return want === "none" ? !x : x?.status === Number(want);
  };
  const chipIs = (r: GazetteBoardRow, c: Chip | null) => {
    const a = step(r.verification, R01)?.status, b = step(r.verification, AMEND)?.status;
    switch (c) {
      case "rescued": return a === 2 && b === 1;
      case "both": return a === 2 && b === 2;
      case "pending": return a === 11 || b === 11 || r.profileStatus === 11;
      case "marks": return r.corrected.length > 0 && r.published !== r.marks;
      case "multi": return r.programmes.length >= 2;
      case "noprefs": return r.programmes.length === 0;
      default: return true;
    }
  };
  const matches = ranked.filter((r) =>
    (tab === "all" || (tab === "running" && r.profileStatus === 1) || (tab === "out" && r.profileStatus === 2) || (tab === "corrected" && r.corrected.length > 0)) &&
    (!prog || r.programmes.some((p) => p.program === prog)) &&
    stepIs(r.verification, R01, r1) && stepIs(r.verification, AMEND, amend) && chipIs(r, chip) &&
    (!query || (query.kind === "id" ? r.applicantId.includes(query.value) : query.kind === "pmdc" ? r.pmdcNo === query.value : (r.name ?? "").toLowerCase().includes(query.value.toLowerCase()))),
  );
  const pages = Math.max(1, Math.ceil(matches.length / PAGE));
  const page = Math.min(pages, Math.max(1, Number(sp.page) || 1));
  const shown = matches.slice((page - 1) * PAGE, page * PAGE);

  // The four source tiles: gazette, verification steps, corrections, you.
  const tally = (type: number) => {
    const t = { ok: 0, no: 0, wait: 0 };
    for (const r of board.rows) { const x = step(r.verification, type); if (!x) continue; if (x.status === 1) t.ok++; else if (x.status === 2) t.no++; else t.wait++; }
    return t;
  };
  const r1t = tally(R01), amt = tally(AMEND);
  const kinds = new Map<string, number>();
  for (const r of board.rows) for (const k of r.corrected) kinds.set(k, (kinds.get(k) ?? 0) + 1);
  const counts = {
    running: board.rows.filter((r) => r.profileStatus === 1).length,
    out: board.rows.filter((r) => r.profileStatus === 2).length,
    corrected: board.rows.filter((r) => r.corrected.length).length,
  };
  const chipCount = Object.fromEntries((Object.keys(CHIPS) as Chip[]).map((c) => [c, board.rows.filter((r) => chipIs(r, c)).length])) as Record<Chip, number>;
  const myR01 = myRow ? step(myRow.verification, R01) : null;

  const href = (change: Partial<Sp>) => {
    const next: Sp = { ...sp, i: String(induction), ...change };
    if (!("page" in change)) delete next.page;
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) q.set(k, v);
    return `/portal/candidates?${q}`;
  };
  const keep = (omit: (keyof Sp)[]) => (Object.entries({ ...sp, i: String(induction) }) as [keyof Sp, string | undefined][])
    .filter(([k, v]) => v && !omit.includes(k) && k !== "page" && k !== "id")
    .map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />);
  const panel = sp.id ? await gazetteCandidate(db, session, { induction, applicantId: sp.id }) : null;
  const panelRank = panel ? ranked.find((r) => r.applicantId === panel.applicantId)?.rank ?? null : null;
  // Joining status once PHF's joining file for the last round is in.
  const join = board.latestRound ? await roundJoinStates(db, session, induction, board.latestRound) : null;

  return (
    <AreaPage area="portal" trail={[{ label: s.label }]} title={`Candidates · induction ${induction}`} bare>
      <AuroraHeader as="section" className="flex flex-col gap-3.5 px-5 py-[22px] sm:px-6">
        <div className="grid gap-3.5">
          <div className="min-w-0">
            <p className="text-[13px] text-[#F3EEE5]/[.68]">
              <Link href="/portal/history" className="text-[#F3EEE5]/70 hover:underline">Merit lists</Link> / <Link href={`/portal/history/${induction}`} className="hover:underline">Induction {induction}</Link>
              {board.latestRound ? <> · <span className="mn-live !h-2 !w-2 align-middle" /> round {board.latestRound} is the latest list</> : null}
            </p>
            <h1 className="mt-1.5 text-[2rem] font-bold tracking-[-0.03em]">Candidates <span className="text-base font-medium tracking-normal text-[#F3EEE5]/[.68]">· induction {induction}</span></h1>
            <p className="mt-1.5 max-w-[700px] text-sm text-[#F3EEE5]/[.68]">PHF&apos;s gazette as published, each candidate&apos;s verification steps, and any correction shown on top, never in place of the original. Seats and consent come from the latest round.</p>
          </div>
          <form action="/portal/candidates" role="search" className="flex w-full max-w-[460px] gap-2">
            {keep(["q"])}
            <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-[#F3EEE5]/[.18] bg-[rgba(16,36,58,.55)] px-3.5 text-[#F3EEE5]/60">
              <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <input name="q" defaultValue={sp.q ?? ""} aria-label="Name, PMDC or applicant ID" placeholder="Name, PMDC or applicant ID" className="min-w-0 flex-1 bg-transparent text-sm text-[#F3EEE5] outline-none placeholder:text-[#F3EEE5]/60" />
            </label>
            <button type="submit" className="mn-btn h-11 rounded-xl px-[18px] text-[13px] font-semibold">Find</button>
          </form>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1.1fr_1.3fr_1fr_.8fr]">
          <Src label="Gazette">
            <b className="text-xl">{n(board.rows.length)} <span className="text-xs font-medium text-[#F3EEE5]/[.68]">candidates</span></b>
            <span className="text-[11px] text-[#F3EEE5]/[.68]">PHF&apos;s published list <span className="mn-pill ml-1 bg-[#F3EEE5]/10 text-[#F3EEE5]">🔒 same all cycle</span></span>
          </Src>
          <Src label="Verification steps">
            <div className="grid grid-cols-[96px_1fr] items-center gap-x-2.5 gap-y-1.5 text-[11px]">
              <span className="text-[#F3EEE5]/[.68]">Round 01</span><Bar parts={[[r1t.ok, "#3DDC97", true], [r1t.no, "#FF7A7A"], [r1t.wait, "#E5A04B"]]} />
              <span className="text-[#F3EEE5]/[.68]">Amendment</span><Bar parts={[[amt.ok, "#5CE1E6", true], [amt.no, "#FF7A7A"], [amt.wait, "#E5A04B"]]} />
            </div>
            <span className="text-[10px] text-[#F3EEE5]/[.68]"><span className="text-[#3DDC97]">■</span> accepted · <span className="text-[#5CE1E6]">■</span> accepted on amendment · <span className="text-[#FF7A7A]">■</span> rejected · <span className="text-[#E5A04B]">■</span> pending</span>
          </Src>
          <Src label="Corrections on top">
            <b className="text-xl text-[#5CE1E6]">{n(counts.corrected)} <span className="text-xs font-medium text-[#F3EEE5]/[.68]">records</span></b>
            <span className="text-[11px] text-[#F3EEE5]/[.68]">{[...kinds.entries()].map(([k, v]) => `${n(v)} ${(CORRECTION_KIND_LABELS[k as CorrectionKind] ?? k).toLowerCase()}`).concat("original kept").join(" · ")}</span>
          </Src>
          <Src label="You" glow>
            {myRow ? (
              <>
                <b className="text-xl text-[#D6CCFF]">#{n(myRow.rank)}</b>
                <span className="text-[11px] text-[#F3EEE5]/[.68]">{formatMarks(myRow.marks)}{myR01 ? ` · ${myR01.status === 1 ? "accepted" : myR01.status === 2 ? "rejected" : "pending"} in round 01` : ""}</span>
              </>
            ) : (
              <span className="text-xs text-[#F3EEE5]/[.85]"><Link href="/portal/profile" className="font-semibold text-[#D6CCFF] hover:underline">Link your merit record</Link> to see your rank.</span>
            )}
          </Src>
        </div>
      </AuroraHeader>

      <div className="flex flex-col items-start gap-4 xl:flex-row">
        <section aria-label="Candidates" className="mn-card-glass w-full min-w-0 flex-1 overflow-hidden rounded-[20px] border border-white/[.07]">
          <header className="flex flex-col gap-3 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <nav aria-label="Show" className="mn-seg max-w-full overflow-x-auto">
                {(Object.keys(TABS) as Tab[]).map((t) => {
                  const c = t === "all" ? board.rows.length : counts[t];
                  return <Link key={t} href={href({ tab: t === "all" ? undefined : t })} aria-current={t === tab ? "page" : undefined}>{TABS[t]}{t === "all" || t === "corrected" ? ` ${n(c)}` : ""}</Link>;
                })}
              </nav>
              <form action="/portal/candidates" className="flex items-center gap-2 text-xs text-muted">
                {keep(["marks"])}
                <label htmlFor="cand-marks">Marks shown</label>
                <AutoSelect id="cand-marks" name="marks" defaultValue={usePublished ? "published" : ""} className="mn-sel h-8 text-xs">
                  <option value="">With corrections</option>
                  <option value="published">As published by PHF</option>
                </AutoSelect>
                <noscript><button type="submit" className="mn-ob">Show</button></noscript>
              </form>
            </div>
            <form action="/portal/candidates" className="flex flex-wrap items-end gap-2.5">
              {keep(["prog", "r1", "amend", "i"])}
              {inductions.length > 1 ? (
                <label className="mn-lbl">Induction
                  <AutoSelect name="i" defaultValue={String(induction)}>{inductions.map((x) => <option key={x} value={x}>Induction {x}</option>)}</AutoSelect>
                </label>
              ) : <input type="hidden" name="i" value={induction} />}
              <label className="mn-lbl">Programme
                <AutoSelect name="prog" defaultValue={prog}><option value="">All programmes</option>{programs.map((p) => <option key={p}>{p}</option>)}</AutoSelect>
              </label>
              <label className="mn-lbl">Round 01
                <AutoSelect name="r1" defaultValue={r1}>{Object.entries(STEP_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</AutoSelect>
              </label>
              <label className="mn-lbl">Amendment
                <AutoSelect name="amend" defaultValue={amend}>{Object.entries(STEP_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</AutoSelect>
              </label>
              <noscript><button type="submit" className="mn-ob">Apply</button></noscript>
            </form>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(CHIPS) as Chip[]).map((c) => (
                <Link key={c} href={href({ chip: chip === c ? undefined : c })} aria-current={chip === c ? "true" : undefined} className="mn-chipf">{CHIPS[c]} <b>{n(chipCount[c])}</b></Link>
              ))}
            </div>
          </header>

          {shown.length === 0 ? <div className="px-3.5 pb-6"><EmptyState title="Nobody matches">Clear a filter or a chip.</EmptyState></div> : (
            <div className="overflow-x-auto">
              <table className="mn-tbl min-w-[46rem] [&_td]:!px-2.5 [&_td]:!py-[9px] [&_th]:!px-2.5 [&_th]:!py-2">
                <thead>
                  <tr>
                    <th colSpan={4} scope="colgroup" className="!pt-3 text-[11px] uppercase tracking-[0.06em]">🔒 Gazette and verification · same all cycle</th>
                    <th colSpan={2} scope="colgroup" className="bg-[rgba(110,86,255,.05)] !pt-3 text-[11px] uppercase tracking-[0.06em] !text-[#C4B8FF]">{board.latestRound ? <><span className="motion-safe:animate-pulse">●</span> Round {board.latestRound} · changes each round</> : "Rounds · none yet"}</th>
                  </tr>
                  <tr>
                    <th scope="col">Rank</th><th scope="col">Candidate</th><th scope="col" className="!text-right">Marks</th><th scope="col" className="whitespace-nowrap">Round 01 → Amendment</th>
                    <th scope="col" className="bg-[rgba(110,86,255,.05)]">Seat now</th><th scope="col" className="bg-[rgba(110,86,255,.05)]">Consent</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => {
                    const mine = r.applicantId === me, open = r.applicantId === sp.id;
                    const orig = board.rows.find((x) => x.applicantId === r.applicantId)!;
                    const changed = r.corrected.length > 0 && orig.marks !== orig.published;
                    const a = step(r.verification, R01), b = step(r.verification, AMEND);
                    const remark = [b, a].find((x) => x?.status === 2 && x.remarks)?.remarks;
                    const js: JoinState | undefined = r.seat ? join?.get(joinKey(r.applicantId, r.seat.program)) : undefined;
                    return (
                      <tr key={r.applicantId} className={cn(open && "bg-[rgba(110,86,255,.12)] shadow-[inset_3px_0_0_#7B61FF]", mine && !open && "bg-[rgba(155,135,255,.06)]")}>
                        <td className={cn("font-mono", mine ? "text-[#D6CCFF]" : "text-muted")}>{n(r.rank)}</td>
                        <td>
                          <Link href={`${href({ id: r.applicantId, page: String(page) })}#cand-panel`} scroll={false} className="group flex items-center gap-[9px]">
                            <span aria-hidden className="mn-av !h-7 !w-7 !text-[10px]" style={mine ? { background: "linear-gradient(135deg,#8B73FF,#5B3FF5)", boxShadow: "0 0 10px rgba(110,86,255,.6)" } : { background: avatarOf(r.applicantId) }}>{initials(r.name, r.applicantId)}</span>
                            <span className="min-w-0">
                              <b className="whitespace-nowrap font-semibold group-hover:text-[#D6CCFF]">{r.name ?? "Name not published"}</b>{mine ? <> <span className="mn-pill v">you</span></> : null}
                              <span className="block font-mono text-[11px] text-muted">{r.applicantId}{r.pmdcNo ? ` · ${r.pmdcNo}` : ""}</span>
                              <span className="mt-[3px] block">{r.programmes.map((p) => <span key={p.program} className="mn-tag">{p.program}</span>)}{r.programmes.length === 0 ? <span className="mn-tag !border-[rgba(229,160,75,.5)] !text-[#E5A04B]">no preferences</span> : null}</span>
                            </span>
                          </Link>
                        </td>
                        <td className="text-right">
                          <span className="font-mono">{formatMarks(r.marks)}</span>
                          {changed ? <> <span className="mn-pill c !px-1.5 !py-px !text-[10px]" title={r.corrected.map((k) => CORRECTION_KIND_LABELS[k as CorrectionKind] ?? k).join(", ")}>corrected</span><span className="block font-mono text-[10px] text-muted">{usePublished ? `with: ${formatMarks(orig.marks)}` : `PHF: ${formatMarks(orig.published)}`}</span></> : null}
                        </td>
                        <td>
                          {a || b ? <span className="mn-step">{a ? <StepPart s={a} label="R01" /> : null}{b ? <StepPart s={b} label="Amend" amend /> : null}</span> : <span className="text-xs text-muted">—</span>}
                          {remark ? <span className="mt-[3px] block max-w-[14rem] text-[10px] text-muted">&quot;{remark}&quot;</span> : null}
                        </td>
                        <td className={cn("max-w-[13rem] bg-[rgba(110,86,255,.05)]", !r.seat && "text-muted")}>
                          {r.seat ? <>{short(r.seat.speciality)} · {short(r.seat.hospital)}{r.seat.preferenceNo ? <span className="text-muted"> #{r.seat.preferenceNo}</span> : null}</> : r.profileStatus === 2 ? "Out of the running" : r.programmes.length === 0 ? "Not in any list" : "No seat yet"}
                        </td>
                        <td className="bg-[rgba(110,86,255,.05)]">
                          {js ? <JoinPill state={js} /> : !r.seat ? <span className="text-muted">—</span> : r.consent === "Accepted" ? <span className="mn-pill g">Accepted</span> : r.consent === "Rejected" ? <span className="mn-pill r">Rejected</span> : r.consent ? <span className="mn-pill a">Waiting</span> : <span className="mn-pill n">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <footer className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-3 text-xs text-muted">
            <span>Ranked by marks {usePublished ? "as published by PHF" : "with corrections"} · {n(matches.length)} matching{pages > 1 ? ` · ${n((page - 1) * PAGE + 1)}–${n(Math.min(page * PAGE, matches.length))}` : ""}</span>
            {pages > 1 ? (
              <nav aria-label="Pages" className="flex items-center gap-1">
                {page > 1 ? <Link href={href({ page: String(page - 1) })} aria-label="Previous" className="mn-page border border-white/10">‹</Link> : null}
                {[...new Set([1, page - 1, page, page + 1, pages])].filter((x) => x >= 1 && x <= pages).sort((x, y) => x - y).map((x, i, arr) => (
                  <span key={x} className="flex items-center gap-1">{i > 0 && x - arr[i - 1]! > 1 ? <span aria-hidden>…</span> : null}<Link href={href({ page: String(x) })} aria-current={x === page ? "page" : undefined} className="mn-page">{x}</Link></span>
                ))}
                {page < pages ? <Link href={href({ page: String(page + 1) })} aria-label="Next" className="mn-page border border-white/10">›</Link> : null}
              </nav>
            ) : null}
          </footer>
        </section>

        {panel ? <CandidatePanel c={{ ...panel, name: panel.name ?? ranked.find((r) => r.applicantId === panel.applicantId)?.name ?? null }} rank={panelRank} closeHref={href({ id: undefined, page: sp.page })} latestRound={board.latestRound} join={join} mine={panel.applicantId === me} /> : null}
      </div>
    </AreaPage>
  );
}

function Src({ label, glow, children }: { label: string; glow?: boolean; children: ReactNode }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1 rounded-xl border bg-[rgba(16,36,58,.45)] px-3 py-2.5 text-xs", glow ? "border-[rgba(155,135,255,.55)] shadow-[0_0_22px_rgba(110,86,255,.25)]" : "border-[#F3EEE5]/[.12]")}>
      <span className="text-[11px] uppercase tracking-[0.05em] text-[#F3EEE5]/[.68]">{label}</span>
      {children}
    </div>
  );
}

function Bar({ parts }: { parts: [number, string, boolean?][] }) {
  const total = parts.reduce((a, [v]) => a + v, 0);
  if (!total) return <span className="text-[#F3EEE5]/50">not loaded</span>;
  return (
    <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
      {parts.filter(([v]) => v > 0).map(([v, c, glow], i) => <span key={i} className="mn-grow-x" style={{ flex: v, background: c, boxShadow: glow ? `0 0 8px ${c}80` : undefined }} />)}
    </div>
  );
}

type Panel = NonNullable<Awaited<ReturnType<typeof gazetteCandidate>>>;

function CandidatePanel({ c, rank, closeHref, latestRound, join, mine }: { c: Panel; rank: number | null; closeHref: string; latestRound: number | null; join: Map<string, JoinState> | null; mine: boolean }) {
  const latest = latestRound != null ? c.rounds.filter((r) => r.roundNo === latestRound) : [];
  const joined = join ? latest.map((r) => join.get(joinKey(c.applicantId, r.program))).find(Boolean) ?? null : null;
  const dot = (color: string, glow = true) => <span aria-hidden className="absolute -left-[21px] top-[3px] h-2.5 w-2.5 rounded-full" style={{ background: color, boxShadow: glow ? `0 0 8px ${color}` : undefined }} />;
  return (
    <aside id="cand-panel" aria-labelledby="cand-panel-h" className="mn-card-glass order-first flex w-full flex-none scroll-mt-4 flex-col gap-3.5 rounded-[20px] border border-[rgba(155,135,255,.4)] p-[18px] shadow-[0_0_40px_rgba(110,86,255,.15)] xl:sticky xl:top-4 xl:order-none xl:max-h-[calc(100dvh-2rem)] xl:w-[350px] xl:overflow-y-auto">
      <div className="flex items-center gap-3">
        <span aria-hidden className="mn-av !h-11 !w-11 !text-[15px]" style={mine ? { background: "linear-gradient(135deg,#8B73FF,#5B3FF5)" } : { background: avatarOf(c.applicantId), boxShadow: `0 0 0 3px ${avatarOf(c.applicantId)}66` }}>{initials(c.name, c.applicantId)}</span>
        <div className="min-w-0 flex-1">
          <h2 id="cand-panel-h" className="truncate text-[17px] font-semibold">{c.name ?? `Applicant ${c.applicantId}`}</h2>
          <p className="mt-0.5 font-mono text-[11px] text-muted">{c.applicantId}{c.pmdcNo ? ` · PMDC ${c.pmdcNo}` : ""}{rank ? ` · rank ${n(rank)}` : ""}</p>
        </div>
        <Link href={closeHref} scroll={false} aria-label="Close" className="grid h-[30px] w-[30px] flex-none place-items-center rounded-lg border border-white/[.12] text-[#A3A3AD] hover:text-white">✕</Link>
      </div>

      <div>
        <p className="text-[13px] font-semibold">Record</p>
        <ol className="mt-2.5 flex flex-col gap-3 border-l-2 border-white/[.08] pl-3.5 text-xs">
          <li className="relative">{dot("#8B8B93", false)}<b>In the gazette</b> <span className="text-muted">· {formatMarks(c.imported.baseMarks)} as published</span></li>
          {c.verification.map((v, i) => {
            const [color, cls, word] = v.status === 1 ? (v.type === AMEND ? ["#5CE1E6", "c", "Accepted"] : ["#3DDC97", "g", "Accepted"]) : v.status === 2 ? ["#FF7A7A", "r", "Rejected"] : ["#E5A04B", "a", "Pending"];
            return <li key={i} className="relative">{dot(color)}<b>{v.label}</b> <span className={cn("mn-pill !text-[10px]", cls)}>{word}</span>{v.remarks ? <span className="mt-0.5 block text-muted">&quot;{v.remarks}&quot;</span> : null}</li>;
          })}
          {c.corrections.map((k, i) => (
            <li key={`c${i}`} className="relative">{dot("#9B87FF")}<b>Correction</b> <span className="text-muted">· {(CORRECTION_KIND_LABELS[k.kind as CorrectionKind] ?? k.kind).toLowerCase()}</span>
              <div className="mt-1.5 grid grid-cols-[1fr_auto_auto] gap-x-2.5 gap-y-0.5">
                <span className="text-muted">{CORRECTION_LABELS[k.field as CorrectionField] ?? k.field}{k.program ? ` (${k.program})` : ""}</span>
                <span className="font-mono text-muted">{k.field === "base_marks" ? formatMarks(c.imported.baseMarks) : ""}</span>
                <span className="font-mono text-[#5CE1E6]">→ {k.field === "profile_status" ? k.value : formatMarks(Number(k.value))}</span>
              </div>
              <span className="mt-1 block text-[11px] text-muted">Shown on top of PHF&apos;s figure, which is kept · added {new Date(k.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
            </li>
          ))}
          {c.rounds.map((r, i) => <li key={`r${i}`} className="relative">{dot("#3DDC97", false)}<b>Round {r.roundNo}</b> <span className="text-muted">· {r.preferenceNo ? `#${r.preferenceNo} ` : ""}{r.speciality}, {short(r.hospital)}</span></li>)}
          {joined ? <li className="relative">{dot(joined === "joined" ? "#3DDC97" : joined === "pending" ? "#E5A04B" : "#FF7A7A")}<b>Joining</b> <JoinPill state={joined} /></li> : null}
        </ol>
      </div>

      {c.programmes.filter((p) => p.preferences.length).length === 0 ? <p className="text-xs text-muted">No preferences in the portal data.</p> : null}
      {c.programmes.filter((p) => p.preferences.length).map((p) => {
        const at = latest.find((r) => r.program.toLowerCase() === p.program.toLowerCase())?.preferenceNo || null;
        return (
          <div key={p.program}>
            <div className="flex items-baseline justify-between"><p className="text-[13px] font-semibold">All {p.preferences.length} preferences · {p.program}</p>{latestRound ? <span className="text-[10px] text-muted">round {latestRound}</span> : null}</div>
            <ol className="mt-2 flex max-h-[250px] flex-col gap-1 overflow-auto pr-1">
              {p.preferences.map((x) => {
                const st = at == null ? null : x.preferenceNo < at ? "miss" : x.preferenceNo === at ? "seat" : "below";
                const nc = st === "seat" ? "#3DDC97" : st === "miss" ? "#FF7A7A" : "#6B6B73";
                return (
                  <li key={x.preferenceNo} className="grid grid-cols-[28px_1fr_auto] items-center gap-2 rounded-[9px] px-[9px] py-[7px] text-xs"
                    style={{ background: st === "seat" ? "rgba(61,220,151,.12)" : st === "miss" ? "rgba(255,122,122,.08)" : "rgba(255,255,255,.025)", boxShadow: st === "seat" ? "inset 0 0 0 1px rgba(61,220,151,.45), 0 0 14px rgba(61,220,151,.15)" : undefined }}>
                    <span className="font-mono" style={{ color: nc }}>#{x.preferenceNo}</span>
                    <span className="min-w-0 truncate" style={{ color: st === "below" ? "#A3A3AD" : "#EDEDEF" }}>{x.speciality} · {short(x.hospital)}</span>
                    <span className="text-[10px]" style={{ color: nc }}>{st === "seat" ? "Placed" : st === "miss" ? "Fell short" : st === "below" ? "Skipped" : x.quota}</span>
                  </li>
                );
              })}
            </ol>
          </div>
        );
      })}
      <Link href={`/portal/estimates?id=${c.applicantId}`} className="inline-flex h-[38px] items-center justify-center rounded-[10px] border border-white/[.14] text-[13px] hover:border-[rgba(155,135,255,.7)]">Where {mine ? "you land" : "they land"} in the estimate →</Link>
    </aside>
  );
}
