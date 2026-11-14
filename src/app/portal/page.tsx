import Link from "next/link";
import { AreaPage } from "@/components/area-page";
import { ChartSource } from "@/components/charts/chart-source";
import { LineChart } from "@/components/charts/line-chart";
import { whenDatabaseDown } from "@/components/database-unavailable";
import { EstimateListCard } from "@/components/estimate-list-card";
import { Icon } from "@/components/icon";
import { WasteTiles, wasteSentence } from "@/components/joining";
import { ProgramTag } from "@/components/program-tag";
import { PeerCount } from "@/components/rooms/peer-count";
import { RepBadge } from "@/components/community/rep-badge";
import { Badge } from "@/components/ui/badge";
import { AuroraHeader } from "@/components/ui/aurora-header";
import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Pill } from "@/components/ui/segmented";
import { cycleSteps, type CycleStep } from "@/lib/admin/today";
import { getSession } from "@/lib/auth/session";
import { myMerit } from "@/lib/data/candidates";
import { listThreads } from "@/lib/data/community";
import { computeOptions } from "@/lib/data/finder";
import { dataSources } from "@/lib/data/freshness";
import { latestJoining } from "@/lib/data/joining";
import { compareRounds, inductionTimeline, listInductionsWithRounds, marksStanding } from "@/lib/data/merit";
import { inductionRunning, predictRound } from "@/lib/data/predictions";
import { roomPulse } from "@/lib/data/rooms";
import { latestSchedule } from "@/lib/data/schedule";
import { featureFlags } from "@/lib/data/settings";
import { publishedEstimates } from "@/lib/data/simulation";
import { peerInterest, peerKey } from "@/lib/data/social";
import { ensureUser } from "@/lib/data/users";
import { getDb } from "@/lib/db/client";
import { PEER_MIN, PEER_WINDOW } from "@/lib/domain/social";
import { formatMarks } from "@/lib/format";
import { findSection } from "@/lib/navigation";

export const metadata = { title: "Overview" };
export const dynamic = "force-dynamic";

const IVORY = "text-[#F3EEE5]";
const IVORY_DIM = "text-[#F3EEE5]/65";
const fmt = (n: number) => n.toLocaleString("en-US");

