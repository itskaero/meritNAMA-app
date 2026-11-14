import { SaveView } from "@/components/workspace/save-view";
import { latestJoining } from "@/lib/data/joining";
import { ChancesTabs } from "@/components/chances-tabs";
import Link from "next/link";
import { AreaPage } from "@/components/area-page";
import { marksStanding } from "@/lib/data/merit";
import { peerInterest, peerKey } from "@/lib/data/social";
import { formatMarks } from "@/lib/format";
import { AuroraHeader } from "@/components/ui/aurora-header";
import { CountUp } from "@/components/charts/count-up";
import { whenDatabaseDown } from "@/components/database-unavailable";
import { EntityLink } from "@/components/entity-link";
import { STATUS_STYLE } from "@/components/finder/status";
import { Icon } from "@/components/icon";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { getSession } from "@/lib/auth/session";
import { myMerit } from "@/lib/data/candidates";
import { releasedBeforeFinal } from "@/lib/data/insights";
import { inductionRunning, predictRound } from "@/lib/data/predictions";
import { findOptions, finderOptions, listShortlist, optionHistory, type FinderOption } from "@/lib/data/finder";
import { getDb } from "@/lib/db/client";
import { optionKey, parseOptionKey, STATUS_LABEL, type FinderStatus } from "@/lib/domain/finder";
import { UserFacingError } from "@/lib/errors";
import { findSection } from "@/lib/navigation";
import { intParam, oneOf } from "@/lib/params";
import { toggleShortlistAction } from "./actions";

export const metadata = { title: "Score finder" };
export const dynamic = "force-dynamic";

type Params = { marks?: string; total?: string; induction?: string; track?: string; view?: string; show?: string; a?: string; b?: string };
const STATUSES: FinderStatus[] = ["safe", "borderline", "out"];
const pct = (v: number) => `${v.toFixed(1)}%`;
const num = (v: string | undefined) => (v && /^\d{1,3}(\.\d{1,3})?$/.test(v) ? Number(v) : null);

