import Link from "next/link";
import { AreaPage } from "@/components/area-page";
import { BuiltOn } from "@/components/built-on";
import { whenDatabaseDown } from "@/components/database-unavailable";
import { AuroraHeader } from "@/components/ui/aurora-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { getSession } from "@/lib/auth/session";
import { verifiedApplicant } from "@/lib/data/candidates";
import { estimateApplicantResult, estimateList, officialReplies, publishedEstimates, publishedRound } from "@/lib/data/simulation";
import { ensureUser } from "@/lib/data/users";
import { getDb } from "@/lib/db/client";
import { marginText, RESULT_LABELS, trackSummary, type ResultStatus } from "@/lib/domain/applicant-result";
import { formatMarks, isUuid } from "@/lib/format";
import { findSection } from "@/lib/navigation";

export const metadata = { title: "Estimates" };
export const dynamic = "force-dynamic";

type Sp = { run?: string; id?: string; track?: string; view?: string; all?: string };

/** Row colours of the applicant result, as Estimate.dc.html draws them. */
const ROW: Record<ResultStatus, { sb: string; sc: string; bg: string; sh: string; nc: string; tc: string; dc: string }> = {
  placed: { sb: "rgba(61,220,151,.18)", sc: "#3DDC97", bg: "rgba(61,220,151,.10)", sh: "inset 0 0 0 1px rgba(61,220,151,.45), 0 0 14px rgba(61,220,151,.15)", nc: "#3DDC97", tc: "#EDEDEF", dc: "#3DDC97" },
  clears_cutoff: { sb: "rgba(61,220,151,.12)", sc: "#3DDC97", bg: "rgba(255,255,255,.025)", sh: "none", nc: "#8B8B93", tc: "#EDEDEF", dc: "#3DDC97" },
  fell_short: { sb: "rgba(255,122,122,.16)", sc: "#FF7A7A", bg: "rgba(255,122,122,.06)", sh: "none", nc: "#FF7A7A", tc: "#EDEDEF", dc: "#FF7A7A" },
  skipped: { sb: "rgba(255,255,255,.06)", sc: "#8B8B93", bg: "rgba(255,255,255,.025)", sh: "none", nc: "#6B6B73", tc: "#A3A3AD", dc: "#8B8B93" },
  no_seats: { sb: "rgba(229,160,75,.14)", sc: "#E5A04B", bg: "rgba(255,255,255,.025)", sh: "none", nc: "#6B6B73", tc: "#A3A3AD", dc: "#8B8B93" },
};

const ago = (d: Date, now: number) => {
  const m = Math.max(1, Math.round((now - d.getTime()) / 60_000));
  return m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};
const initials = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
const seatOf = (r: { program: string; quota: string; speciality: string; hospital: string }) => `${r.program}|${r.quota}|${r.speciality}|${r.hospital}`.toLowerCase();
const trackOf = (r: { program: string; quota: string }) => `${r.program}|${r.quota}`;

/**
 * Estimates (docs/mockups/v4/Estimate.dc.html): the current published estimate of the
 * next list, what it rests on, likely closing ranges per seat against the last published
 * round, and an applicant's result preference by preference. Never probabilities,
 * never official.
 */
