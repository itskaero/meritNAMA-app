import Link from "next/link";
import { notFound } from "next/navigation";
import { AreaPage } from "@/components/area-page";
import { JoinPill, pct } from "@/components/joining";
import { AuroraHeader } from "@/components/ui/aurora-header";
import { EmptyState } from "@/components/ui/empty-state";
import { getSession } from "@/lib/auth/session";
import { joiningList, joiningOverview, joiningTrend } from "@/lib/data/joining";
import { getDb } from "@/lib/db/client";
import { JOIN_LABELS, type JoinState } from "@/lib/domain/joining";
import { formatMarks } from "@/lib/format";
import { intParam } from "@/lib/params";

export const metadata = { title: "Joining and wasted seats" };
export const dynamic = "force-dynamic";

const fmt = (n: number) => n.toLocaleString("en-US");
const PAGE = 50;
const STATES: JoinState[] = ["joined", "not_joined", "pending"];

/** A row of a "left most" card: name, a coral bar against the biggest, the count. */
function BarRow({ label, n, max, href }: { label: string; n: number; max: number; href?: string | null }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_140px_44px] items-center gap-2.5 text-[13px]">
      {href ? <Link href={href} className="truncate hover:text-[#D6CCFF]">{label}</Link> : <span className="truncate">{label}</span>}
      <span className="h-2 overflow-hidden rounded-full bg-white/[.06]"><span className="mn-grow-x block h-full rounded-full bg-[#FF7A7A]" style={{ width: `${Math.round((n / Math.max(1, max)) * 100)}%` }} /></span>
      <span className="text-right font-mono">{fmt(n)}</span>
    </li>
  );
}