/** Star button: a plain form post (works without JavaScript). */
function Star({ saved, item, label }: { saved: boolean; item: { program: string; quota: string; speciality: string; hospital: string }; label: string }) {
  return (
    <form action={toggleShortlistAction}>
      {Object.entries(item).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <button
        type="submit"
        aria-pressed={saved}
        aria-label={saved ? `Remove ${label} from shortlist` : `Add ${label} to shortlist`}
        title={saved ? "On your shortlist" : "Add to shortlist"}
        className={cn("grid h-8 w-8 place-items-center rounded-full text-lg leading-none transition-colors", saved ? "text-ember" : "text-subtle hover:text-ink")}
      >
        {saved ? "★" : "☆"}
      </button>
    </form>
  );
}

export default async function ScoreFinderPage({ searchParams }: { searchParams: Promise<Params> }) {
  const s = findSection("/portal/finder");
  const frame = { area: "portal" as const, trail: [{ label: s.label }], title: s.label, description: s.description };
  const down = await whenDatabaseDown(frame);
  if (down) return down;

  const sp = await searchParams;
  const db = getDb();
  const session = await getSession();
  const joining = await latestJoining(db, session).catch(() => null);
  const [opts, mine] = await Promise.all([finderOptions(db, session), myMerit(db, session).catch(() => null)]);
  // A verified candidate's latest official marks fill the form when nothing is entered yet.
  const own = !sp.marks ? mine?.rows[0] : undefined;
  if (opts.inductions.length === 0) {
    return (
      <AreaPage {...frame}>
        <ChancesTabs current="/portal/finder" />
      {joining && joining.total.wasted ? (
        <p className="rounded-xl border border-line bg-card px-4 py-3 text-sm text-muted">
          <span className="font-semibold text-heading">After joining, seats go unused.</span> In induction {joining.induction}, {joining.total.wasted.toLocaleString("en-US")} of {joining.total.seats.toLocaleString("en-US")} seats ({Math.round(joining.total.pct * 100)}%) were not taken up. A place that looks out of reach on the last list can still be empty at the end.{" "}
          <Link href={`/portal/history/${joining.induction}/joining`} className="font-semibold text-signal hover:underline">See which</Link>
        </p>
      ) : null}
        <EmptyState title="No merit data to compare with yet">The finder needs imported merit rounds and the scoring policy file (for each induction&apos;s total marks).</EmptyState>
      </AreaPage>
    );
  }

  // Inputs (all from the URL, so a search can be bookmarked or shared).
  const induction = opts.inductions.find((i) => i.id === intParam(sp.induction)) ?? opts.inductions[0]!;
  const trackValues = induction.tracks.map((t) => `${t.program}|${t.quota}`);
  const trackValue = oneOf(sp.track, trackValues) ?? oneOf(own ? `${own.program}|${own.quota}` : undefined, trackValues) ?? trackValues[0]!;
  const [program, quota] = trackValue.split("|") as [string, string];
  const ownTotal = own ? opts.inductions.find((i) => i.id === own.induction)?.total : undefined;
  const total = num(sp.total) ?? ownTotal ?? opts.defaultTotal ?? induction.total;
  // A verified record analyses straight away; typed marks win.
  const marksText = sp.marks ?? (own ? own.marks.toFixed(2) : undefined);
  const marks = num(marksText);
  const view = sp.view === "grid" ? "grid" : "list";
  const show = oneOf(sp.show, STATUSES);

  const href = (patch: Partial<Params>) => {
    const p = new URLSearchParams();
    const merged: Params = { marks: marksText, total: String(total), induction: String(induction.id), track: trackValue, view, show, a: sp.a, b: sp.b, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/portal/finder?${p.toString()}`;
  };

  let result: Awaited<ReturnType<typeof findOptions>> | null = null;
  let error: string | null = null;
  if (marks !== null) {
    try {
      result = await findOptions(db, session, { induction: induction.id, program, quota, marks, total });
    } catch (e) {
      if (e instanceof UserFacingError) error = e.message;
      else throw e;
    }
  }
  const shortlist = await listShortlist(db, session);
  const saved = new Set(shortlist.filter((x) => x.program === program && x.quota === quota).map((x) => optionKey(x)));

  // Compare up to two options (a, b) across every induction.
  const picks = [parseOptionKey(sp.a), parseOptionKey(sp.b)].filter((x): x is NonNullable<typeof x> => Boolean(x));
  const histories = await Promise.all(picks.map((p) => optionHistory(db, session, { program, quota, ...p })));
;
  const pickHref = (o: FinderOption) => {
    const key = optionKey(o);
    if (sp.a === key || sp.b === key) return href({ a: sp.a === key ? sp.b : sp.a, b: undefined });
    return sp.a && !sp.b ? href({ b: key }) : href({ a: key, b: undefined });
  };
  const isPicked = (o: FinderOption) => [sp.a, sp.b].includes(optionKey(o));

  const options = result?.options ?? [];
  // Seats declined or not taken before the final round: why waiting can pay for Target options.
  const released = result ? await releasedBeforeFinal(db, session, { induction: induction.id, track: trackValue }) : new Map<string, number>();
  // While the compared cycle is still running, the next round's likely closing for each option.
  const ahead = result && (await inductionRunning(db, induction.id))
    ? await predictRound(db, session, { induction: induction.id, fromRound: Math.max(...options.map((o) => o.lastRound)), track: trackValue })
    : null;
  const nextBand = (o: FinderOption) => {
    const b = ahead?.hospitals.get(`${program}|${quota}|${o.speciality}|${o.hospital}`);
    return b ? { ...b, lowPct: (b.low / induction.total) * 100, highPct: (b.high / induction.total) * 100 } : null;
  };
  const counts = Object.fromEntries(STATUSES.map((st) => [st, options.filter((o) => o.status === st).length])) as Record<FinderStatus, number>;
  const visible = show ? options.filter((o) => o.status === show) : options;
  const bySpeciality = new Map<string, FinderOption[]>();
  for (const o of visible) (bySpeciality.get(o.speciality) ?? bySpeciality.set(o.speciality, []).get(o.speciality)!).push(o);
  const hospitals = [...new Set(visible.map((o) => o.hospital))].sort();

  const query = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string" && e[1] !== "")).toString();
  const lastRoundNo = options.length ? Math.max(...options.map((o) => o.lastRound)) : null;
  const [standing, peers] = await Promise.all([
    result && marks !== null && lastRoundNo ? marksStanding(db, session, { induction: induction.id, roundNo: lastRoundNo, program, marks: (marks / total) * induction.total }).catch(() => null) : null,
    peerInterest(db, session, { limit: 50 }).catch(() => null),
  ]);
  const IV = "text-[#F3EEE5]/[.68]";
  const fld = "grid gap-1.5 text-xs text-[#F3EEE5]/[.68]";
  const fldInput = "h-11 w-full rounded-xl border border-[#F3EEE5]/[.18] bg-[rgba(12,12,14,.45)] px-3.5 text-sm text-[#F3EEE5] outline-none focus:border-violet-soft";
  const BAND: Record<FinderStatus, { label: string; color: string; rgb: string; path: string }> = {
    safe: { label: "Safe", color: "#3DDC97", rgb: "61,220,151", path: "M0 26 C15 24, 25 28, 40 20 S 70 16, 100 5" },
    borderline: { label: "Target", color: "#E5A04B", rgb: "229,160,75", path: "M0 18 C15 12, 25 22, 45 16 S 75 20, 100 14" },
    out: { label: "Reach", color: "#FF7A7A", rgb: "255,122,122", path: "M0 6 C20 8, 30 12, 50 16 S 80 24, 100 28" },
  };
  const you = result ? result.mePct : null;
  const pctOf = (o: FinderOption) => o.lastPct;
  const tableTitle = show ? `${visible.length} ${BAND[show].label.toLowerCase()} seat${visible.length === 1 ? "" : "s"}` : `${visible.length} seats · ${program} · ${quota}`;
  const histFor = (i: number) => histories[i] ?? [];
  const sparkPath = (v: number[]) => {
    if (v.length < 2) return null;
    const lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
    return v.map((x, j) => `${j ? "L" : "M"}${((j / (v.length - 1)) * 196 + 2).toFixed(1)} ${(4 + (1 - (x - lo) / span) * 26).toFixed(1)}`).join(" ");
  };

  return (
    <AreaPage {...frame} bare>
      <AuroraHeader as="section" className="grid gap-[18px] px-5 py-[22px] sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h1 className="text-[2rem] font-bold tracking-[-0.03em]">My chances</h1><p className={cn("mt-1 text-sm", IV)}>Where your marks can get a seat, from past closing merit under the same scoring.</p></div>
          <ChancesTabs current="/portal/finder" variant="pills" />
        </div>
        <form method="get" className="grid items-end gap-3 md:grid-cols-[1fr_0.7fr_1.2fr_1.2fr_auto]">
          <label className={fld}>Your marks<input name="marks" inputMode="decimal" required defaultValue={sp.marks ?? (own ? own.marks.toFixed(2) : "")} placeholder="e.g. 22.5" className={cn(fldInput, "font-mono")} /></label>
          <label className={fld}>Out of<input name="total" inputMode="decimal" defaultValue={String(total)} className={cn(fldInput, "font-mono")} /></label>
          <label className={fld}>Programme · quota
            <select name="track" defaultValue={trackValue} className={fldInput}>{induction.tracks.map((t) => <option key={`${t.program}|${t.quota}`} value={`${t.program}|${t.quota}`}>{t.program} · {t.quota}</option>)}</select>
          </label>
          <label className={fld}>Compare with
            <select name="induction" defaultValue={induction.id} className={fldInput}>{opts.inductions.map((i) => <option key={i.id} value={i.id}>Induction {i.id} {i.likeForLike ? "(same scoring)" : `(out of ${i.total})`}</option>)}</select>
          </label>
          <input type="hidden" name="view" value={view} />
          <button type="submit" className="mn-btn h-11 rounded-xl px-5 text-sm font-semibold">Analyse →</button>
        </form>
        {result ? (
          <div className="grid gap-3.5 md:grid-cols-[230px_repeat(3,minmax(0,1fr))]">
            <div className="rounded-[14px] border border-[rgba(155,135,255,.45)] bg-[rgba(110,86,255,.18)] px-4 py-3.5 shadow-[0_0_30px_rgba(110,86,255,.25)]">
              <p className={cn("text-xs", IV)}>{standing ? "Your percentile" : "Your score"}</p>
              <p className="mt-0.5 text-[46px] font-bold leading-[1.05] tracking-[-0.03em]">{standing ? <>{standing.percentile}<span className={cn("text-lg", IV)}>th</span></> : pct(result.mePct)}</p>
              <p className="mt-0.5 text-[13px] text-[#D6CCFF]">{standing ? `${standing.percentile >= 75 ? "High" : standing.percentile >= 40 ? "Middle" : "Lower"} · better than ${standing.percentile} of 100` : `${marks} of ${total}`}</p>
            </div>
            {STATUSES.map((st) => {
              const on = show === st, b = BAND[st];
              return (
                <Link key={st} href={href({ show: on ? undefined : st })} aria-pressed={on} aria-label={`${b.label}: ${counts[st]}${on ? ", showing" : ""}`}
                  className={cn("rounded-[14px] border p-3.5 transition-[box-shadow,border-color]", on ? "" : "border-[#F3EEE5]/[.12] bg-[rgba(16,36,58,.45)] hover:border-[#F3EEE5]/30")}
                  style={on ? { borderColor: `rgba(${b.rgb},.7)`, boxShadow: `0 0 26px rgba(${b.rgb},.3)`, background: `rgba(${b.rgb},.12)` } : undefined}>
                  <span className="text-xs" style={{ color: b.color }}>● {b.label}{on ? " · showing" : ""}</span>
                  <span className="block text-[30px] font-bold tabular-nums" style={{ color: b.color }}><CountUp value={counts[st]} /></span>
                  <svg aria-hidden width="100%" height="28" viewBox="0 0 100 32" preserveAspectRatio="none"><path className="mn-draw-line" d={b.path} fill="none" stroke={b.color} strokeWidth="2" style={{ filter: `drop-shadow(0 0 4px rgba(${b.rgb},0.7))` }} /></svg>
                </Link>
              );
            })}
          </div>
        ) : null}
        <div className={cn("text-xs", IV)}>
          {own ? <p className="text-[#3DDC97]">Filled in from your verified record: induction {own.induction}, round {own.roundNo}.</p> : null}
          <p className="mt-1">Inductions are compared in percent of their total, so a score out of 30 lines up with one out of 35. Weights of the parts differ between years: a guide, not a guarantee.</p>
        </div>
      </AuroraHeader>

      {!opts.likeForLike.length ? (
        <Notice tone="warning" title="No past induction was scored like the current one">
          {opts.activeLabel ? `The current scoring (${opts.activeLabel}) has no closing-merit history yet. ` : ""}Past inductions were scored differently, so your marks cannot be placed against them with any confidence. Expect real chances once the first round of this induction is out.
        </Notice>
      ) : !induction.likeForLike ? (
        <Notice tone="warning" title={`Induction ${induction.id} was scored differently`}>
          {induction.label ? `It used ${induction.label}` : "Its scoring is not recorded"}, not the current scheme. Inductions scored like the current one: {opts.likeForLike.join(", ")}.
        </Notice>
      ) : null}
      {error ? <Notice tone="warning" title="Check your marks">{error}</Notice> : null}

      {!result ? (
        <Card>
          <CardHeader title="How it works" />
          <ol className="grid gap-3 text-sm text-muted sm:grid-cols-3">
            <li className="rounded-xl bg-white/[.03] p-4"><span className="mn-pill g">Safe</span><p className="mt-2">Your score reached the closing merit in the first round: you would have had this seat from the start.</p></li>
            <li className="rounded-xl bg-white/[.03] p-4"><span className="mn-pill a">Target</span><p className="mt-2">Below the first-round closing, but seats freed up later and the final round closed at or below your score.</p></li>
            <li className="rounded-xl bg-white/[.03] p-4"><span className="mn-pill r">Reach</span><p className="mt-2">Below the closing merit even in the final round.</p></li>
          </ol>
        </Card>
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section aria-label="Seats" className="mn-card-glass overflow-hidden rounded-[20px] border border-line">
            <header className="flex flex-wrap items-center justify-between gap-3 px-4 pb-2 pt-4">
              <h2 className="text-[15px] font-semibold text-heading">{tableTitle}</h2>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted">Tick two to compare · ☆ shortlist</span>
                <nav aria-label="View" className="mn-seg"><Link href={href({ view: "list" })} aria-current={view === "list" ? "page" : undefined}>List</Link><Link href={href({ view: "grid" })} aria-current={view === "grid" ? "page" : undefined}>Heatmap</Link></nav>
              </div>
            </header>
            {visible.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted">No seats in this view. <Link href={href({ show: undefined })} className="text-[#A797FF]">Show all</Link></p>
            ) : view === "list" ? (
              <div className="max-h-[70vh] overflow-auto">
                <table className="mn-tbl min-w-[46rem]">
                  <thead className="sticky top-0 z-[1] bg-[#17171C]"><tr><th scope="col"><span className="sr-only">Compare</span></th><th scope="col">Speciality · hospital</th><th scope="col" className="!text-right">Final</th><th scope="col">You vs final</th>{ahead ? <th scope="col">Next round likely</th> : null}<th scope="col"><span className="sr-only">Shortlist</span></th></tr></thead>
                  <tbody>
                    {visible.map((o) => {
                      const diff = you != null ? ((you - pctOf(o)) / 100) * induction.total : 0;
                      const nb = nextBand(o);
                      const freed = released.get(`${o.speciality}|${o.hospital}`);
                      return (
                        <tr key={`${o.speciality}|${o.hospital}`} className={cn(isPicked(o) && "!bg-[rgba(110,86,255,.08)]")}>
                          <td><Link href={pickHref(o)} aria-label={`${isPicked(o) ? "Remove from comparison" : "Compare"}: ${o.speciality} at ${o.hospital}`} className={cn("grid h-4 w-4 place-items-center rounded-[4px] border text-[10px]", isPicked(o) ? "border-[#7B61FF] bg-[#7B61FF] text-white" : "border-white/30")}>{isPicked(o) ? "✓" : ""}</Link></td>
                          <td><b><EntityLink kind="speciality" id={o.specialityId} name={o.speciality} /></b><span className="block text-xs text-muted">{o.hospital}{o.status === "borderline" && freed ? ` · ${freed} freed before the final round` : ""}</span></td>
                          <td className="text-right font-mono">{o.lastClosing.toFixed(2)}</td>
                          <td className="w-[150px]">
                            <span className="relative block h-1.5 rounded-full bg-white/[.08]">
                              <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.max(6, Math.min(100, 50 + diff * 40))}%`, background: diff >= 0 ? "linear-gradient(90deg,#E5A04B,#3DDC97)" : "linear-gradient(90deg,#E5A04B,#FF7A7A)" }} />
                              <span aria-hidden className="absolute -top-1 h-3.5 w-[3px] rounded-full bg-white" style={{ left: "50%" }} />
                            </span>
                            <span className={cn("text-[11px]", diff >= 0 ? "text-[#3DDC97]" : "text-[#FF7A7A]")}>{diff >= 0 ? "+" : "−"}{Math.abs(diff).toFixed(2)} {diff >= 0 ? "above" : "below"}</span>
                          </td>
                          {ahead ? <td className="font-mono text-[#E5A04B]">{nb ? `${nb.low.toFixed(1)} – ${nb.high.toFixed(1)}` : <span className="text-muted">—</span>}</td> : null}
                          <td><Star saved={saved.has(optionKey(o))} item={{ program, quota, speciality: o.speciality, hospital: o.hospital }} label={`${o.speciality} at ${o.hospital}`} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-4 pb-4">
                <div className="relative max-h-[70vh] overflow-auto rounded-2xl border border-line">
                  <table className="border-separate border-spacing-0 text-xs">
                    <caption className="sr-only">Heatmap of options: rows are specialities, columns are hospitals</caption>
                    <thead>
                      <tr>
                        <th scope="col" className="sticky left-0 top-0 z-[2] bg-[#17171C] px-3 py-2 text-left font-medium text-muted">Speciality</th>
                        {hospitals.map((h) => <th key={h} scope="col" className="sticky top-0 z-[1] h-40 min-w-8 bg-[#17171C] px-1 align-bottom font-medium text-muted"><span className="block max-h-36 overflow-hidden whitespace-nowrap py-2 [writing-mode:vertical-rl] rotate-180" title={h}>{h}</span></th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {[...bySpeciality].map(([spec, rows]) => {
                        const at = new Map(rows.map((r) => [r.hospital, r]));
                        return (
                          <tr key={spec}>
                            <th scope="row" className="sticky left-0 z-[1] max-w-48 truncate border-t border-line bg-[#17171C] px-3 py-1.5 text-left font-normal text-ink">{spec}</th>
                            {hospitals.map((h) => {
                              const o = at.get(h);
                              return <td key={h} className="border-t border-line p-0.5">{o ? <Link href={pickHref(o)} title={`${spec} · ${h}: ${STATUS_LABEL[o.status]}, final ${o.lastClosing.toFixed(2)}`} className={cn("block h-7 w-7 rounded-md", STATUS_STYLE[o.status].cell, isPicked(o) && "ring-2 ring-[#9B87FF]")}><span className="sr-only">{`${spec} at ${h}: ${STATUS_LABEL[o.status]}`}</span></Link> : <span aria-hidden className="block h-7 w-7" />}</td>;
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          <aside className="grid gap-3.5">
            <section aria-label="Compare" className="mn-card-glass rounded-[20px] border border-[rgba(155,135,255,.35)] p-5 shadow-[0_0_30px_rgba(110,86,255,.15)]">
              <div className="flex justify-between"><h2 className="text-[15px] font-semibold text-heading">Comparing {picks.length} of 2</h2>{picks.length ? <Link href={href({ a: undefined, b: undefined })} className="text-xs text-[#A797FF]">Clear</Link> : null}</div>
              <div className="mt-3 grid gap-2.5">
                {picks.map((pk, i) => {
                  const h = histFor(i).map((x) => x.pct);
                  const path = sparkPath(h);
                  const easier = h.length > 1 && h.at(-1)! <= h[0]!;
                  return (
                    <div key={optionKey(pk)} className="rounded-xl bg-white/[.03] px-3 py-2.5">
                      <div className="flex justify-between gap-2"><b className="truncate text-[13px]">{pk.speciality} · {pk.hospital.split(",")[0]}</b>{h.length > 1 ? <span className={cn("mn-pill", easier ? "g" : "r")}>{easier ? "easier" : "harder"}</span> : null}</div>
                      {path ? <svg aria-hidden width="100%" height="34" viewBox="0 0 200 34" preserveAspectRatio="none"><path d={path} fill="none" stroke={easier ? "#3DDC97" : "#FF7A7A"} strokeWidth="2.5" style={{ filter: `drop-shadow(0 0 5px ${easier ? "rgba(61,220,151,.7)" : "rgba(255,122,122,.7)"})` }} /></svg> : null}
                      <p className="text-[11px] text-muted">{h.length ? `${h.length} lists on record · last ${h.at(-1)!.toFixed(1)}% of total` : "Not offered before"}</p>
                    </div>
                  );
                })}
                {picks.length < 2 ? <div className="rounded-xl border border-dashed border-[rgba(155,135,255,.4)] p-3.5 text-center text-xs text-muted">Tick {picks.length ? "a second" : "two"} seat{picks.length ? "" : "s"}</div> : null}
              </div>
            </section>
            {peers && peers.marks != null && peers.seats.length ? (
              <section aria-label="People like you" className="mn-card-glass rounded-[20px] border border-line p-5">
                <h2 className="text-[15px] font-semibold text-heading">People near {formatMarks(peers.marks)} shortlisted</h2>
                <ul className="mt-3 grid gap-2.5 text-[13px]">
                  {peers.seats.slice(0, 4).map((x) => <li key={peerKey(x)} className="flex items-center justify-between gap-2"><span className="truncate">{x.speciality} · {x.hospital.split(",")[0]}</span><span className="text-muted">{x.peers}</span></li>)}
                </ul>
                <p className="mt-3 text-[11px] text-muted">Counts only, from members who share their shortlist.</p>
              </section>
            ) : null}
            {joining && joining.total.wasted ? (
              <section className="mn-card-glass rounded-[20px] border border-line p-5 text-[13px] text-muted">
                <p><span className="font-semibold text-heading">Seats go unused after joining.</span> In induction {joining.induction}, {joining.total.wasted.toLocaleString("en-US")} of {joining.total.seats.toLocaleString("en-US")} ({Math.round(joining.total.pct * 100)}%) were not taken up.</p>
                <Link href={`/portal/history/${joining.induction}/joining`} className="mt-2 inline-block text-[#A797FF]">See which →</Link>
              </section>
            ) : null}
          </aside>
        </div>
      )}

      {query ? <div><SaveView href={`/portal/finder?${query}`} label={`Finder${sp.marks ? `: ${sp.marks} marks` : ""}${sp.track ? `, ${sp.track.replace("|", " · ")}` : ""}`} /></div> : null}
      {shortlist.length ? (
        <Card>
          <CardHeader title="Your shortlist" description="Saved on your account. It feeds the preference planner." action={<ButtonLink href="/portal/workspace" variant="ghost" size="sm">Open Me</ButtonLink>} />
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {shortlist.map((x) => (
              <li key={`${x.program}|${x.quota}|${optionKey(x)}`} className="flex items-center justify-between gap-3 rounded-xl bg-white/[.03] px-3 py-2 text-sm">
                <span className="min-w-0"><span className="block truncate font-medium">{x.speciality}</span><span className="block truncate text-xs text-muted">{x.hospital} · {x.program} · {x.quota}</span></span>
                <Star saved item={{ program: x.program, quota: x.quota, speciality: x.speciality, hospital: x.hospital }} label={`${x.speciality} at ${x.hospital}`} />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <p className="text-xs text-subtle"><Icon name="spark" className="mr-1 inline h-3.5 w-3.5" />Past results do not guarantee future placement. meritNAMA is not an official admissions authority.</p>
    </AreaPage>
  );
}