export default async function EstimatesPage({ searchParams }: { searchParams: Promise<Sp> }) {
  const s = findSection("/portal/estimates");
  const down = await whenDatabaseDown({ area: "portal", trail: [{ label: s.label }], title: s.label, description: s.description });
  if (down) return down;
  const db = getDb();
  const session = await getSession();
  const sp = await searchParams;
  const all = await publishedEstimates(db, session);
  const current = all.filter((e) => !e.official);
  const pick = (sp.run && isUuid(sp.run) ? all.find((e) => e.id === sp.run) : null) ?? current[0] ?? null;

  if (!pick) {
    return (
      <AreaPage area="portal" trail={[{ label: s.label }]} title={s.label} description={s.description} status={<Badge tone="simulated" className="mx-2">Estimate · not official</Badge>}>
        <EmptyState title="No estimate right now" action={<div className="flex flex-wrap justify-center gap-2"><ButtonLink href="/portal/simulation">Run your own what-if</ButtonLink><ButtonLink href="/portal/history" variant="secondary">Merit lists</ButtonLink></div>}>
          An estimate of the next list appears here once the gazette, portal preferences and consent replies for a round are in, usually a day or two before PHF publishes it.
          {all.length ? <> Earlier estimates are kept with their <Link href="/portal/history" className="text-signal underline">merit lists</Link>.</> : null}
        </EmptyState>
      </AreaPage>
    );
  }

  const now = new Date().getTime();
  const est = await estimateList(db, session, pick.id);
  const rows = est?.rows ?? [];
  const me = session ? await verifiedApplicant(db, (await ensureUser(db, session)).id) : null;
  const asked = (sp.id ?? "").replace(/\D/g, "").slice(0, 8);
  const applicant = asked || me || "";
  const result = applicant ? await estimateApplicantResult(db, session, { runId: pick.id, applicantId: applicant }) : null;

  // The round this estimate follows: its list and the consent replies to it.
  const prevNo = pick.roundNo - 1;
  const [replies, prevList] = prevNo >= 1 ? await Promise.all([officialReplies(db, pick.induction, prevNo), publishedRound(db, pick.induction, prevNo)]) : [[], null];
  const prev = prevList ?? [];
  const byApplicant = new Map<string, string>();
  for (const r of replies) if (byApplicant.get(r.applicantId) !== "Accepted") byApplicant.set(r.applicantId, r.status);
  const tally = { Accepted: 0, Rejected: 0, Awaited: 0 };
  for (const v of byApplicant.values()) tally[v === "Accepted" || v === "Rejected" ? v : "Awaited"]++;
  const replied = tally.Accepted + tally.Rejected;
  const totalReplies = replied + tally.Awaited;
  const pct = totalReplies ? Math.round((replied / totalReplies) * 100) : null;

  // Who was where in the last round, and where the estimate puts them.
  const prevSeat = new Map(prev.map((p) => [`${p.applicantId}|${p.program}`, p]));
  const newcomers = rows.filter((r) => !prevSeat.has(`${r.applicantId}|${r.program}`));
  const movers = rows.filter((r) => { const p = prevSeat.get(`${r.applicantId}|${r.program}`); return p && seatOf(p) !== seatOf(r); });

  // Per seat: closing mark then and now, newcomers, and how many of last round's holders have not replied.
  type Seat = { program: string; quota: string; speciality: string; hospital: string; closing: number; then: number | null; fresh: number; held: number; awaited: number };
  const seats = new Map<string, Seat>();
  for (const r of rows) {
    const k = seatOf(r);
    const g = seats.get(k) ?? { program: r.program, quota: r.quota, speciality: r.speciality, hospital: r.hospital, closing: r.mark, then: null, fresh: 0, held: 0, awaited: 0 };
    g.closing = Math.min(g.closing, r.mark);
    if (!prevSeat.has(`${r.applicantId}|${r.program}`)) g.fresh++;
    seats.set(k, g);
  }
  for (const p of prev) {
    const g = seats.get(seatOf(p));
    if (!g) continue;
    g.then = g.then == null ? p.mark : Math.min(g.then, p.mark);
    g.held++;
    if (totalReplies && byApplicant.get(p.applicantId) !== "Accepted" && byApplicant.get(p.applicantId) !== "Rejected") g.awaited++;
  }

  // One quota track at a time, as the mockup shows it: the applicant's own, else the biggest.
  const trackCount = new Map<string, number>();
  for (const g of seats.values()) trackCount.set(trackOf(g), (trackCount.get(trackOf(g)) ?? 0) + 1);
  const tracks = [...trackCount.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const placedRow = result?.programmes.map((p) => ({ p, sum: trackSummary(p.rows) })).find((x) => x.sum.placed);
  const ownTrack = placedRow ? `${placedRow.p.program}|${placedRow.sum.placed!.quota}` : null;
  const track = sp.track && trackCount.has(sp.track) ? sp.track : ownTrack && trackCount.has(ownTrack) ? ownTrack : (tracks[0] ?? "");
  const changing = [...seats.values()]
    .filter((g) => trackOf(g) === track && g.then != null)
    .sort((a, b) => Math.abs(b.closing - b.then!) - Math.abs(a.closing - a.then!) || a.speciality.localeCompare(b.speciality));
  const shown = sp.all ? changing : changing.slice(0, 12);

  const view = sp.view === "moves" ? "moves" : "ranges";
  const base = "/portal/estimates";
  const href = (over: Partial<Sp>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ run: sp.run, id: asked || undefined, track: sp.track, view: sp.view, ...over })) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `${base}?${s}` : base;
  };
  const listHref = `/portal/history/${pick.induction}/estimates/${pick.id}`;
  const whatIf = `/portal/simulation?i=${pick.induction}&base=${encodeURIComponent(`run:${pick.id}`)}`;
  const ticks = 40, on = pct == null ? 0 : Math.round((pct / 100) * ticks);

  // "You in this estimate" and "up from #n" both read the last round's place.
  const youPrev = (program: string) => (result ? prevSeat.get(`${result.applicantId}|${program}`)?.preferenceNo ?? null : null);
  const mine = result && result.applicantId === me ? result : null;
  const minePlaced = mine?.programmes.map((p) => ({ p, sum: trackSummary(p.rows) })).find((x) => x.sum.placed) ?? null;
  const mineMiss = mine && !minePlaced ? mine.programmes.map((p) => trackSummary(p.rows).closestMiss).find(Boolean) ?? null : null;

  return (
    <AreaPage area="portal" trail={[{ label: s.label }]} title={`Estimated round ${pick.roundNo}`} bare>
      <AuroraHeader as="section" className="flex flex-col gap-4 border border-dashed border-[rgba(229,160,75,.45)] px-5 py-[22px] sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[13px] text-[#F3EEE5]/[.68]">
              <Link href="/portal/history" className="text-[#F3EEE5]/70 hover:underline">Merit lists</Link> / <Link href={`/portal/history/${pick.induction}`} className="hover:underline">Induction {pick.induction}</Link> ·{" "}
              <span className="mn-pill a border border-dashed border-[rgba(229,160,75,.7)]">Estimate · not official</span>
            </p>
            <h1 className="mt-2 text-[2rem] font-bold tracking-[-0.03em]">Estimated round {pick.roundNo}</h1>
            <p className="mt-1.5 max-w-[700px] text-sm text-[#F3EEE5]/[.68]">
              {prevNo >= 1 ? `Built from the gazette, the round ${prevNo} list and the consent replies so far.` : "Built from the gazette and the portal preferences."} It is redone as more replies come in; PHF&apos;s real list can differ.
            </p>
          </div>
          <Link href={whatIf} className="mn-btn inline-flex h-10 items-center rounded-xl px-4 text-[13px] font-semibold">What if someone rejects?</Link>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1.4fr_repeat(3,minmax(0,1fr))]">
          <div className="rounded-[14px] border border-[#F3EEE5]/[.12] bg-[rgba(16,36,58,.45)] px-3.5 py-3">
            <div className="flex justify-between gap-2 text-xs text-[#F3EEE5]/[.68]">
              <p><span className="text-[#E5A04B] motion-safe:animate-pulse">●</span> Consent replies in</p>
              <b className="text-sm text-[#E5A04B]">{pct == null ? "—" : `${pct}%`}</b>
            </div>
            <div className="mt-2.5 flex h-5 gap-0.5" role="img" aria-label={totalReplies ? `${replied.toLocaleString("en-US")} of ${totalReplies.toLocaleString("en-US")} replied` : "No consent replies loaded"}>
              {Array.from({ length: ticks }, (_, i) => {
                const t = i / (ticks - 1);
                return <span key={i} className="flex-1 rounded-[2px]" style={i < on ? { background: `hsl(${38 - t * 6}, 78%, ${50 + t * 10}%)`, boxShadow: "0 0 6px rgba(229,160,75,.55)" } : { background: "rgba(243,238,229,.12)" }} />;
              })}
            </div>
            <p className="mt-1.5 text-[11px] text-[#F3EEE5]/[.68]">
              Published {ago(pick.publishedAt, now)}{totalReplies ? ` · ${tally.Accepted.toLocaleString("en-US")} accepted, ${tally.Rejected.toLocaleString("en-US")} rejected, ${tally.Awaited.toLocaleString("en-US")} awaited` : prevNo >= 1 ? ` · no round ${prevNo} replies loaded yet` : ""}
            </p>
          </div>
          <div className="rounded-[14px] border border-[#F3EEE5]/[.12] bg-[rgba(16,36,58,.45)] px-3.5 py-3">
            <p className="text-xs text-[#F3EEE5]/[.68]">Seats re-offered</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{prevList ? newcomers.length.toLocaleString("en-US") : rows.length.toLocaleString("en-US")}</p>
            {prevList ? <p className="mt-0.5 text-[11px] text-[#F3EEE5]/[.68]">to people not placed in round {prevNo}</p> : null}
          </div>
          <div className="rounded-[14px] border border-[#F3EEE5]/[.12] bg-[rgba(16,36,58,.45)] px-3.5 py-3">
            <p className="text-xs text-[#F3EEE5]/[.68]">Likely to move</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-[#3DDC97]">{prevList ? `~${movers.length.toLocaleString("en-US")}` : "—"}</p>
            {prevList ? <p className="mt-0.5 text-[11px] text-[#F3EEE5]/[.68]">placed people who change seat</p> : null}
          </div>
          <div className="rounded-[14px] border border-[rgba(155,135,255,.55)] bg-[rgba(16,36,58,.45)] px-3.5 py-3 shadow-[0_0_22px_rgba(110,86,255,.25)]">
            <p className="text-xs text-[#F3EEE5]/[.68]">You in this estimate</p>
            {!me ? (
              <p className="mt-1 text-sm text-[#F3EEE5]/[.85]"><Link href="/portal/profile" className="font-semibold text-[#D6CCFF] hover:underline">Link your merit record</Link> to see yourself here.</p>
            ) : !mine ? (
              <p className="mt-1 text-base font-bold text-[#D6CCFF]">Not in this estimate</p>
            ) : minePlaced ? (
              <>
                <p className="mt-1 truncate text-base font-bold text-[#D6CCFF]">Placed · #{minePlaced.sum.placed!.preferenceNo} {minePlaced.sum.placed!.speciality}</p>
                <p className="mt-0.5 truncate text-[11px] text-[#F3EEE5]/[.68]">{minePlaced.sum.placed!.hospital}{youPrev(minePlaced.p.program) ? ` · ${youPrev(minePlaced.p.program)! > minePlaced.sum.placed!.preferenceNo ? "up" : youPrev(minePlaced.p.program) === minePlaced.sum.placed!.preferenceNo ? "same as" : "down"} from #${youPrev(minePlaced.p.program)}` : ""} · {marginText(minePlaced.sum.placed!).toLowerCase()}</p>
              </>
            ) : (
              <>
                <p className="mt-1 text-base font-bold text-[#D6CCFF]">Not placed</p>
                {mineMiss ? <p className="mt-0.5 truncate text-[11px] text-[#F3EEE5]/[.68]">closest: #{mineMiss.preferenceNo} {mineMiss.speciality}, {marginText(mineMiss).toLowerCase()}</p> : null}
              </>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-[#F3EEE5]/[.12] bg-[rgba(16,36,58,.45)] px-3 py-2.5 [&_span:first-child]:text-[#F3EEE5]/[.68]">
          <BuiltOn basis={pick.basis} />
        </div>
      </AuroraHeader>

      {pick.official ? (
        <p className="rounded-[14px] border border-[rgba(229,160,75,.5)] bg-[rgba(229,160,75,.08)] px-4 py-3 text-sm">
          PHF has published round {pick.roundNo}; this estimate is kept for comparison. <Link href={`/portal/history/${pick.induction}/rounds/${pick.roundNo}`} className="font-semibold text-[#B9AAFF] hover:underline">Open the official list →</Link>
        </p>
      ) : null}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_430px]">
        <section aria-label="Estimated closing" className="mn-card-glass min-w-0 overflow-hidden rounded-[20px] border border-white/[.07]">
          <header className="flex flex-wrap items-center justify-between gap-2.5 p-3.5">
            <nav aria-label="View" className="mn-seg">
              <Link href={href({ view: undefined, all: undefined })} aria-current={view === "ranges" ? "page" : undefined}>Closing ranges</Link>
              <Link href={listHref}>Estimated list</Link>
              <Link href={href({ view: "moves", all: undefined })} aria-current={view === "moves" ? "page" : undefined}>Who moves</Link>
            </nav>
            {view === "ranges" ? (
              <form action={base} className="flex flex-wrap items-center gap-2 text-xs text-muted">
                {sp.run ? <input type="hidden" name="run" value={sp.run} /> : null}
                {asked ? <input type="hidden" name="id" value={asked} /> : null}
                <label htmlFor="est-track" className="sr-only">Quota track</label>
                <select id="est-track" name="track" defaultValue={track} className="mn-sel h-8 text-xs">
                  {tracks.map((t) => <option key={t} value={t}>{t.replace("|", " · ")}</option>)}
                </select>
                <button type="submit" className="mn-ob">Show</button>
                {prevList ? <span><span className="text-ink">▮</span> round {prevNo} · <span className="text-[#E5A04B]">▬</span> likely round {pick.roundNo}</span> : null}
              </form>
            ) : null}
          </header>

          {view === "ranges" ? (
            shown.length ? (
              <div className="overflow-x-auto">
                <table className="mn-tbl min-w-[40rem]">
                  <thead>
                    <tr><th scope="col">Seat</th><th scope="col" className="!text-right">R{prevNo} closing</th><th scope="col" className="w-[260px]">Likely R{pick.roundNo} range</th><th scope="col">Change</th><th scope="col">Confidence</th></tr>
                  </thead>
                  <tbody>
                    {shown.map((g) => {
                      const d = g.closing - g.then!;
                      const share = g.held ? g.awaited / g.held : totalReplies ? 0 : 1;
                      const half = Math.round((0.02 + Math.abs(d) * share) * 100) / 100;
                      const lo = g.closing - half, hi = g.closing + half;
                      const a = Math.min(lo, g.then!), b = Math.max(hi, g.then!);
                      const pad = Math.max(0.1, (b - a) * 0.4);
                      const pos = (v: number) => ((v - (a - pad)) / (b - a + 2 * pad)) * 100;
                      const conf = !totalReplies ? null : share < 0.2 ? ["High", "g"] : share < 0.5 ? ["Medium", "a"] : ["Low", "r"];
                      return (
                        <tr key={seatOf(g)}>
                          <td className="max-w-[16rem]"><b className="block truncate font-semibold">{g.speciality} · {g.hospital}</b><span className="block text-[11px] text-muted">{g.fresh ? `${g.fresh} ${g.fresh === 1 ? "seat" : "seats"} re-offered` : "0 re-offered"}</span></td>
                          <td className="text-right font-mono">{formatMarks(g.then)}</td>
                          <td>
                            <div className="mn-rng" aria-hidden>
                              <span className="band" style={{ left: `${pos(lo)}%`, width: `${Math.max(2, pos(hi) - pos(lo))}%` }} />
                              <span className="now" style={{ left: `${pos(g.then!)}%` }} />
                            </div>
                            <span className="font-mono text-[11px] text-[#E5A04B]">{formatMarks(lo)} – {formatMarks(hi)}</span>
                          </td>
                          <td>{Math.abs(d) < 0.01 ? <span className="mn-pill n">≈ same</span> : d < 0 ? <span className="mn-pill g">▼ ~{Math.abs(d).toFixed(2)}</span> : <span className="mn-pill r">▲ ~{d.toFixed(2)}</span>}</td>
                          <td>{conf ? <span className={cn("mn-pill", conf[1])}>{conf[0]}</span> : <span className="text-xs text-muted">—</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-3.5 pb-4 text-sm text-muted">{prevList ? "No seat in this track was in the last published round to compare with." : "There is no published round before this one to compare with."}</p>
            )
          ) : (
            <div className="overflow-x-auto">
              <table className="mn-tbl min-w-[36rem]">
                <thead><tr><th scope="col">Applicant</th><th scope="col" className="!text-right">Mark</th><th scope="col">Round {prevNo}</th><th scope="col">Likely round {pick.roundNo}</th></tr></thead>
                <tbody>
                  {[...movers, ...newcomers].sort((x, y) => y.mark - x.mark).slice(0, 100).map((r) => {
                    const p = prevSeat.get(`${r.applicantId}|${r.program}`);
                    return (
                      <tr key={`${r.applicantId}|${r.program}`}>
                        <td className="font-mono">{r.applicantId}<span className="block font-sans text-[11px] text-muted">{r.program} · {r.quota}</span></td>
                        <td className="text-right font-mono">{formatMarks(r.mark)}</td>
                        <td className="text-muted">{p ? `#${p.preferenceNo} ${p.speciality} · ${p.hospital}` : <span className="mn-pill v">New</span>}</td>
                        <td>#{r.preferenceNo} {r.speciality} · {r.hospital}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="border-t border-white/[.05] px-3.5 pb-3.5 pt-3 text-xs text-muted">
            {view === "ranges" ? (
              <>Ranges, not single numbers. Wider bands mean more of last round&apos;s holders have not replied for that seat.{changing.length > shown.length ? <> <Link href={href({ all: "1" })} className="text-[#B9AAFF]">Show all {changing.length} seats</Link>.</> : null} <Link href="/portal/help" className="text-[#B9AAFF]">How estimates are made</Link></>
            ) : (
              <>The {Math.min(100, movers.length + newcomers.length)} highest marks among {(movers.length + newcomers.length).toLocaleString("en-US")} people who are new or change seat. <Link href={listHref} className="text-[#B9AAFF]">Open the full estimated list</Link></>
            )}
          </p>
        </section>

        <aside aria-label="Applicant result" className="mn-card-glass flex min-w-0 flex-col gap-3 rounded-[20px] border border-[rgba(155,135,255,.45)] p-[18px] shadow-[0_0_40px_rgba(110,86,255,.18)]">
          <div className="flex items-center gap-2.5">
            <span aria-hidden className="mn-av !h-10 !w-10 !text-sm bg-[linear-gradient(135deg,#8B73FF,#5B3FF5)] shadow-[0_0_14px_rgba(110,86,255,.6)]">{result?.name ? initials(result.name) : "#"}</span>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-base font-semibold">{result ? result.name ?? `Applicant ${result.applicantId}` : "Result for an applicant"} {result && result.applicantId === me ? <span className="mn-pill v">you</span> : null}</h2>
              {result ? <p className="mt-0.5 truncate font-mono text-[11px] text-muted">{[result.applicantId, result.pmdcNo, result.programmes[0] ? formatMarks(result.programmes[0].mark) : null].filter(Boolean).join(" · ")}</p> : <p className="mt-0.5 text-[11px] text-muted">Every preference, in order</p>}
            </div>
            <details className="relative">
              <summary className="mn-ob h-[30px] cursor-pointer list-none text-xs text-[#B9B9C2] [&::-webkit-details-marker]:hidden">Change</summary>
              <form action={base} className="absolute right-0 top-9 z-10 flex gap-2 rounded-xl border border-white/10 bg-[#17171C] p-2 shadow-xl">
                {sp.run ? <input type="hidden" name="run" value={sp.run} /> : null}
                <label htmlFor="est-id" className="sr-only">Applicant ID</label>
                <input id="est-id" name="id" inputMode="numeric" defaultValue={applicant} placeholder="Applicant ID" className="h-9 w-32 rounded-lg border border-white/10 bg-transparent px-2.5 font-mono text-sm outline-none focus:border-[rgba(155,135,255,.7)]" />
                <button type="submit" className="mn-ob h-9">Show</button>
              </form>
            </details>
          </div>

          {!applicant ? (
            <p className="text-sm text-muted">Pick an applicant with Change{me ? "" : ", or link your merit record on Me to see your own result here every time"}.</p>
          ) : !result ? (
            <p className="text-sm text-muted">Applicant {applicant} has no preferences in this induction&apos;s data, so the estimate cannot place them.</p>
          ) : (
            result.programmes.map((p) => {
              const sum = trackSummary(p.rows);
              const was = youPrev(p.program);
              return (
                <div key={p.program} className="grid gap-3">
                  {sum.placed ? (
                    <div className="rounded-xl border border-[rgba(61,220,151,.4)] bg-[rgba(61,220,151,.10)] p-3 shadow-[0_0_18px_rgba(61,220,151,.15)]">
                      <div className="flex items-center justify-between gap-2"><b className="text-[13px]">{p.program} · {sum.placed.quota} placement</b><span className="mn-pill g">Placed</span></div>
                      <p className="mt-1 text-xs">Placed at preference #{sum.placed.preferenceNo}: <b>{sum.placed.speciality} @ {sum.placed.hospital}</b>{was ? <span className="text-muted"> ({was > sum.placed.preferenceNo ? "up from" : was === sum.placed.preferenceNo ? "same as" : "down from"} #{was} in round {prevNo})</span> : null}</p>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-[rgba(229,160,75,.4)] bg-[rgba(229,160,75,.08)] p-3">
                      <div className="flex items-center justify-between gap-2"><b className="text-[13px]">{p.program} placement</b><span className="mn-pill a">Not placed</span></div>
                      <p className="mt-1 text-xs">{sum.closestMiss ? <>Closest: #{sum.closestMiss.preferenceNo} <b>{sum.closestMiss.speciality} @ {sum.closestMiss.hospital}</b>, {marginText(sum.closestMiss).toLowerCase()}</> : "No preference clears its cutoff in this estimate."}</p>
                    </div>
                  )}
                  <div className="grid grid-cols-[26px_1fr_46px_92px_68px] gap-1.5 px-2 text-[10px] uppercase tracking-[0.05em] text-muted"><span>Pref</span><span>Seat</span><span className="text-right">Cutoff</span><span className="text-right">Margin</span><span className="text-right">Status</span></div>
                  <ol className="flex max-h-[470px] flex-col gap-1 overflow-auto pr-0.5">
                    {p.rows.map((r) => {
                      const t = ROW[r.status];
                      const m = marginText(r);
                      return (
                        <li key={r.preferenceNo} className="grid grid-cols-[26px_1fr_46px_92px_68px] items-center gap-1.5 rounded-[9px] px-2 py-[7px] text-xs" style={{ background: t.bg, boxShadow: t.sh }}>
                          <span className="font-mono" style={{ color: t.nc }}>#{r.preferenceNo}</span>
                          <span className="min-w-0"><span className="block truncate" style={{ color: t.tc }}>{r.speciality}</span><span className="block truncate text-[10px] text-muted">{r.hospital}{r.filled != null ? ` · ${r.filled} placed` : ""}</span></span>
                          <span className="text-right font-mono text-muted">{r.cutoff == null ? "—" : formatMarks(r.cutoff)}</span>
                          <span className="text-right font-mono text-[11px]" style={{ color: /short/i.test(m) ? "#FF7A7A" : t.dc }}>{m}</span>
                          <span className="text-right"><span className="mn-pill !px-[7px] !py-0.5 !text-[10px]" style={{ background: t.sb, color: t.sc }}>{RESULT_LABELS[r.status]}</span></span>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              );
            })
          )}
          <p className="text-[11px] leading-normal text-muted">One final seat per quota track. Lower preferences can still show &quot;would clear&quot;, but they are skipped once an earlier one is placed.</p>
          <Link href={whatIf} className="mn-btn inline-flex h-10 items-center justify-center rounded-xl px-4 text-[13px] font-semibold">What if someone above me rejects?</Link>
        </aside>
      </div>

      {all.length > 1 ? (
        <p className="text-xs text-muted">
          Other estimates:{" "}
          {all.filter((e) => e.id !== pick.id).map((e, i) => (
            <span key={e.id}>{i ? ", " : ""}<Link href={`${base}?run=${e.id}`} className="text-[#B9AAFF] underline underline-offset-2">induction {e.induction} round {e.roundNo}{e.official ? " (superseded)" : ""}</Link></span>
          ))}
        </p>
      ) : null}
    </AreaPage>
  );
}