/** Joining (docs/mockups/v4/Joining.dc.html): who joined the last round's seats, and which went unused. */
export default async function JoiningPage({ params, searchParams }: { params: Promise<{ induction: string }>; searchParams: Promise<{ state?: string; page?: string }> }) {
  const induction = intParam((await params).induction);
  if (induction === null) notFound();
  const sp = await searchParams;
  const db = getDb();
  const session = await getSession();
  const state = STATES.find((s) => s === sp.state);
  const page = Math.max(1, Number(sp.page) || 1);
  const [o, trend, list] = await Promise.all([
    joiningOverview(db, session, induction),
    joiningTrend(db, session),
    joiningList(db, session, { induction, state, offset: (page - 1) * PAGE, limit: PAGE }),
  ]);
  const trail = [{ label: "Merit lists", href: "/portal/history" }, { label: `Induction ${induction}`, href: `/portal/history/${induction}` }, { label: "Joining" }];
  if (!o || !list) {
    return (
      <AreaPage area="portal" trail={trail} title={`Induction ${induction} · joining`} description="Who joined their seat, and how many seats went unused.">
        <EmptyState title="No joining data for this induction">It appears once PHF&apos;s joining status for the last round is in.</EmptyState>
      </AreaPage>
    );
  }
  const w = o.total;
  const oneIn = w.pct > 0 ? Math.round(1 / w.pct) : null;
  const headline = !w.wasted ? "Every seat was used" : oneIn && oneIn <= 10 ? `1 in ${oneIn} seats went unused` : `${pct(w.pct)} of seats went unused`;
  const spec = [...o.bySpeciality].filter((r) => r.wasted > 0).sort((a, b) => b.wasted - a.wasted).slice(0, 5);
  const hosp = [...o.byHospital].filter((r) => r.wasted > 0).sort((a, b) => b.wasted - a.wasted).slice(0, 5);
  const progMax = o.notJoinedByProgram[0]?.n ?? 1;
  const trendMax = Math.max(...trend.map((t) => t.total.pct), 0.01);
  const topHosp = hosp[0], topSpec = spec[0];
  const pages = Math.max(1, Math.ceil(list.total / PAGE));
  const base = `/portal/history/${induction}/joining`;
  const href = (q: { state?: string; page?: number }) => {
    const u = new URLSearchParams();
    if (q.state) u.set("state", q.state);
    if (q.page && q.page > 1) u.set("page", String(q.page));
    const s = u.toString();
    return `${base}${s ? `?${s}` : ""}#list`;
  };
  const snap = o.importedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Karachi" });

  return (
    <AreaPage area="portal" trail={trail} title={`Induction ${induction} · joining`} bare>
      <p className="text-[13px] text-muted">
        <Link href="/portal/history" className="hover:text-ink">Merit lists</Link> / <Link href={`/portal/history/${induction}`} className="hover:text-ink">Induction {induction}</Link> / <b className="font-semibold text-ink">Round {o.roundNo} · last round</b>
      </p>

      <AuroraHeader as="section" className="flex flex-col gap-[18px] !rounded-[20px] px-5 py-[22px] sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="min-w-0">
            <p className="mb-1 text-xs uppercase tracking-[0.1em] text-[#F3EEE5]/[.72]">Last round · joining status from PHF</p>
            <h1 className="text-[30px] font-bold tracking-[-0.02em]">{headline}</h1>
            <p className="mt-1.5 max-w-[620px] text-sm text-[#F3EEE5]/[.72]">
              Of {fmt(w.seats)} seats, round {o.roundNo} placed {fmt(w.placed)} doctors. {fmt(w.joined)} joined{w.pending ? ` and ${fmt(w.pending)} are pending` : ""}. {fmt(w.notJoined)} placed doctors did not join, and {fmt(w.unfilled)} seats were never filled by any round.
            </p>
          </div>
          <dl className="flex flex-wrap gap-[26px]">
            {([["Joined", fmt(w.joined), "#3DDC97"], ["Not joined", fmt(w.notJoined), "#FF7A7A"], ["Never filled", fmt(w.unfilled), "#E5A04B"]] as const).map(([l, v, c]) => (
              <div key={l}><dt className="text-[11px] uppercase tracking-[0.1em] text-[#F3EEE5]/[.72]">{l}</dt><dd className="mt-0.5 text-[28px] font-semibold tabular-nums" style={{ color: c }}>{v}</dd></div>
            ))}
            <div><dt className="text-[11px] uppercase tracking-[0.1em] text-[#F3EEE5]/[.72]">Wasted</dt><dd className="mt-0.5 text-[28px] font-semibold tabular-nums">{fmt(w.wasted)} <span className="text-[15px] text-[#F3EEE5]/[.72]">· {pct(w.pct)}</span></dd></div>
          </dl>
        </div>
        <div>
          <div className="flex h-4 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={`${fmt(w.seats)} seats: ${fmt(w.joined)} joined, ${fmt(w.pending)} pending, ${fmt(w.notJoined)} placed but not joined, ${fmt(w.unfilled)} never filled`}>
            {([[w.joined, "#3DDC97"], [w.pending, "#5CE1E6"], [w.notJoined, "#FF7A7A"], [w.unfilled, "#E5A04B"]] as const).filter(([v]) => v > 0).map(([v, c], i) => <span key={i} className="mn-grow-x" style={{ flex: v, background: c }} />)}
          </div>
          <p className="mt-2 text-xs text-[#F3EEE5]/[.72]">PHF joining snapshot, {snap}. Joining can still change until the window closes. Wasted = did not join + never filled; pending seats are not counted.</p>
        </div>
      </AuroraHeader>

      <div className="grid gap-[18px] lg:grid-cols-3">
        <section aria-labelledby="byprog" className="mn-card-glass rounded-[20px] border border-white/[.07] p-5">
          <h2 id="byprog" className="mb-3.5 text-[15px] font-semibold">Not joined, by programme</h2>
          {o.notJoinedByProgram.length ? <ul className="flex flex-col gap-3">{o.notJoinedByProgram.slice(0, 5).map((p) => <BarRow key={p.name} label={p.name} n={p.n} max={progMax} />)}</ul> : <p className="text-sm text-muted">Everyone placed joined.</p>}
        </section>
        <section aria-labelledby="byspec" className="mn-card-glass rounded-[20px] border border-white/[.07] p-5">
          <h2 id="byspec" className="mb-3.5 text-[15px] font-semibold">Specialities left most</h2>
          {spec.length ? <ul className="flex flex-col gap-3">{spec.map((r) => <BarRow key={r.key} label={r.name} n={r.wasted} max={spec[0]!.wasted} href={r.id != null ? `/portal/explore/specialities/${r.id}` : null} />)}</ul> : <p className="text-sm text-muted">No wasted seats.</p>}
        </section>
        <section aria-labelledby="byhosp" className="mn-card-glass rounded-[20px] border border-white/[.07] p-5">
          <h2 id="byhosp" className="mb-3.5 text-[15px] font-semibold">Hospitals left most</h2>
          {hosp.length ? <ul className="flex flex-col gap-3">{hosp.map((r) => <BarRow key={r.key} label={r.name} n={r.wasted} max={hosp[0]!.wasted} href={r.id != null ? `/portal/explore/hospitals/${r.id}` : null} />)}</ul> : <p className="text-sm text-muted">No wasted seats.</p>}
          <p className="mt-3.5 text-xs text-muted">Seats left here usually reopen in the next induction&apos;s first round.</p>
        </section>
      </div>

      <section aria-labelledby="trend" className="mn-card-glass grid items-center gap-6 rounded-[20px] border border-white/[.07] p-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <h2 id="trend" className="text-[15px] font-semibold">Wasted seats, induction by induction</h2>
          <p className="mb-3.5 mt-1 text-[13px] text-muted">Seats nobody joined or nobody was placed in, at the end of each induction. Shown on Merit lists, each hospital and speciality page, and Overview once joining closes.</p>
          <div className="flex h-[120px] items-end gap-3.5" role="img" aria-label={`Wasted share: ${trend.map((t) => `induction ${t.induction} ${pct(t.total.pct)}`).join(", ")}`}>
            {trend.map((t) => {
              const cur = t.induction === induction;
              return (
                <Link key={t.induction} href={`/portal/history/${t.induction}/joining`} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                  <span className="font-mono text-xs" style={{ color: cur ? "#FF7A7A" : "#8B8B93" }}>{pct(t.total.pct)}</span>
                  <span className="w-full max-w-[90px] rounded-[10px_10px_4px_4px]" style={{ height: `${Math.max(6, (t.total.pct / trendMax) * 72)}px`, background: cur ? "linear-gradient(180deg,#FF7A7A,rgba(255,122,122,.35))" : "rgba(255,255,255,.12)", boxShadow: cur ? "0 0 18px rgba(255,122,122,.35)" : undefined }} />
                  <span className="text-xs text-muted">Ind. {t.induction}</span>
                </Link>
              );
            })}
          </div>
        </div>
        <div className="flex flex-col gap-2.5">
          {topHosp ? (
            <Link href={topHosp.id != null ? `/portal/explore/hospitals/${topHosp.id}` : base} className="block rounded-[14px] border border-[rgba(255,122,122,.3)] bg-[rgba(255,122,122,.06)] p-3.5 hover:border-[rgba(255,122,122,.55)]">
              <p className="text-xs text-muted">On a hospital page</p>
              <p className="mt-1 font-semibold">{topHosp.name} · {fmt(topHosp.wasted)} seats unused in induction {induction}</p>
              <p className="mt-0.5 text-xs text-muted">{fmt(topHosp.notJoined)} did not join · {fmt(topHosp.unfilled)} never filled · {pct(topHosp.pct)} of its seats</p>
            </Link>
          ) : null}
          {topSpec ? (
            <Link href="/portal/finder" className="block rounded-[14px] border border-[rgba(229,160,75,.3)] bg-[rgba(229,160,75,.06)] p-3.5 hover:border-[rgba(229,160,75,.55)]">
              <p className="text-xs text-muted">On My chances</p>
              <p className="mt-1 font-semibold">Seats like these often go unused</p>
              <p className="mt-0.5 text-xs text-muted">{topSpec.name} left {fmt(topSpec.wasted)} seats in induction {induction}: worth a look when you rank your preferences.</p>
            </Link>
          ) : null}
        </div>
      </section>

      <section id="list" aria-labelledby="list-h" className="mn-card-glass min-w-0 rounded-[20px] border border-white/[.07] p-5">
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-3">
          <h2 id="list-h" className="text-[17px] font-semibold">Round {list.roundNo} list</h2>
          <nav aria-label="Filter" className="mn-seg max-w-full overflow-x-auto">
            <Link href={href({})} aria-current={!state ? "page" : undefined}>All {fmt(list.counts.all)}</Link>
            {STATES.map((s) => <Link key={s} href={href({ state: s })} aria-current={state === s ? "page" : undefined}>{JOIN_LABELS[s]} {fmt(list.counts[s])}</Link>)}
          </nav>
        </div>
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="mn-tbl min-w-[44rem] [&_td]:!px-2.5 [&_td]:!py-[9px] [&_th]:!px-2.5 [&_th]:!py-2">
            <thead>
              <tr>
                <th colSpan={3} scope="colgroup" className="text-[10px] uppercase tracking-[0.08em]">Candidate</th>
                <th colSpan={2} scope="colgroup" className="text-[10px] uppercase tracking-[0.08em]">Seat in round {list.roundNo}</th>
                <th scope="colgroup" className="text-[10px] uppercase tracking-[0.08em] !text-[#5CE1E6]">Joining · last round only</th>
              </tr>
              <tr><th scope="col">#</th><th scope="col">Name</th><th scope="col">ID · PMDC</th><th scope="col">Speciality · hospital</th><th scope="col" className="!text-right">Marks</th><th scope="col">Status</th></tr>
            </thead>
            <tbody>
              {list.rows.map((r) => (
                <tr key={`${r.rowNo}`}>
                  <td className="font-mono text-muted">{r.rowNo}</td>
                  <td className={r.name ? "font-medium text-heading" : "italic text-muted"}>{r.name ?? ("nameHidden" in r && r.nameHidden ? "Name hidden" : "—")}</td>
                  <td className="whitespace-nowrap font-mono text-xs text-muted">{r.applicantId}{r.pmdcNo ? ` · ${r.pmdcNo}` : ""}</td>
                  <td><span className="text-ink">{r.speciality}</span><span className="block text-xs text-muted">{r.hospital} · {r.program}</span></td>
                  <td className="text-right font-mono">{formatMarks(r.marks)}</td>
                  <td><JoinPill state={r.state} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
          <p>The Candidates page shows the same status for each person&apos;s final seat.{list.total > PAGE ? ` ${fmt((page - 1) * PAGE + 1)}–${fmt(Math.min(page * PAGE, list.total))} of ${fmt(list.total)}.` : ""}</p>
          {pages > 1 ? (
            <nav aria-label="Pages" className="flex items-center gap-1">
              {page > 1 ? <Link href={href({ state, page: page - 1 })} aria-label="Previous" className="mn-page border border-white/10">‹</Link> : null}
              <span aria-current="page" className="mn-page">{page}</span>
              {page < pages ? <Link href={href({ state, page: page + 1 })} aria-label="Next" className="mn-page border border-white/10">›</Link> : null}
            </nav>
          ) : null}
        </div>
      </section>
    </AreaPage>
  );
}
