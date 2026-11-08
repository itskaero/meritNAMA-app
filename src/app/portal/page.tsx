import Link from "next/link";
import { ChartSource } from "@/components/charts/chart-source";
import { AreaPage } from "@/components/area-page";
import { CycleGauge, gaugeProps } from "@/components/charts/cycle-gauge";
import { LineChart } from "@/components/charts/line-chart";
import { RoundFunnel } from "@/components/charts/round-funnel";
import { StatTiles } from "@/components/charts/stat-tiles";
import { whenDatabaseDown } from "@/components/database-unavailable";
import { StatusIcon } from "@/components/finder/status";
import { ProgramTag } from "@/components/program-tag";
import { Icon } from "@/components/icon";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { getSession } from "@/lib/auth/session";
import { myMerit } from "@/lib/data/candidates";
import { computeOptions } from "@/lib/data/finder";
import { dataSources } from "@/lib/data/freshness";
import { roundSettling } from "@/lib/data/insights";
import { compareRounds, inductionTimeline, latestRoundChange, listInductionsWithRounds } from "@/lib/data/merit";
import { inductionRunning, predictRound } from "@/lib/data/predictions";
import { getDb } from "@/lib/db/client";
import { formatMarks, formatUtc } from "@/lib/format";
import { findSection } from "@/lib/navigation";
import { latestRoundStats } from "@/lib/round-stats";
import { roomPulse } from "@/lib/data/rooms";
import { featureFlags } from "@/lib/data/settings";
import { peerInterest, peerKey } from "@/lib/data/social";
import { PEER_MIN, PEER_WINDOW } from "@/lib/domain/social";
import { PeerCount } from "@/components/rooms/peer-count";
import { EstimateListCard } from "@/components/estimate-list-card";
import { publishedEstimates } from "@/lib/data/simulation";
import { ART } from "@/components/brand-assets";
import { RepBadge } from "@/components/community/rep-badge";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

const day = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : null);

/**
 * The candidate's home: their own merit first, then where the current induction stands,
 * how closing merit has moved, what their marks reach, and who is still moving. Every
 * figure is from the published lists; estimates carry the estimate badge.
 */