function greeting(now: Date) {
  const h = Number(now.toLocaleString("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Karachi" }));
  return h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function ago(d: Date, now: Date) {
  const h = Math.round((now.getTime() - d.getTime()) / 3_600_000);
  return h < 1 ? "just now" : h < 36 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

/** A glass card inside the aurora hero. */
function HeroCard({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="grid content-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className={cn("text-sm font-semibold", IVORY)}>{title}</h2>
        {aside ? <span className="text-xs">{aside}</span> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * The member's home. While an induction's rounds are running: their marks, standing, chances
 * and seat in an aurora hero, then closing merit, what comes next, movement and the cycle.
 * When a new induction is announced and has no rounds yet: its dates and what to do first.
 */
export default async function OverviewPage() {
  const s = findSection("/portal");
  const frame = { area: "portal" as const, trail: [{ label: s.label }], isRoot: true, title: s.label, description: s.description };
  const down = await whenDatabaseDown(frame);
  if (down) return down;

  const db = getDb();
  const session = (await getSession())!;
  const now = new Date();
  const [inductions, merit, sources, peers, flags, estimates, schedule, joining, me] = await Promise.all([
    listInductionsWithRounds(db, session),
    myMerit(db, session).catch(() => null),
    dataSources(db, session),
    peerInterest(db, session, { limit: 200 }),
    featureFlags(db, session),
    publishedEstimates(db, session),
    latestSchedule(db, session),
    latestJoining(db, session),
    ensureUser(db, session).catch(() => null),
  ]);
  const latest = inductions[0] ?? null;
  const phf = schedule ? cycleSteps(schedule.rows, now) : [];
  const name = me?.displayName && !/^member-[0-9a-f]+$/i.test(me.displayName) ? me.displayName.split(" ")[0]! : null;

  // A newer induction is announced (PHF schedule in) but has no merit list yet.
  if (schedule && (!latest || schedule.induction > latest.id)) {
    const asking = flags.community ? await listThreads(db, session, { sort: "active", limit: 4 }).catch(() => []) : [];
    return <NewInduction frame={frame} induction={schedule.induction} rows={schedule.rows} steps={phf} running={latest} asking={asking} name={name} now={now} estimates={estimates.filter((e) => !e.official)} />;
  }

  const current = estimates.filter((e) => !e.official);
  const lastRound = latest?.rounds.at(-1) ?? null;
  const running = latest ? await inductionRunning(db, latest.id) : false;
  const mine = merit?.rows[0] ?? null;
  const mineTotal = mine ? inductions.find((i) => i.id === mine.induction)?.maxMarks ?? null : null;
  const [options, standing, timeline, previous, movement, ahead, pulse] = await Promise.all([
    mine && latest?.maxMarks && mineTotal ? computeOptions(db, { induction: latest.id, program: mine.program, quota: mine.quota, marks: mine.marks, total: mineTotal }).catch(() => null) : null,
    mine ? marksStanding(db, session, { induction: mine.induction, roundNo: mine.roundNo, program: mine.program, marks: mine.marks }) : null,
    latest ? inductionTimeline(db, session, latest.id) : [],
    inductions[1] ? inductionTimeline(db, session, inductions[1].id) : [],
    latest && lastRound && lastRound.roundNo > 1 ? compareRounds(db, session, latest.id, lastRound.roundNo - 1, lastRound.roundNo) : null,
    latest && lastRound && running ? predictRound(db, session, { induction: latest.id, fromRound: lastRound.roundNo }).catch(() => null) : null,
    flags.community ? roomPulse(db, session, { limit: 3 }) : null,
  ]);
  const count = (st: string) => options?.options.filter((o) => o.status === st).length ?? 0;
  const nearest = options ? options.options.filter((o) => o.status !== "out").sort((a, b) => b.lastClosing - a.lastClosing).slice(0, 5) : [];
  const peerOf = new Map(peers.seats.map((p) => [peerKey(p), p.peers]));
  const room = pulse?.rooms[0] ?? null;

  // Movement in the member's own programme and quota when known, else everywhere.
  const groups = (movement?.groups ?? []).filter((g) => g.delta != null && (!mine || (g.program.trim() === mine.program.trim() && g.quota.trim() === mine.quota.trim())));
  const falls = groups.filter((g) => g.delta! < -0.005).slice(0, 4);
  const rises = groups.filter((g) => g.delta! > 0.005).sort((a, b) => b.delta! - a.delta!).slice(0, 3);
  const median = (pick: "low" | "high") => {
    const v = (ahead?.specialities ?? []).map((r) => r[pick]).sort((a, b) => a - b);
    return v.length ? v[Math.floor(v.length / 2)]! : null;
  };
  const lastMedian = timeline.at(-1)?.medianClosing ?? null;
  const prevMedian = timeline.at(-2)?.medianClosing ?? null;
  const rounds = Math.max(timeline.length, previous.length);
  const myRounds = mine && latest ? new Map((merit?.rows ?? []).filter((r) => r.induction === latest.id).map((r) => [r.roundNo, r])) : new Map();
  const nextPhf = phf.find((x) => x.state === "next") ?? null;
  const joiningStep = phf.find((x) => /join/i.test(x.title));
  const afterJoining = joining && joining.induction === latest?.id && (!joiningStep || joiningStep.state === "done") ? joining : null;
  const finderHref = mine && latest ? `/portal/finder?marks=${mine.marks}&total=${mineTotal}&induction=${latest.id}&track=${encodeURIComponent(`${mine.program}|${mine.quota}`)}` : "/portal/finder";

  return (
    <AreaPage {...frame} bare title={`${greeting(now)}${name ? `, ${name}` : ""}`}>
      {/* ── Hero: you, at a glance ─────────────────────────────────────── */}
      <AuroraHeader as="section" className="grid gap-5 p-5 sm:p-7">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0">
            {lastRound ? (
              <p className={cn("flex items-center gap-2 text-xs", IVORY_DIM)}>
                <span aria-hidden className="h-2 w-2 rounded-full bg-success shadow-[0_0_10px_var(--mn-success)]" />
                Round {lastRound.roundNo} of induction {latest!.id} is {running ? "live" : "the last list"} · updated {ago(lastRound.importedAt, now)}
              </p>
            ) : null}
            <h1 className={cn("mt-2 text-3xl font-semibold tracking-tight sm:text-4xl", IVORY)}>{greeting(now)}{name ? `, ${name}` : ""}</h1>
            <p className={cn("mt-1 text-sm", IVORY_DIM)}>
              {mine ? (falls.length >= rises.length ? "Merit fell for most seats this round. Here is where you stand." : "Merit rose for most seats this round. Here is where you stand.") : "Link your applicant record and this page follows your own merit."}
            </p>
          </div>
          {mine ? (
            <div className="flex flex-wrap items-end gap-6">
              <div><p className={cn("text-xs", IVORY_DIM)}>Your marks</p><p className={cn("text-3xl font-semibold tabular-nums", IVORY)}>{formatMarks(mine.marks)}{mineTotal ? <span className={cn("ml-1 text-base", IVORY_DIM)}>/{mineTotal}</span> : null}</p></div>
              {standing ? <div><p className={cn("text-xs", IVORY_DIM)}>Percentile</p><p className={cn("text-3xl font-semibold tabular-nums", IVORY)}>{standing.percentile}<span className={cn("text-base", IVORY_DIM)}>th</span></p></div> : null}
              <Link href={finderHref} className="mn-btn inline-flex h-11 items-center rounded-xl px-4 text-sm font-semibold">Analyse my score →</Link>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Link href="/portal/workspace" className="mn-btn inline-flex h-11 items-center rounded-xl px-4 text-sm font-semibold">Link my record →</Link>
              <Link href="/portal/calculator" className="mn-btn-ghost inline-flex h-11 items-center rounded-xl px-4 text-sm">Calculate my marks</Link>
            </div>
          )}
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <HeroCard title="Your standing" aside={mine ? <span className={IVORY_DIM}>{mine.program.trim()} · {mine.quota.trim()}</span> : null}>
            {mine ? (
              <>
                <p className={cn("flex items-baseline justify-between text-lg font-semibold", IVORY)}>
                  <span>{standing ? (standing.percentile >= 75 ? "High" : standing.percentile >= 40 ? "Middle" : "Lower") : "On the list"}</span>
                  <span className="tabular-nums">{formatMarks(mine.marks)}{mineTotal ? <span className={cn("text-sm", IVORY_DIM)}> / {mineTotal}</span> : null}</span>
                </p>
                <p className={cn("text-xs", IVORY_DIM)}>{standing ? `Better than ${standing.percentile} of 100 placed in ${mine.program.trim()}, round ${mine.roundNo}.` : `Round ${mine.roundNo} of induction ${mine.induction}.`}</p>
              </>
            ) : (
              <p className={cn("text-sm", IVORY_DIM)}>Your marks and percentile show once your account is linked to your applicant record. <Link href="/portal/workspace" className="font-semibold text-violet-pale hover:underline">Link it on Me</Link>.</p>
            )}
          </HeroCard>
          <HeroCard title="Your chances" aside={<Link href={finderHref} className="font-semibold text-amber hover:underline">{options ? `See all ${fmt(options.options.length)} →` : "Score finder →"}</Link>}>
            {options ? (
              <dl className="grid grid-cols-3 gap-2">
                {([["safe", "Safe", "text-success"], ["borderline", "Target", "text-amber"], ["out", "Reach", "text-danger"]] as const).map(([k, l, tone]) => (
                  <div key={k}><dt className={cn("text-xs", IVORY_DIM)}>{l}</dt><dd className={cn("text-2xl font-semibold tabular-nums", tone)}>{count(k)}</dd></div>
                ))}
              </dl>
            ) : (
              <p className={cn("text-sm", IVORY_DIM)}>Put in your marks and see every speciality and hospital as safe, target or reach, against the last closing merit.</p>
            )}
          </HeroCard>
          <HeroCard title="Your seat" aside={mine?.consent ? <span className="text-amber">Consent: {mine.consent}</span> : null}>
            {mine ? (
              <>
                <p className={cn("font-semibold", IVORY)}>{mine.speciality} · {mine.hospital}</p>
                <p className={cn("text-xs", IVORY_DIM)}>Preference #{mine.preferenceNo || "—"} · round {mine.roundNo}{mine.closing != null ? ` · ${formatMarks(mine.marks - mine.closing)} above its closing` : ""}</p>
                {latest ? (
                  <ol className="grid grid-flow-col auto-cols-fr gap-1.5" aria-label="Your seat by round">
                    {[...latest.rounds.map((r) => r.roundNo), ...(running ? [latest.rounds.length + 1] : [])].map((n) => {
                      const r = myRounds.get(n);
                      const nextUp = running && n === latest.rounds.length + 1;
                      const same = r && r.speciality === mine.speciality && r.hospital === mine.hospital;
                      return (
                        <li key={n} className="grid gap-1 text-center">
                          <span title={r ? `${r.speciality} · ${r.hospital}` : nextUp ? "Next round" : "Not on this list"}
                            className={cn("h-5 rounded-md", nextUp ? "border border-dashed border-white/30" : !r ? "bg-danger/70" : same ? "bg-success shadow-[0_0_10px_var(--mn-success)]" : "bg-amber/80")} />
                          <span className={cn("text-[0.65rem]", IVORY_DIM)}>R{n}</span>
                        </li>
                      );
                    })}
                  </ol>
                ) : null}
              </>
            ) : lastRound ? (
              <p className={cn("text-sm", IVORY_DIM)}>Round {lastRound.roundNo}: {fmt(lastRound.allocations)} seats allocated. <Link href={`/portal/history/${latest!.id}/rounds/${lastRound.roundNo}`} className="font-semibold text-violet-pale hover:underline">Find yourself on the list</Link>.</p>
            ) : <p className={cn("text-sm", IVORY_DIM)}>No list yet.</p>}
          </HeroCard>
        </div>
      </AuroraHeader>

      {current.length ? <EstimateListCard estimates={current} title="Estimated merit list out" /> : null}

      {/* ── Closing merit, and what comes next ─────────────────────────── */}
      {latest && timeline.length ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Card>
            <CardHeader title="Median closing merit" description={`Induction ${latest.id}${inductions[1] && previous.length > 1 ? ` against ${inductions[1].id}` : ""}, across programmes, quotas and specialities${latest.maxMarks ? `, out of ${latest.maxMarks}` : ""}. Lower is easier.`} />
            <LineChart
              title={`Median closing merit per round, induction ${latest.id}`}
              xLabels={Array.from({ length: rounds }, (_, i) => `R${i + 1}`)}
              series={[
                { label: `Induction ${latest.id}`, values: Array.from({ length: rounds }, (_, i) => timeline[i]?.medianClosing ?? null) },
                ...(previous.length > 1 ? [{ label: `Induction ${inductions[1]!.id}`, tone: "muted" as const, values: Array.from({ length: rounds }, (_, i) => previous[i]?.medianClosing ?? null) }] : []),
              ]}
              height={200}
            />
            <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
              {lastMedian != null ? (
                <div>
                  <p className="text-xs text-muted">Round {timeline.length}</p>
                  <p className="text-3xl font-semibold tabular-nums text-heading">{formatMarks(lastMedian)}
                    {prevMedian != null ? <span className={cn("ml-2 text-sm", lastMedian <= prevMedian ? "text-success" : "text-danger")}>{lastMedian <= prevMedian ? "−" : "+"}{Math.abs(lastMedian - prevMedian).toFixed(2)}</span> : null}
                  </p>
                </div>
              ) : null}
              {ahead && median("low") != null ? (
                <div className="text-right">
                  <p className="text-xs text-muted">Round {ahead.toRound} likely <Badge tone="simulated">estimate</Badge></p>
                  <p className="text-xl font-semibold tabular-nums text-amber">{formatMarks(median("low")!)} – {formatMarks(median("high")!)}</p>
                </div>
              ) : null}
            </div>
            <ChartSource source={`PHF merit lists, induction ${latest.id}${inductions[1] ? ` and ${inductions[1].id}` : ""}`} />
          </Card>
          <NextCard latest={latest.id} lastRound={lastRound?.roundNo ?? null} running={running} estimates={current} nextPhf={nextPhf} afterJoining={afterJoining} />
        </div>
      ) : null}

      {afterJoining ? (
        <section aria-label="Wasted seats" className="grid gap-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-xl font-semibold text-heading">Induction {afterJoining.induction} after joining</h2>
            <Link href={`/portal/history/${afterJoining.induction}/joining`} className="text-sm font-semibold text-signal hover:underline">Where the wasted seats were →</Link>
          </div>
          <p className="text-sm text-muted">{wasteSentence(afterJoining.total)}</p>
          <WasteTiles w={afterJoining.total} />
        </section>
      ) : null}

      {/* ── Movement, and the cycle ───────────────────────────────────── */}
      <div className="grid gap-5 xl:grid-cols-2">
        {movement && latest ? (
          <Card>
            <CardHeader
              title={`Round ${movement.from.roundNo} → ${movement.to.roundNo}`}
              description={mine ? <>Biggest changes in <ProgramTag program={mine.program} quota={mine.quota} className="align-middle text-[0.85rem]" />.</> : "Biggest changes in closing merit across all programmes."}
              action={<Link href={`/portal/history/${latest.id}/compare?from=${movement.from.roundNo}&to=${movement.to.roundNo}`} className="text-sm font-medium text-signal hover:underline">Compare</Link>}
            />
            <dl className="grid grid-cols-3 gap-3 text-sm">
              {([["Entered", movement.movement.entered], ["Moved seat", movement.movement.moved], ["Left the list", movement.movement.left]] as const).map(([l, v]) => (
                <div key={l} className="rounded-lg border border-line px-3 py-2"><dt className="text-xs text-muted">{l}</dt><dd className="text-lg font-semibold tabular-nums text-heading">{fmt(v)}</dd></div>
              ))}
            </dl>
            {falls.length || rises.length ? (
              <ul className="mt-3 grid gap-1.5 text-sm">
                {[...falls, ...rises].map((g) => (
                  <li key={`${g.program}|${g.quota}|${g.speciality}`} className="flex items-baseline justify-between gap-3 border-b border-line pb-1.5 last:border-0">
                    <span className="flex min-w-0 items-center gap-2 truncate">{mine ? null : <ProgramTag program={g.program} className="text-xs" />}<span className="truncate">{g.speciality}</span></span>
                    <span className={cn("flex-none font-medium tabular-nums", g.delta! < 0 ? "text-success" : "text-danger")}>{g.delta! < 0 ? "−" : "+"}{Math.abs(g.delta!).toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-3 text-sm text-muted">Closing merit held in round {movement.to.roundNo}.</p>}
            <p className="mt-3 text-xs text-muted">Falls (green) mean the seat became easier to reach.</p>
          </Card>
        ) : null}
        {phf.length ? <CycleCard induction={schedule!.induction} steps={phf} /> : null}
      </div>

      {/* ── Options, people near you, the room ─────────────────────────── */}
      <div className="grid gap-5 xl:grid-cols-2">
        {nearest.length && mine ? (
          <Card>
            <CardHeader title="Highest seats your marks reach" description={`${mine.program.trim()} · ${mine.quota.trim()}, against round ${lastRound?.roundNo} closing merit.`} action={<Link href={finderHref} className="text-sm font-medium text-signal hover:underline">All options</Link>} />
            <ul className="divide-y divide-line text-sm">
              {nearest.map((o) => (
                <li key={`${o.speciality}|${o.hospital}`} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0"><span className="flex flex-wrap items-center gap-2 font-medium"><span className="truncate">{o.speciality}</span><PeerCount n={peerOf.get(peerKey({ program: mine.program, quota: mine.quota, speciality: o.speciality, hospital: o.hospital }))} /></span><span className="block truncate text-xs text-muted">{o.hospital}</span></span>
                  <span className="flex flex-none items-center gap-2"><span className="tabular-nums">{formatMarks(o.lastClosing)}</span><Pill tone={o.status === "safe" ? "success" : "amber"}>{o.status === "safe" ? "safe" : "target"}</Pill></span>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <Card>
            <CardHeader title="Popular near your marks" description={peers.marks == null ? "Seats that people with marks like yours have saved." : `What people within ${PEER_WINDOW} of your ${formatMarks(peers.marks)} have shortlisted.`} action={<Badge tone="calculated">Anonymous counts</Badge>} />
            {peers.marks == null ? (
              <p className="text-sm text-muted">Link your merit record, or <Link href="/portal/preferences" className="text-signal hover:underline">make a preference list with your expected marks</Link>, to see which seats people near you are weighing up.</p>
            ) : peers.seats.length ? (
              <ol className="divide-y divide-line text-sm">
                {peers.seats.slice(0, 5).map((p) => (
                  <li key={peerKey(p)} className="flex items-center justify-between gap-3 py-2"><span className="min-w-0"><span className="block truncate font-medium">{p.speciality}</span><span className="block truncate text-xs text-muted">{p.hospital} · {p.program} {p.quota}</span></span><span className="text-xs tabular-nums text-signal">{p.peers} people</span></li>
                ))}
              </ol>
            ) : <p className="text-sm text-muted">Counts appear once {PEER_MIN} or more people near your marks share a seat, so nobody can be singled out.</p>}
          </Card>
        )}
        {room ? (
          <Card>
            <CardHeader title={`Round room · induction ${room.induction}, round ${room.roundNo}`} description={room.today ? `${room.today} ${room.today === 1 ? "message" : "messages"} in the last day.` : "One-line chat on the latest round."} action={<Link href={`/portal/history/${room.induction}/rounds/${room.roundNo}#room`} className="text-sm font-medium text-signal hover:underline">Open the room</Link>} />
            {pulse!.preview.length ? (
              <ul className="grid gap-2 text-sm">
                {pulse!.preview.map((m) => (
                  <li key={m.id} className={cn("rounded-lg px-3 py-2", m.kind === "system" ? "border border-violet-soft/30 bg-[var(--mn-violet-fill)]" : "border border-line")}>
                    <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                      <span className="font-semibold text-heading">{m.kind === "system" ? "meritNAMA · round day" : m.mine ? "You" : m.author}</span>
                      {m.kind === "message" && m.verified && !m.team ? <Badge tone="success">Verified</Badge> : null}
                      <RepBadge level={m.level} />
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-ink">{m.body}</p>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted">Quiet so far. Be the first to say what moved for you.</p>}
          </Card>
        ) : null}
      </div>

      {sources.length ? (
        <details className="rounded-2xl border border-line bg-card px-5 py-4 text-sm">
          <summary className="cursor-pointer font-medium text-muted">Where these figures come from</summary>
          <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
            {sources.map((src) => (
              <div key={src.label} className="grid gap-0.5"><dt className="font-medium">{src.label}</dt><dd className="text-xs text-muted">{src.detail}</dd></div>
            ))}
          </dl>
        </details>
      ) : null}
    </AreaPage>
  );
}

/** What comes next: the estimate if one is out, else PHF's next step, else the cycle's state. */
function NextCard({ latest, lastRound, running, estimates, nextPhf, afterJoining }: {
  latest: number; lastRound: number | null; running: boolean;
  estimates: Awaited<ReturnType<typeof publishedEstimates>>; nextPhf: CycleStep | null;
  afterJoining: { total: { wasted: number; pct: number } } | null;
}) {
  const est = estimates[0];
  return (
    <Card>
      <CardHeader title={running && lastRound ? `Round ${lastRound + 1}` : running ? "Next" : `After induction ${latest}`} action={<Link href="/portal/calendar" className="mn-btn-ghost inline-flex h-8 items-center rounded-lg px-3 text-xs">Calendar</Link>} />
      <div className="grid place-items-center gap-2 py-4 text-center">
        {est ? (
          <>
            <p className="text-4xl font-semibold text-violet-pale">◆</p>
            <p className="text-lg font-semibold text-heading">Estimated round {est.roundNo} is out</p>
            <p className="text-sm text-muted">Built from the consent replies to round {est.roundNo - 1}. Not official.</p>
            <Link href={`/portal/estimates?run=${est.id}`} className="mn-btn mt-1 inline-flex h-9 items-center rounded-lg px-3 text-sm font-semibold">See the estimate</Link>
          </>
        ) : nextPhf ? (
          <>
            <p className="text-sm text-muted">Next on PHF&apos;s schedule</p>
            <p className="text-2xl font-semibold text-heading">{nextPhf.title}</p>
            <p className="text-sm text-amber">{nextPhf.when}</p>
          </>
        ) : !running ? (
          <>
            <p className="text-lg font-semibold text-heading">Induction {latest}&apos;s cycle is over</p>
            <p className="text-sm text-muted">{afterJoining ? "Joining has closed; the wasted seats are below." : "The last list is out."} The next induction shows here as soon as PHF announces its dates.</p>
            <Link href={`/portal/history/${latest}`} className="mn-btn-ghost mt-1 inline-flex h-9 items-center rounded-lg px-3 text-sm">Open induction {latest}</Link>
          </>
        ) : (
          <p className="text-sm text-muted">The next list comes after the consent window. The estimate shows here first.</p>
        )}
      </div>
    </Card>
  );
}

/** PHF's schedule as a vertical list: done, open now, next. */
function CycleCard({ induction, steps }: { induction: number; steps: CycleStep[] }) {
  const shown = [...steps.filter((x) => x.state === "done").slice(-2), ...steps.filter((x) => x.state !== "done").slice(0, 5)];
  return (
    <Card>
      <CardHeader title="This cycle" description={`Induction ${induction}, from PHF's schedule.`} action={<Link href="/portal/calendar" className="mn-btn-ghost inline-flex h-8 items-center rounded-lg px-3 text-xs">Open calendar</Link>} />
      <ol className="grid gap-2 border-l border-line pl-4">
        {shown.map((x, i) => (
          <li key={`${x.title}-${i}`} className="relative">
            <span aria-hidden className={cn("absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full", x.state === "done" ? "bg-success" : x.state === "now" ? "bg-amber shadow-[0_0_10px_var(--mn-amber)]" : "border border-violet-soft bg-canvas")} />
            <p className={cn("text-sm font-medium", x.state === "next" ? "text-muted" : "text-ink")}>{x.title}</p>
            <p className={cn("text-xs", x.state === "now" ? "text-amber" : "text-subtle")}>{x.state === "done" ? `done · ${x.when}` : x.when}</p>
          </li>
        ))}
      </ol>
    </Card>
  );
}

type Thread = Awaited<ReturnType<typeof listThreads>>[number];

/** Overview while a new induction is announced and has no list yet (mockup Overview22). */
function NewInduction({ frame, induction, rows, steps, running, asking, name, now, estimates }: {
  frame: { area: "portal"; trail: { label: string }[]; isRoot: boolean; title: string; description: string };
  induction: number;
  rows: { title: string; startsAt: Date | null; endsAt: Date | null }[];
  steps: CycleStep[];
  running: Awaited<ReturnType<typeof listInductionsWithRounds>>[number] | null;
  asking: Thread[];
  name: string | null;
  now: Date;
  estimates: Awaited<ReturnType<typeof publishedEstimates>>;
}) {
  const next = rows.find((r) => r.startsAt && r.startsAt > now) ?? null;
  const open = rows.find((r) => r.startsAt && r.startsAt <= now && (!r.endsAt || r.endsAt > now)) ?? null;
  const target = open?.endsAt ?? next?.startsAt ?? null;
  const left = target ? Math.max(0, target.getTime() - now.getTime()) : 0;
  const days = Math.floor(left / 86_400_000), hours = Math.floor((left % 86_400_000) / 3_600_000);
  return (
    <AreaPage {...frame} bare title={`${greeting(now)}${name ? `, ${name}` : ""}`}>
      {running ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-card px-4 py-2.5 text-sm">
          <Pill tone="success">Running</Pill>
          <span className="font-semibold text-heading">Induction {running.id}</span>
          <span className="text-muted">round {running.rounds.at(-1)?.roundNo} out</span>
          <span className="flex-1" />
          <Link href={`/portal/history/${running.id}`} className="font-semibold text-violet-pale hover:underline">Open induction {running.id} →</Link>
        </div>
      ) : null}
      <AuroraHeader as="section" className="grid gap-5 p-6 sm:p-8">
        <p className={cn("flex items-center gap-2 text-xs", IVORY_DIM)}><Pill tone="info">New induction</Pill> From PHF&apos;s schedule</p>
        <h1 className={cn("text-3xl font-semibold tracking-tight sm:text-5xl", IVORY)}>Induction {induction}</h1>
        <p className={cn("max-w-2xl text-sm", IVORY_DIM)}>No merit list yet. Work out your marks under the scoring policy, check the dates, and an estimated first list appears here once the candidates&apos; list is in.</p>
        <div className="flex flex-wrap items-center gap-3">
          {target ? (
            <>
              <span className="grid min-w-20 place-items-center rounded-xl border border-violet-soft/40 px-3 py-2"><span className={cn("text-2xl font-semibold tabular-nums", IVORY)}>{days}</span><span className={cn("text-xs", IVORY_DIM)}>days</span></span>
              <span className="grid min-w-20 place-items-center rounded-xl border border-violet-soft/40 px-3 py-2"><span className={cn("text-2xl font-semibold tabular-nums", IVORY)}>{String(hours).padStart(2, "0")}</span><span className={cn("text-xs", IVORY_DIM)}>hours</span></span>
              <span className={cn("max-w-32 text-sm", IVORY_DIM)}>{open ? `until ${open.title} closes` : `until ${next!.title}`}</span>
            </>
          ) : null}
          <Link href="/portal/calculator" className="mn-btn inline-flex h-11 items-center rounded-xl px-4 text-sm font-semibold">Calculate my marks →</Link>
          <Link href="/portal/guide" className="mn-btn-ghost inline-flex h-11 items-center rounded-xl px-4 text-sm">How it works</Link>
        </div>
      </AuroraHeader>
      {estimates.length ? <EstimateListCard estimates={estimates} title="Estimated merit list out" /> : null}
      <Card>
        <CardHeader title={`Induction ${induction} timeline`} action={<Link href="/portal/calendar" className="text-sm font-medium text-signal hover:underline">Calendar</Link>} />
        <ol className="grid grid-flow-col auto-cols-[minmax(9rem,1fr)] gap-3 overflow-x-auto pb-1">
          {steps.map((x, i) => (
            <li key={`${x.title}-${i}`} className="grid gap-1.5">
              <span className="flex items-center gap-2">
                <span aria-hidden className={cn("h-3.5 w-3.5 flex-none rounded-full", x.state === "done" ? "bg-success shadow-[0_0_10px_var(--mn-success)]" : x.state === "now" ? "border-2 border-violet-soft bg-[var(--mn-violet-fill)] shadow-[0_0_12px_var(--mn-violet-glow)]" : "border border-line-strong")} />
                <span aria-hidden className="h-px flex-1 bg-line" />
              </span>
              <span className={cn("text-sm font-semibold", x.state === "now" ? "text-violet-pale" : x.state === "next" ? "text-muted" : "text-heading")}>{x.title}</span>
              <span className="text-xs text-subtle">{x.when}</span>
            </li>
          ))}
        </ol>
      </Card>
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Your marks under the policy" description="From your details, with the scoring policy for this induction." />
          <p className="text-sm text-muted">Past closing merit can only be compared when the scoring scheme is the same. The calculator says which inductions compare.</p>
          <Link href="/portal/calculator" className="mn-btn mt-3 inline-flex h-9 w-fit items-center rounded-lg px-3 text-sm font-semibold">Open the calculator</Link>
        </Card>
        <Card>
          <CardHeader title="People are asking" action={<Link href="/portal/community" className="text-sm font-medium text-signal hover:underline">Community</Link>} />
          {asking.length ? (
            <ul className="grid gap-2">
              {asking.map((t) => (
                <li key={t.id}>
                  <Link href={`/portal/community/${t.id}`} className="flex items-start gap-3 rounded-lg p-1 hover:bg-hover/50">
                    <span className="grid h-9 min-w-9 place-items-center rounded-lg border border-line text-sm font-semibold tabular-nums">{t.helpful}</span>
                    <span className="min-w-0"><span className="block truncate text-sm font-medium text-heading">{t.title}</span><span className="text-xs text-muted">{t.replies} answer{t.replies === 1 ? "" : "s"}{t.answered ? " · answered" : ""}</span></span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">No questions yet.</p>}
          <Link href="/portal/community/new" className="mn-btn mt-3 inline-flex h-10 w-full items-center justify-center rounded-lg text-sm font-semibold">Ask about induction {induction}</Link>
        </Card>
      </div>
      <p className="text-xs text-subtle"><Icon name="spark" className="mr-1 inline h-3.5 w-3.5" />meritNAMA is independent and not an official admissions authority.</p>
    </AreaPage>
  );
}
