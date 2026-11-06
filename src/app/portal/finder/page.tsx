import Link from "next/link";
import { AreaPage } from "@/components/area-page";
import { LineChart } from "@/components/charts/line-chart";
import { CountUp } from "@/components/charts/count-up";
import { whenDatabaseDown } from "@/components/database-unavailable";
import { EntityLink } from "@/components/entity-link";
import { STATUS_STYLE, StatusIcon, StatusPill } from "@/components/finder/status";
import { Icon } from "@/components/icon";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { selectClass } from "@/components/ui/styles";
import { getSession } from "@/lib/auth/session";
import { myMerit } from "@/lib/data/candidates";
import { releasedBeforeFinal } from "@/lib/data/insights";
import { inductionRunning, predictRound } from "@/lib/data/predictions";
import { ChanceDial } from "@/components/charts/chance-dial";
import { snippetParam } from "@/lib/domain/community";
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
        className={cn("grid h-8 w-8 place-items-center rounded-full text-lg leading-none transition-colors", saved ? "text-ember-hot" : "text-subtle hover:text-ink")}
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
  const [opts, mine] = await Promise.all([finderOptions(db, session), myMerit(db, session).catch(() => null)]);
  // A verified candidate's latest official marks fill the form when nothing is entered yet.
  const own = !sp.marks ? mine?.rows[0] : undefined;
  if (opts.inductions.length === 0) {
    return (
      <AreaPage {...frame}>
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
  const marks = num(sp.marks);
  const view = sp.view === "grid" ? "grid" : "list";
  const show = oneOf(sp.show, STATUSES);

  const href = (patch: Partial<Params>) => {
    const p = new URLSearchParams();
    const merged: Params = { marks: sp.marks, total: String(total), induction: String(induction.id), track: trackValue, view, show, a: sp.a, b: sp.b, ...patch };
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
  const compareLabels = [...new Set(histories.flat().map((h) => `I${h.inductionId} R${h.roundNo}`))].sort((x, y) => {
    const [ai, ar] = x.slice(1).split(" R").map(Number), [bi, br] = y.slice(1).split(" R").map(Number);
    return ai! - bi! || ar! - br!;
  });
  const pickHref = (o: FinderOption) => {
    const key = optionKey(o);
    if (sp.a === key || sp.b === key) return href({ a: sp.a === key ? sp.b : sp.a, b: undefined });
    return sp.a && !sp.b ? href({ b: key }) : href({ a: key, b: undefined });
  };
  const isPicked = (o: FinderOption) => [sp.a, sp.b].includes(optionKey(o));

  const options = result?.options ?? [];
  // Seats declined or not taken before the final round: why waiting can pay for Borderline options.
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

  return (
    <AreaPage {...frame}>
      <Card>
        <form method="get" className="grid gap-4 md:grid-cols-[repeat(4,minmax(0,1fr))_auto] md:items-end">
          <label className="grid gap-1.5 text-sm font-medium">
            Your marks
            <span className="flex items-center gap-2">
              <input name="marks" inputMode="decimal" required defaultValue={sp.marks ?? (own ? own.marks.toFixed(4) : "")} placeholder="e.g. 22.5" className={cn(selectClass, "font-mono")} />
              <span className="whitespace-nowrap text-sm text-muted">of</span>
              <input name="total" inputMode="decimal" defaultValue={String(total)} aria-label="Out of (total marks)" className={cn(selectClass, "w-20 font-mono")} />
            </span>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Programme · quota
            <select name="track" defaultValue={trackValue} className={selectClass}>
              {induction.tracks.map((t) => <option key={`${t.program}|${t.quota}`} value={`${t.program}|${t.quota}`}>{t.program} · {t.quota}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Compare with
            <select name="induction" defaultValue={induction.id} className={selectClass}>
              {opts.inductions.map((i) => <option key={i.id} value={i.id}>Induction {i.id} (out of {i.total})</option>)}
            </select>
          </label>
          <input type="hidden" name="view" value={view} />
          <Button type="submit" className="md:self-end">Find options</Button>
        </form>
        {own ? <p className="mt-3 text-xs font-medium text-success">Filled in from your verified record: induction {own.induction}, round {own.roundNo} (out of {total}).</p> : null}
        <p className="mt-3 text-xs text-subtle">
          {opts.activePolicy ? `Your marks are on the current policy (${opts.activePolicy}, out of ${opts.defaultTotal}). ` : ""}
          Inductions are compared in percent of their total, so a score out of 30 lines up with one out of 35. Weights of the parts differ between years, so treat this as a guide, not a guarantee.
        </p>
      </Card>

      {error ? <Notice tone="warning" title="Check your marks">{error}</Notice> : null}

      {!result ? (
        <Card>
          <CardHeader title="How it works" />
          <ol className="grid gap-3 text-sm text-muted sm:grid-cols-3">
            <li className="rounded-xl bg-elevated p-4"><StatusPill status="safe" /><p className="mt-2">Your score reached the closing merit in the first round. You would have had this seat from the start.</p></li>
            <li className="rounded-xl bg-elevated p-4"><StatusPill status="borderline" /><p className="mt-2">Below the first-round closing, but seats freed up later and the final round closed at or below your score.</p></li>
            <li className="rounded-xl bg-elevated p-4"><StatusPill status="out" /><p className="mt-2">Below the closing merit even in the final round.</p></li>
          </ol>
        </Card>
      ) : (
        <>
          <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="mn-rise rounded-[1.5rem] border border-ember/40 bg-[linear-gradient(140deg,color-mix(in_srgb,var(--mn-ember-deep)_35%,var(--mn-navy-900)),var(--mn-navy-900)_70%)] p-5">
              <p className="text-xs text-muted">Your score</p>
              <p className="mt-3 font-display text-4xl font-extrabold tracking-tight [font-stretch:110%]">{pct(result.mePct)}</p>
              <p className="mt-1 text-xs text-subtle">{marks} of {total} · compared with induction {induction.id} (out of {induction.total})</p>
            </div>
            {STATUSES.map((st, i) => (
              <Link
                key={st}
                href={href({ show: show === st ? undefined : st })}
                aria-pressed={show === st}
                className={cn("mn-rise rounded-[1.5rem] border bg-surface p-5 transition-colors hover:bg-elevated", show === st ? "border-ink" : "border-line")}
                style={{ animationDelay: `${(i + 1) * 70}ms` }}
              >
                <p className="flex items-center gap-2 text-xs text-muted"><StatusIcon status={st} className={cn("h-2.5 w-2.5", STATUS_STYLE[st].text)} />{STATUS_LABEL[st]}</p>
                <p className="mt-3 font-display text-4xl font-extrabold tracking-tight [font-stretch:110%]"><CountUp value={counts[st]} /></p>
                <p className="mt-1 text-xs text-subtle">{show === st ? "Showing only these · select to show all" : "options · select to show only these"}</p>
              </Link>
            ))}
          </section>

          {picks.length ? (
            <Card>
              <CardHeader
                title={picks.length === 2 ? "Compare two options" : "Pick a second option to compare"}
                description={`${program} · ${quota} · closing merit as percent of each induction's total.`}
                action={<ButtonLink href={href({ a: undefined, b: undefined })} variant="ghost" size="sm">Clear</ButtonLink>}
              />
              <div className="grid gap-4 md:grid-cols-2">
                {picks.map((p, i) => {
                  const o = options.find((x) => x.speciality === p.speciality && x.hospital === p.hospital);
                  return (
                    <div key={optionKey(p)} className={cn("rounded-2xl border p-4", i === 0 ? "border-ember/50" : "border-line-strong")}>
                      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: i === 0 ? "var(--mn-ember-hot)" : "var(--mn-text-muted)" }}>Option {i === 0 ? "A" : "B"}</p>
                      <p className="mt-1 font-semibold">{p.speciality}</p>
                      <p className="text-sm text-muted">{p.hospital}</p>
                      {o && result ? (
                        <div className="mt-3">
                          <ChanceDial mePct={result.mePct} firstPct={o.firstPct} lastPct={o.lastPct} firstRound={o.firstRound} lastRound={o.lastRound} predicted={nextBand(o)} note={`Induction ${induction.id}: R${o.firstRound} ${o.firstClosing.toFixed(2)} → R${o.lastRound} ${o.lastClosing.toFixed(2)} of ${induction.total}`} />
                        </div>
                      ) : <p className="mt-3 text-sm text-subtle">Not offered in induction {induction.id}.</p>}
                      {(() => {
                        const last = histories[i]!.at(-1);
                        if (!last) return null;
                        const card = snippetParam({ induction: last.inductionId, round: last.roundNo, program, quota, speciality: p.speciality, hospital: p.hospital });
                        return (
                          <Link href={`/portal/community/new?${new URLSearchParams({ topic: `round|${last.inductionId}:${last.roundNo}`, snippet: card })}`} className="mt-3 inline-block text-sm font-semibold text-signal hover:underline">
                            Ask about this →
                          </Link>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
              {compareLabels.length ? (
                <div className="mt-4">
                  <LineChart
                    title="Closing merit of the chosen options, percent of total, by induction and round"
                    xLabels={compareLabels}
                    series={picks.map((p, i) => ({
                      label: `${i === 0 ? "A" : "B"}: ${p.speciality}, ${p.hospital}`,
                      tone: i === 0 ? ("ember" as const) : ("teal" as const),
                      values: compareLabels.map((l) => histories[i]!.find((h) => `I${h.inductionId} R${h.roundNo}` === l)?.pct ?? null),
                      details: compareLabels.map((l) => {
                        const h = histories[i]!.find((x) => `I${x.inductionId} R${x.roundNo}` === l);
                        return h ? h.closing.toFixed(2) : null;
                      }),
                    }))}
                    format={(v) => `${v.toFixed(1)}%`}
                  />
                  {result ? <p className="mt-2 text-xs text-subtle">Your score: {pct(result.mePct)}.</p> : null}
                </div>
              ) : null}
            </Card>
          ) : null}

          <Card>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">{visible.length} options · {program} · {quota}</h2>
                <p className="mt-1 text-sm text-muted">Select a hospital to compare it; ☆ adds it to your shortlist ({shortlist.length} saved).</p>
              </div>
              <nav aria-label="View" className="inline-flex rounded-full border border-line bg-canvas p-1">
                {(["list", "grid"] as const).map((v) => (
                  <Link key={v} href={href({ view: v })} aria-current={view === v ? "page" : undefined} className={cn("rounded-full px-4 py-1.5 text-sm font-semibold", view === v ? "bg-ink text-canvas" : "text-muted hover:text-ink")}>
                    {v === "list" ? "List" : "Heatmap"}
                  </Link>
                ))}
              </nav>
            </div>

            {visible.length === 0 ? (
              <EmptyState title="No options in this view" action={<ButtonLink href={href({ show: undefined })} variant="secondary">Show all</ButtonLink>} />
            ) : view === "list" ? (
              <div className="grid gap-4">
                {[...bySpeciality].map(([spec, rows], gi) => (
                  <section key={spec} className="mn-rise rounded-2xl border border-line" style={{ animationDelay: `${Math.min(gi, 8) * 40}ms` }}>
                    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
                      <h3 className="font-semibold"><EntityLink kind="speciality" id={rows[0]!.specialityId} name={spec} /></h3>
                      <span className="flex flex-wrap gap-1.5">
                        {STATUSES.map((st) => { const n = rows.filter((r) => r.status === st).length; return n ? <span key={st} className={cn("rounded-full border px-2 py-0.5 font-mono text-xs", STATUS_STYLE[st].pill)}>{n} {STATUS_LABEL[st].toLowerCase()}</span> : null; })}
                      </span>
                    </header>
                    <ul className="divide-y divide-line">
                      {rows.map((o) => (
                        <li key={o.hospital} className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm sm:grid-cols-[minmax(0,1fr)_7rem_9rem_auto]", isPicked(o) && "bg-ember/10")}>
                          <span className="min-w-0">
                            <Link href={pickHref(o)} className="block truncate hover:text-signal hover:underline" aria-label={`${isPicked(o) ? "Remove from comparison" : "Compare"}: ${o.hospital}`}>
                              {o.hospital}
                            </Link>
                            {o.status === "borderline" && released.get(`${o.speciality}|${o.hospital}`) ? (
                              <span className="block text-[0.7rem] text-amber">{released.get(`${o.speciality}|${o.hospital}`)} {released.get(`${o.speciality}|${o.hospital}`) === 1 ? "seat" : "seats"} freed before the final round</span>
                            ) : null}
                            {o.status !== "safe" && nextBand(o) ? (
                              <span className="block text-[0.7rem] text-signal" title="Estimate from how closing merit moved at this point in other inductions. Not official.">
                                Next round likely {nextBand(o)!.lowPct.toFixed(1)}–{nextBand(o)!.highPct.toFixed(1)}% · {nextBand(o)!.confidence.toLowerCase()} confidence
                              </span>
                            ) : null}
                          </span>
                          <span className="sm:order-none"><StatusPill status={o.status} /></span>
                          <span className="col-span-2 text-xs text-muted sm:col-span-1 sm:text-right" title={`Round ${o.firstRound}: ${o.firstClosing.toFixed(2)} · round ${o.lastRound}: ${o.lastClosing.toFixed(2)} (out of ${induction.total})`}>
                            R{o.firstRound} {pct(o.firstPct)} → R{o.lastRound} <span className="font-semibold text-ink">{pct(o.lastPct)}</span>
                            <span className="block font-mono text-[0.7rem] text-subtle">{o.lastClosing.toFixed(2)} / {induction.total}</span>
                          </span>
                          <span className="col-start-2 row-start-1 sm:col-start-auto sm:row-start-auto">
                            <Star saved={saved.has(optionKey(o))} item={{ program, quota, speciality: o.speciality, hospital: o.hospital }} label={`${o.speciality} at ${o.hospital}`} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            ) : (
              <>
                <div className="relative max-h-[70vh] overflow-auto rounded-2xl border border-line">
                  <table className="border-separate border-spacing-0 text-xs">
                    <caption className="sr-only">Heatmap of options: rows are specialities, columns are hospitals, each cell shows the status for your score</caption>
                    <thead>
                      <tr>
                        <th scope="col" className="sticky left-0 top-0 z-[2] bg-elevated px-3 py-2 text-left font-medium text-muted">Speciality</th>
                        {hospitals.map((h) => (
                          <th key={h} scope="col" className="sticky top-0 z-[1] h-40 min-w-8 bg-elevated px-1 align-bottom font-medium text-muted">
                            <span className="block max-h-36 overflow-hidden whitespace-nowrap py-2 [writing-mode:vertical-rl] rotate-180" title={h}>{h}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...bySpeciality].map(([spec, rows]) => {
                        const at = new Map(rows.map((r) => [r.hospital, r]));
                        return (
                          <tr key={spec}>
                            <th scope="row" className="sticky left-0 z-[1] max-w-48 truncate border-t border-line bg-surface px-3 py-1.5 text-left font-normal text-ink">{spec}</th>
                            {hospitals.map((h) => {
                              const o = at.get(h);
                              return (
                                <td key={h} className="border-t border-line p-0.5">
                                  {o ? (
                                    <Link
                                      href={pickHref(o)}
                                      title={`${spec} · ${h}: ${STATUS_LABEL[o.status]}, final round ${pct(o.lastPct)} (${o.lastClosing.toFixed(2)} / ${induction.total})`}
                                      className={cn("grid h-7 w-7 place-items-center rounded-md text-[0.7rem] font-bold text-canvas transition-colors", STATUS_STYLE[o.status].cell, isPicked(o) && "ring-2 ring-ember-hot")}
                                    >
                                      {o.status === "out" ? null : <StatusIcon status={o.status} className="h-3 w-3" />}
                                      <span className="sr-only">{`${spec} at ${h}: ${STATUS_LABEL[o.status]}`}</span>
                                    </Link>
                                  ) : <span aria-hidden className="block h-7 w-7" />}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 flex flex-wrap gap-4 text-xs text-muted">
                  {STATUSES.map((st) => <span key={st} className="inline-flex items-center gap-2"><span aria-hidden className={cn("h-3 w-3 rounded", STATUS_STYLE[st].cell)} />{STATUS_LABEL[st]}</span>)}
                  <span>Empty: not offered. Select a cell to compare.</span>
                </p>
              </>
            )}
          </Card>
        </>
      )}

      {shortlist.length ? (
        <Card>
          <CardHeader title="Your shortlist" description="Saved on your account. It will feed the preference planner." action={<ButtonLink href="/portal/workspace" variant="ghost" size="sm">Open workspace</ButtonLink>} />
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {shortlist.map((x) => (
              <li key={`${x.program}|${x.quota}|${optionKey(x)}`} className="flex items-center justify-between gap-3 rounded-xl bg-elevated px-3 py-2 text-sm">
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