export default async function PortalDashboard() {
  const s = findSection("/portal");
  const frame = { area: "portal" as const, trail: [{ label: s.label }], isRoot: true, title: s.label, description: "Your merit, the current induction and how closing merit is moving." };
  const down = await whenDatabaseDown(frame);
  if (down) return down;

  const db = getDb();
  const session = await getSession();
  const [inductions, change, merit, sources, peers, flags] = await Promise.all([
    listInductionsWithRounds(db, session),
    latestRoundChange(db, session),
    myMerit(db, session).catch(() => null),
    dataSources(db, session),
    peerInterest(db, session, { limit: 200 }),
    featureFlags(db, session),
  ]);
  const currentEstimates = (await publishedEstimates(db, session)).filter((e) => !e.official);
  const pulse = flags.community ? await roomPulse(db, session, { limit: 3 }) : null;
  const peerOf = new Map(peers.seats.map((p) => [peerKey(p), p.peers]));
  const room = pulse?.rooms[0] ?? null;
  const latest = inductions[0];
  const lastRound = latest?.rounds.at(-1);
  const running = latest ? await inductionRunning(db, latest.id) : false;
  const gauge = latest && running ? gaugeProps(latest, inductions[1]?.rounds.length) : null;

  // The candidate's latest allocation, and what their marks reach in that programme and quota now.
  const mine = merit?.rows[0] ?? null;
  const mineTotal = mine ? inductions.find((i) => i.id === mine.induction)?.maxMarks ?? null : null;
  const options = mine && latest?.maxMarks && mineTotal
    ? await computeOptions(db, { induction: latest.id, program: mine.program, quota: mine.quota, marks: mine.marks, total: mineTotal }).catch(() => null)
    : null;
  const count = (st: string) => options?.options.filter((o) => o.status === st).length ?? 0;
  const nearest = options ? options.options.filter((o) => o.status !== "out").sort((a, b) => b.lastClosing - a.lastClosing).slice(0, 6) : [];

  const [timeline, previous, settling, movement] = latest
    ? await Promise.all([
        inductionTimeline(db, session, latest.id),
        inductions[1] ? inductionTimeline(db, session, inductions[1].id) : Promise.resolve([]),
        roundSettling(db, session, latest.id),
        lastRound && lastRound.roundNo > 1 ? compareRounds(db, session, latest.id, lastRound.roundNo - 1, lastRound.roundNo) : Promise.resolve(null),
      ])
    : [[], [], null, null];
  // Movements in the candidate's own programme and quota when known, else everywhere.
  const groups = (movement?.groups ?? []).filter((g) => g.delta != null && (!mine || (g.program.trim() === mine.program.trim() && g.quota.trim() === mine.quota.trim())));
  const falls = groups.filter((g) => g.delta! < -0.005).slice(0, 5);
  const rises = groups.filter((g) => g.delta! > 0.005).sort((a, b) => b.delta! - a.delta!).slice(0, 3);

  const ahead = latest && running ? await predictRound(db, session, { induction: latest.id, fromRound: lastRound!.roundNo }).catch(() => null) : null;
  const median = (pick: "low" | "high") => {
    const v = (ahead?.specialities ?? []).map((r) => (r[pick] / r.closing - 1) * 100).sort((a, b) => a - b);
    return v.length ? v[Math.floor(v.length / 2)]! : null;
  };

  const rounds = Math.max(timeline.length, previous.length);
  const startsOn = day(latest?.rounds[0]?.startsOn ?? null), endsOn = day(latest?.rounds[0]?.endsOn ?? null);

  return (
    <AreaPage {...frame}>
      {currentEstimates.length ? <EstimateListCard estimates={currentEstimates} title="Estimated merit list out" /> : null}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {/* ── Your merit: the page's one feature surface ──────────────────── */}
        <section aria-labelledby="your-merit" className="relative isolate overflow-hidden rounded-xl bg-feature p-6 text-feature-ink shadow-[var(--mn-shadow-2)] sm:p-7">
          <span aria-hidden className="mn-mask pointer-events-none absolute -right-20 -top-16 -z-10 h-[340px] w-[480px] text-feature-accent opacity-[0.13]" style={{ ["--mn-mask" as string]: `url(${ART.contour})` }} />
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="your-merit" className="text-sm font-semibold uppercase tracking-[0.14em] text-feature-accent">Your merit</h2>
              <p className="mt-1 text-sm text-feature-muted">{merit ? "Linked to your applicant record · from the published lists" : "Link your account to your applicant record to see your own merit here."}</p>
            </div>
            {merit ? <span className="rounded-full border border-feature-line px-2.5 py-0.5 text-xs font-medium text-feature-ink">Published</span> : null}
          </div>
          {mine ? (
            <div className="mt-6 grid gap-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-xs text-feature-muted">Latest marks · induction {mine.induction}, round {mine.roundNo}</p>
                  <p className="mt-1 font-serif text-[3.6rem] font-semibold leading-none tracking-tight tabular-nums">
                    {formatMarks(mine.marks)}{mineTotal ? <span className="ml-2 font-sans text-xl font-normal text-feature-muted">/ {mineTotal}</span> : null}
                  </p>
                </div>
                <Link href="/portal/profile" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-feature-ink px-3.5 text-sm font-medium text-feature hover:opacity-90">
                  Merit profile <Icon name="arrow" className="h-4 w-4" />
                </Link>
              </div>
              <dl className="grid gap-4 border-t border-feature-line pt-5 text-sm sm:grid-cols-2">
                <div className="grid gap-1">
                  <dt className="text-xs text-feature-muted">Seat in round {mine.roundNo}</dt>
                  <dd className="font-medium">{mine.speciality} · {mine.hospital}</dd>
                  <dd className="text-xs text-feature-muted">{mine.program.trim()} · {mine.quota.trim()} · preference {mine.preferenceNo || "—"}</dd>
                </div>
                <div className="grid gap-1">
                  <dt className="text-xs text-feature-muted">Closing merit of that seat</dt>
                  <dd className="font-serif text-2xl font-semibold tabular-nums">{formatMarks(mine.closing)}</dd>
                  <dd className="text-xs text-feature-muted">{mine.closing != null ? `You were ${formatMarks(mine.marks - mine.closing)} above it` : ""}{mine.consent ? ` · consent ${mine.consent}` : ""}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <div className="mt-6 grid gap-4">
              <p className="max-w-lg text-sm text-feature-muted">Once linked, this shows your marks, your seat in each round and the options your marks reach. Until then you can still work out your marks and search options by hand.</p>
              <div className="flex flex-wrap gap-2">
                <Link href="/portal/profile" className="inline-flex h-9 items-center rounded-lg bg-feature-ink px-3.5 text-sm font-medium text-feature hover:opacity-90">Link your record</Link>
                <Link href="/portal/calculator" className="inline-flex h-9 items-center rounded-lg border border-feature-line px-3.5 text-sm font-medium hover:bg-white/5">Merit calculator</Link>
                <Link href="/portal/finder" className="inline-flex h-9 items-center rounded-lg border border-feature-line px-3.5 text-sm font-medium hover:bg-white/5">Score finder</Link>
              </div>
            </div>
          )}
        </section>

        {/* ── Current induction ──────────────────────────────────────────── */}
        {latest && lastRound ? (
          <Card>
            <CardHeader
              title={`Induction ${latest.id} · ${latest.rounds[0]!.cycleName}`}
              description={startsOn && endsOn ? `Cycle ${startsOn} – ${endsOn}, as published by PHF.` : undefined}
              action={<Badge tone={running ? "current" : "historical"}>{running ? "In progress" : "Cycle closed"}</Badge>}
            />
            <p className="text-sm text-ink">
              {latest.rounds.length} round{latest.rounds.length === 1 ? "" : "s"} published{running ? "" : `; the cycle closed on ${endsOn ?? "its end date"}`}.
            </p>
            <ol className="mt-3 flex flex-wrap gap-1.5" aria-label="Published rounds">
              {latest.rounds.map((r) => (
                <li key={r.roundNo}>
                  <Link href={`/portal/history/${latest.id}/rounds/${r.roundNo}`} className={cn("grid h-9 min-w-11 place-items-center rounded-md border px-2 text-sm font-medium tabular-nums transition-colors", r.roundNo === lastRound.roundNo ? "border-teal bg-[var(--mn-cyan-soft)] text-heading" : "border-line bg-surface text-muted hover:text-ink")}>
                    R{r.roundNo}
                  </Link>
                </li>
              ))}
            </ol>
            {gauge ? <div className="mt-4 border-t border-line pt-4"><CycleGauge {...gauge} /></div> : null}
            {ahead && median("low") !== null ? (
              <p className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4 text-sm text-muted">
                <Badge tone="simulated">Estimate</Badge>
                Round {ahead.toRound} is likely to move closing merit by {median("low")!.toFixed(1)}% to {median("high")!.toFixed(1)}% (median across specialities).
              </p>
            ) : null}
            <p className="mt-4 text-xs text-muted">Latest list added {formatUtc(lastRound.importedAt).slice(0, 10)}. <Link href={`/portal/history/${latest.id}`} className="font-medium text-signal hover:underline">Open the induction</Link></p>
          </Card>
        ) : null}
      </div>

      {change ? <StatTiles stats={latestRoundStats(change, latest?.maxMarks ?? undefined)} /> : null}

      {latest && timeline.length > 1 ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          {/* ── Historical closing merit ───────────────────────────────── */}
          <Card>
            <CardHeader title="Closing merit by round" description={`Median closing merit across programmes, quotas and specialities${latest.maxMarks ? `, out of ${latest.maxMarks}` : ""}.`} action={<Badge tone="calculated">Calculated</Badge>} />
            <LineChart
              title={`Median closing merit per round, induction ${latest.id}${previous.length > 1 ? ` and ${inductions[1]!.id}` : ""}`}
              xLabels={Array.from({ length: rounds }, (_, i) => `R${i + 1}`)}
              series={[
                { label: `Induction ${latest.id}`, values: Array.from({ length: rounds }, (_, i) => timeline[i]?.medianClosing ?? null) },
                ...(previous.length > 1 ? [{ label: `Induction ${inductions[1]!.id}`, tone: "muted" as const, values: Array.from({ length: rounds }, (_, i) => previous[i]?.medianClosing ?? null) }] : []),
              ]}
              height={220}
            />
            <p className="mt-3 text-xs text-muted">Closing merit is the lowest mark allocated to a programme, quota and speciality in a round. Source: PHF merit lists, induction {latest.id}{previous.length > 1 ? ` and ${inductions[1]!.id}` : ""}.</p>
            <ChartSource source={`PHF merit lists, inductions ${latest.id}${inductions[1] ? ` and ${inductions[1].id}` : ""}`} />
          </Card>

          {/* ── Round-wise movement ────────────────────────────────────── */}
          <Card>
            <CardHeader
              title={movement ? `Round ${movement.from.roundNo} → ${movement.to.roundNo}` : "Latest movement"}
              description={mine ? <>Biggest changes in <ProgramTag program={mine.program} quota={mine.quota} className="align-middle text-[0.85rem]" />.</> : "Biggest changes in closing merit across all programmes."}
              action={movement ? <Link href={`/portal/history/${latest.id}/compare?from=${movement.from.roundNo}&to=${movement.to.roundNo}`} className="text-sm font-medium text-signal hover:underline">Compare</Link> : null}
            />
            {movement ? (
              <div className="grid gap-4">
                <dl className="grid grid-cols-3 gap-3 text-sm">
                  {([["Entered", movement.movement.entered], ["Moved seat", movement.movement.moved], ["Left the list", movement.movement.left]] as const).map(([l, v]) => (
                    <div key={l} className="rounded-lg bg-elevated px-3 py-2"><dt className="text-xs text-muted">{l}</dt><dd className="text-lg font-semibold tabular-nums text-heading">{v.toLocaleString("en-US")}</dd></div>
                  ))}
                </dl>
                {falls.length || rises.length ? (
                  <ul className="grid gap-1.5 text-sm">
                    {[...falls, ...rises].map((g) => (
                      <li key={`${g.program}|${g.quota}|${g.speciality}`} className="flex items-baseline justify-between gap-3 border-b border-line pb-1.5 last:border-0">
                        <span className="flex min-w-0 items-center gap-2 truncate">{mine ? null : <ProgramTag program={g.program} className="text-xs" />}<span className="truncate">{g.speciality}</span></span>
                        <span className={cn("flex-none font-medium tabular-nums", g.delta! < 0 ? "text-success" : "text-ember")}>{g.delta! < 0 ? "−" : "+"}{Math.abs(g.delta!).toFixed(2)}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-sm text-muted">Closing merit held in round {movement.to.roundNo}.</p>}
                <p className="text-xs text-muted">Falls (green) mean the seat became easier to reach. Calculated from the two published lists.</p>
              </div>
            ) : <p className="text-sm text-muted">Movement appears once a second round is published.</p>}
          </Card>
        </div>
      ) : null}

      {/* ── Opportunities for the candidate's marks ─────────────────────── */}
      {options && latest ? (
        <Card>
          <CardHeader
            title="What your marks reach"
            description={`${formatMarks(mine!.marks)} of ${mineTotal} against each option's latest closing merit in ${mine!.program} · ${mine!.quota}, induction ${latest.id}.`}
            action={<Badge tone="calculated">Based on past rounds</Badge>}
          />
          <div className="grid gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <ul className="grid grid-cols-3 gap-3 self-start">
              {([["safe", "Safe", "text-success"], ["borderline", "Borderline", "text-amber"], ["out", "Out of reach", "text-muted"]] as const).map(([k, l, tone]) => (
                <li key={k} className="rounded-lg border border-line p-3">
                  <StatusIcon status={k} className={cn("h-3.5 w-3.5", tone)} />
                  <p className="mt-2 text-2xl font-semibold tabular-nums text-heading">{count(k)}</p>
                  <p className="text-xs text-muted">{l}</p>
                </li>
              ))}
            </ul>
            <div className="grid gap-2">
              <p className="text-xs font-medium text-muted">Highest-closing options your marks reach</p>
              {nearest.length ? (
                <ul className="divide-y divide-line rounded-lg border border-line text-sm">
                  {nearest.map((o) => (
                    <li key={`${o.speciality}|${o.hospital}`} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span className="min-w-0"><span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium"><span className="truncate">{o.speciality}</span><PeerCount n={peerOf.get(peerKey({ program: mine!.program, quota: mine!.quota, speciality: o.speciality, hospital: o.hospital }))} /></span><span className="block truncate text-xs text-muted">{o.hospital}</span></span>
                      <span className="flex flex-none items-center gap-2"><span className="tabular-nums">{formatMarks(o.lastClosing)}</span><StatusIcon status={o.status} className={cn("h-3 w-3", o.status === "safe" ? "text-success" : "text-amber")} /></span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted">No option in this programme and quota closed at or below your marks.</p>}
              <Link href={`/portal/finder?marks=${mine!.marks}&total=${mineTotal}&induction=${latest.id}&track=${encodeURIComponent(`${mine!.program}|${mine!.quota}`)}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-signal hover:underline">
                All options in the score finder <Icon name="arrow" className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </Card>
      ) : null}

      {/* ── People near your marks, and the round room ───────────────────── */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Popular near your marks"
            description={
              peers.marks == null
                ? "Seats that people with marks like yours have saved."
                : `What people within ${PEER_WINDOW} of your ${formatMarks(peers.marks)} (${peers.source === "record" ? "your record" : "your preference list"}) have shortlisted or planned.`
            }
            action={<Badge tone="calculated">Anonymous counts</Badge>}
          />
          {peers.marks == null ? (
            <p className="text-sm text-muted">
              Link your merit record, or <Link href="/portal/preferences" className="text-signal hover:underline">make a preference list with your expected marks</Link>, to see which seats people near you are weighing up.
            </p>
          ) : peers.seats.length ? (
            <ol className="divide-y divide-line rounded-lg border border-line text-sm">
              {peers.seats.slice(0, 6).map((p, i) => (
                <li key={peerKey(p)} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2">
                  <span className="font-mono text-xs text-subtle tabular-nums">{i + 1}</span>
                  <span className="min-w-0"><span className="block truncate font-medium">{p.speciality}</span><span className="block truncate text-xs text-muted">{p.hospital} · {p.program} {p.quota}</span></span>
                  <span className="text-xs tabular-nums text-signal-strong">{p.peers} people</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted">
              {peers.near ? `${peers.near} people are near your marks, ` : "Too few people near your marks yet, "}
              but no seat is on at least {PEER_MIN} of their lists. Counts appear once {PEER_MIN} or more people share a seat, so nobody can be singled out.
            </p>
          )}
          <p className="mt-3 text-xs text-subtle">Turn counting off for yourself under Community → You.</p>
        </Card>
        {room ? (
          <Card>
            <CardHeader
              title={`Round room · induction ${room.induction}, round ${room.roundNo}`}
              description={room.today ? `${room.today} ${room.today === 1 ? "message" : "messages"} in the last day.` : "One-line chat on the latest round. Round day posts the figures automatically."}
              action={<Link href={`/portal/history/${room.induction}/rounds/${room.roundNo}#room`} className="text-sm font-medium text-signal hover:underline">Open the room</Link>}
            />
            {pulse!.preview.length ? (
              <ul className="grid gap-2 text-sm">
                {pulse!.preview.map((m) => (
                  <li key={m.id} className={cn("rounded-lg px-3 py-2", m.kind === "system" ? "border border-teal/30 bg-tint" : "border border-line")}>
                    <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                      <span className="font-semibold text-heading">{m.kind === "system" ? "meritNAMA · round day" : m.mine ? "You" : m.author}</span>
                      {m.kind === "message" && m.verified && !m.team ? <Badge tone="success">Verified</Badge> : null}
                      <RepBadge level={m.level} />
                      {m.band ? <span className="rounded border border-line px-1.5 font-mono text-[0.7rem]">{m.band}</span> : null}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-ink">{m.body}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Quiet so far. Be the first to say what moved for you.</p>
            )}
          </Card>
        ) : null}
      </div>

      {/* ── Remaining candidates ────────────────────────────────────────── */}
      {latest && settling && latest.rounds.length > 1 ? (
        <Card>
          <CardHeader
            title="Who is still moving"
            description={`Induction ${latest.id}: candidates not yet in the seat they keep in the final round. Select a round for who entered, moved or left.`}
            action={<Link href={`/portal/history/${latest.id}#settling`} className="text-sm font-medium text-signal hover:underline">By programme</Link>}
          />
          <RoundFunnel final={settling.final} rounds={settling.rounds} caption={`Induction ${latest.id}: candidates still moving by round`} />
          <ChartSource source={`PHF merit lists, induction ${latest.id}`} induction={latest.id} />
        </Card>
      ) : null}

      {sources.length ? (
        <Card>
          <CardHeader title="Where this comes from" description="Every figure on this page is worked out from these, as last updated (UTC)." />
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
            {sources.map((src) => (
              <div key={src.label} className="grid gap-0.5">
                <dt className="font-medium">{src.label}</dt>
                <dd className="text-muted">{src.detail}{src.at ? <span className="block text-xs">updated {formatUtc(src.at)}</span> : null}</dd>
              </div>
            ))}
          </dl>
        </Card>
      ) : null}
    </AreaPage>
  );
}
