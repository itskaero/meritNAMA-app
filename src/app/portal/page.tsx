import Link from "next/link";
import { AreaPage } from "@/components/area-page";
import { whenDatabaseDown } from "@/components/database-unavailable";
import { EstimateListCard } from "@/components/estimate-list-card";
import { WasteTiles, wasteSentence } from "@/components/joining";
import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { cycleSteps, type CycleStep } from "@/lib/admin/today";
import { ChanceSparks, CycleGantt, Glass, IV, MedianChart, PrefRing, ReadinessArc, SeatStrip, StandingTicks, VideoHero, type CycleBar, type PrefChip } from "@/components/overview/overview-parts";
import { getSession } from "@/lib/auth/session";
import { myMerit } from "@/lib/data/candidates";
import { listThreads } from "@/lib/data/community";
import { computeOptions } from "@/lib/data/finder";
import { latestJoining } from "@/lib/data/joining";
import { consentReadiness, inductionTimeline, listInductionsWithRounds, marksStanding } from "@/lib/data/merit";
import { inductionRunning, predictRound } from "@/lib/data/predictions";
import { latestSchedule, seatMatrixTotal } from "@/lib/data/schedule";
import { calculatorPolicies } from "@/lib/data/policies";
import { policyInductions } from "@/lib/domain/scoring-policy";
import { NewInduction } from "@/components/overview/new-induction";
import { featureFlags } from "@/lib/data/settings";
import { gazetteCandidate, publishedEstimates } from "@/lib/data/simulation";
import { ensureUser } from "@/lib/data/users";
import { getDb } from "@/lib/db/client";
import { formatMarks } from "@/lib/format";
import { findSection } from "@/lib/navigation";

export const metadata = { title: "Overview" };
export const dynamic = "force-dynamic";

const fmt = (n: number) => n.toLocaleString("en-US");

function greeting(now: Date) {
  const h = Number(now.toLocaleString("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Karachi" }));
  return h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function ago(d: Date, now: Date) {
  const h = Math.round((now.getTime() - d.getTime()) / 3_600_000);
  return h < 1 ? "just now" : h < 36 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}


/**
 * The member's home. While an induction's rounds are running: their marks, standing, chances
 * and seat in an aurora hero, then closing merit, what comes next, movement and the cycle.
 * When a new induction is announced and has no rounds yet: its dates and what to do first.
 */
export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ chart?: string }> }) {
  const s = findSection("/portal");
  const frame = { area: "portal" as const, trail: [{ label: s.label }], isRoot: true, title: s.label, description: s.description };
  const down = await whenDatabaseDown(frame);
  if (down) return down;

  const db = getDb();
  const session = (await getSession())!;
  const now = new Date();
  const [inductions, merit, flags, estimates, schedule, joining, me] = await Promise.all([
    listInductionsWithRounds(db, session),
    myMerit(db, session).catch(() => null),
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
    const [asking, policies, seats] = await Promise.all([
      flags.community ? listThreads(db, session, { sort: "helpful", limit: 3 }).catch(() => []) : Promise.resolve([]),
      calculatorPolicies(db, session),
      seatMatrixTotal(db, session, schedule.induction),
    ]);
    const policyFor = (n: number) => policies.find((p) => policyInductions(p.policy).includes(n))?.policy ?? null;
    const mine = merit?.rows.find((r) => r.induction === latest?.id) ?? null;
    const current = estimates.filter((e) => !e.official);
    return (
      <AreaPage {...frame} bare title={`${greeting(now)}${name ? `, ${name}` : ""}`}>
        <NewInduction
          induction={schedule.induction} rows={schedule.rows} steps={phf} now={now} seats={seats}
          running={latest ? { id: latest.id, roundNo: latest.rounds.at(-1)?.roundNo ?? null, seat: mine ? `${mine.speciality} · ${mine.hospital.split(",")[0]}` : null } : null}
          asking={asking.map((t) => ({ id: t.id, title: t.title, replies: t.replies, helpful: Number(t.helpful) || 0, answered: Boolean(t.answered) }))}
          policy={policyFor(schedule.induction)} previous={latest ? policyFor(latest.id) : null}
          hasEstimate={current.some((e) => e.induction === schedule.induction)}
        />
        {current.length ? <EstimateListCard estimates={current} title="Estimated merit list out" /> : null}
      </AreaPage>
    );
  }

  const current = estimates.filter((e) => !e.official);
  const lastRound = latest?.rounds.at(-1) ?? null;
  const running = latest ? await inductionRunning(db, latest.id) : false;
  const mine = merit?.rows[0] ?? null;
  const mineTotal = mine ? inductions.find((i) => i.id === mine.induction)?.maxMarks ?? null : null;
  const sp = await searchParams;
  const chart = sp.chart === "inductions" ? "inductions" : "rounds";
  const [options, standing, timeline, ahead, readiness, record, perInduction] = await Promise.all([
    mine && latest?.maxMarks && mineTotal ? computeOptions(db, { induction: latest.id, program: mine.program, quota: mine.quota, marks: mine.marks, total: mineTotal }).catch(() => null) : null,
    mine ? marksStanding(db, session, { induction: mine.induction, roundNo: mine.roundNo, program: mine.program, marks: mine.marks }) : null,
    latest ? inductionTimeline(db, session, latest.id) : [],
    latest && lastRound && running ? predictRound(db, session, { induction: latest.id, fromRound: lastRound.roundNo }).catch(() => null) : null,
    latest && lastRound ? consentReadiness(db, session, { induction: latest.id, roundNo: lastRound.roundNo }).catch(() => null) : null,
    mine && latest ? gazetteCandidate(db, session, { induction: latest.id, applicantId: merit!.applicantId }).catch(() => null) : null,
    chart === "inductions" ? Promise.all(inductions.slice(0, 8).reverse().map(async (i) => ({ id: i.id, median: (await inductionTimeline(db, session, i.id)).at(-1)?.medianClosing ?? null }))) : Promise.resolve(null),
  ]);
  const count = (st: string) => options?.options.filter((o) => o.status === st).length ?? 0;
  const statusOf = new Map((options?.options ?? []).map((o) => [`${o.speciality}|${o.hospital}`, o]));
  const median = (pick: "low" | "high") => {
    const v = (ahead?.specialities ?? []).map((r) => r[pick]).sort((a, b) => a - b);
    return v.length ? v[Math.floor(v.length / 2)]! : null;
  };
  const values = chart === "inductions" ? (perInduction ?? []).filter((x) => x.median != null).map((x) => x.median!) : timeline.map((t) => t.medianClosing).filter((v): v is number => v != null);
  const labels = chart === "inductions" ? (perInduction ?? []).filter((x) => x.median != null).map((x) => `I${x.id}`) : timeline.map((t) => `R${t.roundNo}`);
  const lastMedian = timeline.at(-1)?.medianClosing ?? null;
  const prevMedian = timeline.at(-2)?.medianClosing ?? null;
  const joiningStep = phf.find((x) => /join/i.test(x.title));
  const afterJoining = joining && joining.induction === latest?.id && (!joiningStep || joiningStep.state === "done") ? joining : null;
  const finderHref = mine && latest ? `/portal/finder?marks=${mine.marks}&total=${mineTotal}&induction=${latest.id}&track=${encodeURIComponent(`${mine.program}|${mine.quota}`)}` : "/portal/finder";
  const myRounds = new Map((merit?.rows ?? []).filter((r) => r.induction === latest?.id).map((r) => [r.roundNo, r]));
  const prevSeat = mine ? myRounds.get(mine.roundNo - 1) : undefined;

  // The seat strip: every round, and the next one while the induction runs.
  const cells = latest ? [...latest.rounds.map((r) => r.roundNo), ...(running ? [latest.rounds.length + 1] : [])].map((n) => {
    const r = myRounds.get(n);
    const next = running && n === latest.rounds.length + 1;
    const state = next ? "next" as const : !r ? "none" as const : mine && r.speciality === mine.speciality && r.hospital === mine.hospital ? "seat" as const : "other" as const;
    return { label: `R${n}`, state, title: r ? `${r.speciality} · ${r.hospital}` : next ? "Next round" : "No seat" };
  }) : [];

  // The preference ring: the top six of the member's programme, against the last closing merit.
  const prog = record?.programmes.find((p) => mine && p.program.trim().toLowerCase() === mine.program.trim().toLowerCase() && p.preferences.length) ?? record?.programmes.find((p) => p.preferences.length);
  const prefs = prog ? [...prog.preferences].sort((a, b) => a.preferenceNo - b.preferenceNo) : [];
  // Short labels, as in the mockup ("Anaes · Mayo"): a long speciality is cut, a hospital is its first word.
  const short = (s: string) => s.replace(/^(Govt\.?|Government|Sheikh|Sir|DHQ|THQ|The)\s+/i, "").split(/[ ,]/)[0]!;
  const spec = (s: string) => (s.length > 9 ? `${s.slice(0, 6)}.` : s);
  const chips: PrefChip[] = prefs.slice(0, 6).map((x) => {
    const seat = mine && x.speciality === mine.speciality && x.hospital === mine.hospital;
    const o = statusOf.get(`${x.speciality}|${x.hospital}`);
    const tone = seat ? "seat" : o?.status === "safe" ? "safe" : o?.status === "borderline" ? "target" : "reach";
    return { n: x.preferenceNo, label: `${spec(x.speciality)} · ${short(x.hospital)}`, note: seat ? "your seat" : tone === "reach" && o ? `needs ${formatMarks(o.lastClosing)}` : tone, tone };
  });

  // This cycle: PHF's steps, the latest list and the estimate, around today.
  const day = 86_400_000;
  const bars: CycleBar[] = [
    ...(schedule?.rows ?? []).filter((r) => r.startsAt || r.endsAt).map((r) => {
      const from = r.startsAt ?? new Date(r.endsAt!.getTime() - day), to = r.endsAt ?? new Date(from.getTime() + day);
      const tone = to < now ? "done" as const : from <= now && /consent|joining/i.test(r.title) ? "due" as const : "expected" as const;
      return { label: `${r.title}${tone === "done" ? " · done" : ""}`, from, to, tone };
    }),
    ...(lastRound ? [{ label: `Round ${lastRound.roundNo}`, from: lastRound.importedAt, to: new Date(lastRound.importedAt.getTime() + 2 * day), tone: "list" as const }] : []),
    ...current.slice(0, 1).map((e) => ({ label: `Round ${e.roundNo} estimate`, from: e.publishedAt, to: new Date(e.publishedAt.getTime() + 3 * day), tone: "estimate" as const })),
  ].sort((a, b) => a.from.getTime() - b.from.getTime());

  return (
    <AreaPage {...frame} bare title={`${greeting(now)}${name ? `, ${name}` : ""}`}>
      <VideoHero>
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            {lastRound ? (
              <p className={cn("flex items-center gap-2 text-[13px]", IV)}>
                <span aria-hidden className="mn-live h-2 w-2 rounded-full bg-[#3DDC97] shadow-[0_0_10px_#3DDC97]" />
                Round {lastRound.roundNo} is {running ? "live" : "the last list"} · updated {ago(lastRound.importedAt, now)}
              </p>
            ) : null}
            <h1 className="mt-2 text-[2rem] font-bold leading-tight tracking-[-0.03em] sm:text-[42px]">{greeting(now)}{name ? `, ${name}!` : ""}</h1>
            <p className={cn("mt-1.5", IV)}>{mine ? (lastMedian != null && prevMedian != null && lastMedian <= prevMedian ? "Merit fell for most seats this round. Here's where you stand." : "Merit rose for most seats this round. Here's where you stand.") : "Link your applicant record and this page follows your own merit."}</p>
          </div>
          {mine ? (
            <div className="flex flex-wrap items-end gap-7">
              <div><p className={cn("text-xs", IV)}>Your marks</p><p className="mt-0.5 text-[32px] font-semibold tracking-[-0.02em] tabular-nums">{formatMarks(mine.marks)} {mineTotal ? <span className={cn("text-sm", IV)}>/ {mineTotal}</span> : null}</p></div>
              {standing ? <div><p className={cn("text-xs", IV)}>Percentile</p><p className="mt-0.5 text-[32px] font-semibold tracking-[-0.02em] tabular-nums">{standing.percentile}<span className={cn("text-sm", IV)}>th</span></p></div> : null}
              <Link href={finderHref} className="mn-btn inline-flex h-11 items-center rounded-xl px-5 font-semibold">Analyse my score →</Link>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Link href="/portal/workspace" className="mn-btn inline-flex h-11 items-center rounded-xl px-5 font-semibold">Link my record →</Link>
              <Link href="/portal/calculator" className="mn-btn-ghost inline-flex h-11 items-center rounded-xl px-4 text-sm">Calculate my marks</Link>
            </div>
          )}
        </header>
        <div className="grid gap-4 lg:grid-cols-3">
          <Glass title="Your standing" aside={mine ? <span className={IV}>{mine.program.trim()} · {mine.quota.trim()}</span> : null}>
            {mine && standing ? (
              <>
                <div className="mt-4 flex justify-between text-lg font-semibold"><span>{standing.percentile >= 75 ? "High" : standing.percentile >= 40 ? "Middle" : "Lower"}</span><span className="tabular-nums">{formatMarks(mine.marks)} {mineTotal ? <span className={cn("text-[13px]", IV)}>/ {mineTotal}</span> : null}</span></div>
                <StandingTicks percentile={standing.percentile} />
                <p className={cn("mt-3 text-xs", IV)}>Better than {standing.percentile} of 100 candidates placed in {mine.program.trim()}.</p>
              </>
            ) : <p className={cn("mt-3 text-sm", IV)}>Your standing shows once your account is linked to your applicant record. <Link href="/portal/workspace" className="font-semibold text-[#A797FF]">Link it on Me</Link>.</p>}
          </Glass>
          <Glass title="Your chances" aside={<Link href={finderHref} className="text-[#E5A04B]">{options ? `See all ${options.options.length} →` : "Score finder →"}</Link>}>
            {options ? <ChanceSparks safe={count("safe")} target={count("borderline")} reach={count("out")} /> : <p className={cn("mt-3 text-sm", IV)}>Put in your marks and see every seat as safe, target or reach against the last closing merit.</p>}
          </Glass>
          <Glass title="Your seat" aside={mine?.consent ? <span className="font-semibold text-[#FF7A7A]">Consent: {mine.consent}</span> : null}>
            {mine ? (
              <>
                <p className="mt-3.5 text-[17px] font-semibold">{mine.speciality} · {mine.hospital.split(",")[0]}</p>
                <p className={cn("mt-0.5 text-[13px]", IV)}>Preference #{mine.preferenceNo || "?"} {prevSeat && prevSeat.preferenceNo && mine.preferenceNo && mine.preferenceNo < prevSeat.preferenceNo ? <span className="text-[#3DDC97]">▲ from #{prevSeat.preferenceNo}</span> : null}</p>
                <SeatStrip cells={cells} />
              </>
            ) : lastRound ? <p className={cn("mt-3 text-sm", IV)}>Round {lastRound.roundNo}: {fmt(lastRound.allocations)} seats allocated. <Link href={`/portal/history/${latest!.id}/rounds/${lastRound.roundNo}`} className="font-semibold text-[#A797FF]">Find yourself</Link>.</p> : null}
          </Glass>
        </div>
      </VideoHero>

      {current.length ? <EstimateListCard estimates={current} title="Estimated merit list out" /> : null}

      {latest && values.length > 1 ? (
        <div className="grid gap-[18px] lg:grid-cols-3">
          <section aria-label="Median closing merit" className="mn-card-glass mn-hover rounded-[20px] border border-line p-5 lg:col-span-2 [background:radial-gradient(520px_260px_at_100%_100%,rgba(110,86,255,.16),transparent_70%),rgba(23,23,28,.78)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="text-[15px] font-semibold text-heading">Median closing merit</h2><p className="mt-0.5 text-xs text-muted">{chart === "rounds" ? `Induction ${latest.id}, every programme` : "Last round of each induction"} · lower is easier</p></div>
              <nav aria-label="Range" className="mn-seg"><Link href="/portal" aria-current={chart === "rounds" ? "page" : undefined}>Rounds</Link><Link href="/portal?chart=inductions" aria-current={chart === "inductions" ? "page" : undefined}>Inductions</Link></nav>
            </div>
            <MedianChart values={values} labels={labels} />
            <div className="mt-2.5 flex items-end justify-between">
              {lastMedian != null ? <p><span className="block text-xs text-muted">Round {timeline.length}</span><span className="text-4xl font-semibold tracking-[-0.02em] tabular-nums text-heading">{formatMarks(lastMedian)}</span>{prevMedian != null ? <sup className={cn("ml-1 text-sm", lastMedian <= prevMedian ? "text-[#3DDC97]" : "text-[#FF7A7A]")}>{lastMedian <= prevMedian ? "−" : "+"}{Math.abs(lastMedian - prevMedian).toFixed(2)}</sup> : null}</p> : <span />}
              {ahead && median("low") != null ? <p className="text-right"><span className="block text-xs text-muted">Round {ahead.toRound} likely</span><span className="text-lg font-semibold text-[#E5A04B]">{formatMarks(median("low")!)} – {formatMarks(median("high")!)}</span></p> : null}
            </div>
          </section>
          {readiness && lastRound ? (
            <section aria-label="Readiness" className="mn-card-glass mn-hover rounded-[20px] border border-line p-5">
              <div className="flex items-center justify-between"><h2 className="text-[15px] font-semibold text-heading">{running ? `Round ${lastRound.roundNo + 1} readiness` : `Round ${lastRound.roundNo} consent`}</h2><Link href="/portal/calendar" className="mn-btn-ghost inline-flex h-[30px] items-center rounded-[9px] px-3 text-xs">Calendar</Link></div>
              <ReadinessArc share={readiness.share} label="of consent replies are in" />
              <p className="mt-2 flex flex-wrap gap-3 text-xs text-muted">{readiness.byProgram.slice(0, 3).map((b) => <span key={b.program}><span className="text-[#FF7A7A]">●</span> {fmt(b.replied)} {b.program}</span>)}</p>
              <p className="mt-3.5 border-t border-line pt-3 text-xs text-muted">{running ? "The next estimate is built once the replies are in; a person checks it before it is published." : `${fmt(readiness.replied)} of ${fmt(readiness.placed)} replied to round ${lastRound.roundNo}.`}</p>
            </section>
          ) : <NextCard latest={latest.id} lastRound={lastRound?.roundNo ?? null} running={running} estimates={current} nextPhf={phf.find((x) => x.state === "next") ?? null} afterJoining={afterJoining} />}
        </div>
      ) : null}

      <div className="grid gap-[18px] lg:grid-cols-3">
        {chips.length && mine ? <PrefRing marks={formatMarks(mine.marks)} chips={chips} total={prefs.length} href={finderHref} /> : (
          <section aria-label="Your preferences" className="mn-card-glass rounded-[20px] border border-line p-5">
            <h2 className="text-[15px] font-semibold text-heading">Your preferences</h2>
            <p className="mt-2 text-sm text-muted">Your portal preferences show here once your account is linked and the induction&apos;s portal data is in. Meanwhile, <Link href="/portal/preferences" className="text-[#A797FF]">plan a list</Link>.</p>
          </section>
        )}
        <section aria-label="This cycle" className="mn-card-glass mn-hover rounded-[20px] border border-line p-5 lg:col-span-2">
          <div className="flex items-center justify-between"><div><h2 className="text-[15px] font-semibold text-heading">This cycle</h2><p className="mt-0.5 text-xs text-muted">What&apos;s waiting for you</p></div><Link href="/portal/calendar" className="mn-btn-ghost inline-flex h-[30px] items-center rounded-[9px] px-3 text-xs">Open calendar</Link></div>
          <CycleGantt bars={bars} now={now} />
        </section>
      </div>

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
