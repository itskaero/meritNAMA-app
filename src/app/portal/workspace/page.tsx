import Link from "next/link";
import { AreaPage } from "@/components/area-page";
import { whenDatabaseDown } from "@/components/database-unavailable";
import { AuroraHeader } from "@/components/ui/aurora-header";
import { cn } from "@/components/ui/cn";
import { getSession } from "@/lib/auth/session";
import { myMerit } from "@/lib/data/candidates";
import { computeOptions, finderOptions, listShortlist, type FinderOption } from "@/lib/data/finder";
import { applicantIdentity, compareRounds, listInductionsWithRounds, marksStanding } from "@/lib/data/merit";
import { listInbox as listNotices, shortlistAlerts } from "@/lib/data/notifications";
import { latestSchedule } from "@/lib/data/schedule";
import { publishedEstimates, roundApplicantResult } from "@/lib/data/simulation";
import { marginText, RESULT_LABELS, trackSummary, type ResultStatus } from "@/lib/domain/applicant-result";
import { followedPlaces, listSavedViews } from "@/lib/data/workspace";
import { getDb } from "@/lib/db/client";
import { formatMarks } from "@/lib/format";
import { findSection } from "@/lib/navigation";
import { myPrivacy } from "@/lib/data/privacy";
import { deleteViewAction, setAlertsAction, setPrivacyAction } from "./actions";
import { signOutAction } from "@/app/_actions/auth";

export const metadata = { title: "Me" };
export const dynamic = "force-dynamic";

const IV = "text-[#F3EEE5]/[.68]";
const card = "mn-card-glass mn-hover rounded-[20px] border border-line p-5";
const shortH = (h: string) => h.split(",")[0]!;

/** Row colours of a preference result, as Estimate.dc.html draws them. */
const ROW: Record<ResultStatus, { sb: string; sc: string; bg: string; sh: string; nc: string; tc: string }> = {
  placed: { sb: "rgba(61,220,151,.18)", sc: "#3DDC97", bg: "rgba(61,220,151,.10)", sh: "inset 0 0 0 1px rgba(61,220,151,.45), 0 0 14px rgba(61,220,151,.15)", nc: "#3DDC97", tc: "#EDEDEF" },
  clears_cutoff: { sb: "rgba(61,220,151,.12)", sc: "#3DDC97", bg: "rgba(255,255,255,.025)", sh: "none", nc: "#8B8B93", tc: "#EDEDEF" },
  fell_short: { sb: "rgba(255,122,122,.16)", sc: "#FF7A7A", bg: "rgba(255,122,122,.06)", sh: "none", nc: "#FF7A7A", tc: "#EDEDEF" },
  skipped: { sb: "rgba(255,255,255,.06)", sc: "#8B8B93", bg: "rgba(255,255,255,.025)", sh: "none", nc: "#6B6B73", tc: "#A3A3AD" },
  no_seats: { sb: "rgba(229,160,75,.14)", sc: "#E5A04B", bg: "rgba(255,255,255,.025)", sh: "none", nc: "#6B6B73", tc: "#A3A3AD" },
};

/** Me (docs/mockups/v4/Me.dc.html): who you are on the lists, your journey, today, your shortlist, and what you follow. */
export default async function MePage() {
  const s = findSection("/portal/workspace");
  const frame = { area: "portal" as const, trail: [{ label: s.label }], title: s.label, description: s.description };
  const down = await whenDatabaseDown(frame);
  if (down) return down;
  const db = getDb();
  const session = (await getSession())!;
  const now = new Date();
  const [items, opts, merit, notes, views, places, alerts, inductions, estimates, schedule] = await Promise.all([
    listShortlist(db, session), finderOptions(db, session), myMerit(db, session).catch(() => null), listNotices(db, session, 12).catch(() => null),
    listSavedViews(db, session), followedPlaces(db, session), shortlistAlerts(db, session), listInductionsWithRounds(db, session),
    publishedEstimates(db, session), latestSchedule(db, session),
  ]);
  const own = merit?.rows[0] ?? null;
  const latest = inductions[0] ?? null;
  const lastRound = latest?.rounds.at(-1) ?? null;
  const prevRound = latest?.rounds.at(-2) ?? null;
  const [who, standing, movement, prefs, privacy] = await Promise.all([
    merit ? applicantIdentity(db, session, merit.applicantId).catch(() => null) : null,
    own ? marksStanding(db, session, { induction: own.induction, roundNo: own.roundNo, program: own.program, marks: own.marks }).catch(() => null) : null,
    latest && lastRound && prevRound ? compareRounds(db, session, latest.id, prevRound.roundNo, lastRound.roundNo).catch(() => null) : null,
    merit && latest && lastRound ? roundApplicantResult(db, session, { induction: latest.id, roundNo: lastRound.roundNo, applicantId: merit.applicantId }).catch(() => null) : null,
    merit ? myPrivacy(db, session).catch(() => null) : null,
  ]);

  // Safe / target / reach for each shortlisted seat, against the latest induction.
  const latestInd = opts.inductions[0];
  const total = own ? opts.inductions.find((i) => i.id === own.induction)?.total ?? null : null;
  const chances = new Map<string, FinderOption>();
  if (own && total && latestInd) {
    const keys = [...new Set(items.map((x) => `${x.program}|${x.quota}`))];
    await Promise.all(keys.map(async (k) => {
      const [program, quota] = k.split("|") as [string, string];
      const r = await computeOptions(db, { induction: latestInd.id, program, quota, marks: own.marks, total }).catch(() => null);
      for (const o of r?.options ?? []) chances.set(`${k}|${o.speciality}|${o.hospital}`, o);
    }));
  }

  // The journey: the seat in each round of the latest induction, consecutive same seats as one bar.
  const rows = new Map((merit?.rows ?? []).filter((r) => r.induction === latest?.id).map((r) => [r.roundNo, r]));
  const roundNos = latest?.rounds.map((r) => r.roundNo) ?? [];
  const est = estimates.find((e) => !e.official && e.induction === latest?.id);
  const cols = roundNos.length + (est ? 1 : 0);
  type Bar = { key: string; from: number; to: number; title: string; sub: string; tone: "none" | "other" | "seat" };
  const bars: Bar[] = [];
  roundNos.forEach((n, i) => {
    const r = rows.get(n);
    const key = r ? `${r.speciality}|${r.hospital}` : "none";
    const prev = bars.at(-1);
    if (prev && prev.key === key) { prev.to = i; return; }
    const tone = !r ? "none" : own && r.speciality === own.speciality && r.hospital === own.hospital ? "seat" : "other";
    bars.push({ key, from: i, to: i, title: r ? `${r.speciality} · ${shortH(r.hospital)}` : "No seat", sub: r ? `${r.preferenceNo ? `pref #${r.preferenceNo}` : "seat"}${r.consent ? ` · ${r.consent.toLowerCase()}` : ""}` : "not on the list", tone });
  });
  bars.forEach((b) => { if (b.from !== b.to) b.sub = `${b.sub.split(" · ")[0]} · R${roundNos[b.from]}–R${roundNos[b.to]}${b.sub.includes(" · ") ? ` · ${b.sub.split(" · ").slice(1).join(" · ")}` : ""}`; });

  // Today: the next PHF deadline, movement in shortlisted seats, unread notices.
  const open = (schedule?.rows ?? []).filter((r) => r.endsAt && r.endsAt > now && (!r.startsAt || r.startsAt <= now)).sort((a, b) => a.endsAt!.getTime() - b.endsAt!.getTime())[0];
  const left = open?.endsAt ? open.endsAt.getTime() - now.getTime() : 0;
  const countdown = open ? `${Math.floor(left / 86_400_000)} day${Math.floor(left / 86_400_000) === 1 ? "" : "s"} ${Math.floor((left % 86_400_000) / 3_600_000)} h` : null;
  const shortSpecs = new Set(items.map((x) => `${x.program}|${x.quota}|${x.speciality}`));
  const moves = (movement?.groups ?? []).filter((g) => g.delta != null && Math.abs(g.delta) > 0.005 && shortSpecs.has(`${g.program}|${g.quota}|${g.speciality}`)).slice(0, 3);
  const unread = notes?.items.filter((n) => !n.readAt) ?? [];

  const display = who?.name ?? session.email.replace(/@.*/, "");
  const initials = display.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  const following = places.hospitals.length + places.specialities.length;
  const TONE = { none: "#FF7A7A", other: "#E5A04B", seat: "#3DDC97" } as const;

  return (
    <AreaPage {...frame} bare>
      <AuroraHeader as="section" className="flex flex-wrap items-center justify-between gap-5 px-5 py-[22px] sm:px-6">
        <div className="flex items-center gap-[18px]">
          <span aria-hidden className="grid h-[76px] w-[76px] flex-none place-items-center rounded-full bg-[linear-gradient(135deg,#8B73FF,#5B3FF5)] text-[26px] font-bold shadow-[0_0_30px_rgba(110,86,255,.5)]">{initials}</span>
          <div className="min-w-0">
            <h1 className="truncate text-[30px] font-bold tracking-[-0.03em]">{display}</h1>
            <p className={cn("mt-1 font-mono text-xs", IV)}>{merit ? [merit.applicantId, who?.pmdcNo ? `PMDC ${who.pmdcNo}` : null, own ? `${own.program.trim()} · ${own.quota.trim()}` : null].filter(Boolean).join(" · ") : "Not linked to an applicant record yet"}</p>
            <p className="mt-2 flex flex-wrap gap-1.5">
              {standing ? <span className="mn-pill v">{standing.percentile >= 75 ? "High" : standing.percentile >= 40 ? "Middle" : "Lower"} · {standing.percentile}th</span> : null}
              {own ? <span className="mn-pill g">Seat in round {own.roundNo}</span> : null}
              {open ? <span className="mn-pill a"><span className="mn-live">●</span> {open.title} due {open.endsAt!.toLocaleDateString("en-GB", { weekday: "short", timeZone: "Asia/Karachi" })}</span> : null}
              {!merit ? <Link href="/portal/profile" className="mn-pill v">Link your record →</Link> : null}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {([[own ? formatMarks(own.marks) : "—", "marks"], [String(items.length), "shortlist"], [String(following), "following"], [String(views.length), "saved"]] as const).map(([v, l]) => (
            <div key={l} className="mn-glass min-w-[4.5rem] text-center"><p className="text-[22px] font-bold tabular-nums">{v}</p><p className={cn("text-[11px]", IV)}>{l}</p></div>
          ))}
          <Link href="/portal/account" className="mn-ob">Your data</Link>
          {session.isStub ? null : (
            <form action={signOutAction}><button type="submit" className="mn-ob">Sign out</button></form>
          )}
        </div>
      </AuroraHeader>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section aria-labelledby="journey" className={card}>
          <div className="flex items-center justify-between"><h2 id="journey" className="text-[15px] font-semibold text-heading">My journey{latest ? ` · induction ${latest.id}` : ""}</h2><span className="text-xs text-muted">Seat in each round</span></div>
          {bars.length ? (
            <div className="relative mt-3.5 overflow-x-auto">
              <div className="relative min-w-[36rem]" style={{ height: `${Math.max(180, 40 + bars.length * 60)}px` }}>
                <div className="absolute inset-x-0 top-0 grid text-xs text-muted" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
                  {roundNos.map((n) => <span key={n} className={n === lastRound?.roundNo ? "text-[#D6CCFF]" : undefined}>R{n}{n === lastRound?.roundNo ? " · now" : ""}</span>)}
                  {est ? <span className="text-[#E5A04B]">R{est.roundNo}</span> : null}
                </div>
                <div aria-hidden className="absolute inset-x-0 bottom-0 top-6 grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
                  {Array.from({ length: cols }, (_, i) => <span key={i} className="border-l border-dashed border-white/[.06]" />)}
                </div>
                {bars.map((b, i) => (
                  <div key={i} className="absolute rounded-xl px-3 py-2.5 text-xs transition-transform hover:-translate-y-0.5"
                    style={{ left: `calc(${(b.from / cols) * 100}% + 4px)`, width: `calc(${((b.to - b.from + 1) / cols) * 100}% - 8px)`, top: `${40 + i * 60}px`,
                      background: b.tone === "seat" ? "rgba(61,220,151,0.14)" : "#1E1E24", boxShadow: `inset 3px 0 0 ${TONE[b.tone]}${b.tone === "seat" ? ", 0 0 22px rgba(61,220,151,0.25)" : ""}` }}>
                    <b className="block truncate">{b.title}</b><span className={cn("block truncate", b.tone === "seat" ? "text-[#3DDC97]" : "text-muted")}>{b.sub}</span>
                  </div>
                ))}
                {est ? (
                  <Link href={`/portal/estimates?run=${est.id}`} className="absolute rounded-xl border border-dashed border-[rgba(155,135,255,.7)] px-3 py-2.5 text-xs" style={{ left: `calc(${((cols - 1) / cols) * 100}% + 4px)`, width: `calc(${(1 / cols) * 100}% - 8px)`, top: "100px" }}>
                    <b className="block text-[#C4B8FF]">Estimate</b><span className="block text-muted">round {est.roundNo}</span>
                  </Link>
                ) : null}
              </div>
            </div>
          ) : <p className="mt-3 text-sm text-muted">{merit ? "You are not on a list of the latest induction yet." : <>Your seat in each round shows once your account is linked. <Link href="/portal/profile" className="text-[#A797FF]">Link it</Link>.</>}</p>}
        </section>

        <aside aria-label="Today" className={card}>
          <h2 className="text-[15px] font-semibold text-heading">Today</h2>
          <p className="mb-3 mt-0.5 text-xs text-muted">{now.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Karachi" })}</p>
          {countdown ? (
            <div className="rounded-[14px] border border-[rgba(229,160,75,.4)] bg-[rgba(229,160,75,.10)] p-3.5 shadow-[0_0_22px_rgba(229,160,75,.15)]">
              <p className="text-[26px] font-bold text-[#E5A04B]">{countdown}</p>
              <p className="mt-0.5 text-[13px]">until {open!.title} closes</p>
            </div>
          ) : null}
          <ul className="mt-3.5 grid gap-3 text-[13px]">
            {moves.map((g) => (
              <li key={`${g.program}|${g.quota}|${g.speciality}`} className="flex justify-between gap-2"><span className="truncate">{g.speciality} {g.delta! < 0 ? "fell" : "rose"}</span><span className={cn("mn-pill", g.delta! < 0 ? "g" : "r")}>{g.delta! < 0 ? "▼" : "▲"} {Math.abs(g.delta!).toFixed(2)}</span></li>
            ))}
            {unread.slice(0, 3).map((n) => <li key={n.id} className="flex justify-between gap-2"><Link href={n.href} className="truncate hover:underline">{n.title}</Link><span className="mn-pill v">new</span></li>)}
            {!countdown && !moves.length && !unread.length ? <li className="text-muted">Nothing new today.</li> : null}
          </ul>
        </aside>
      </div>

      {prefs && prefs.programmes.length ? (
        <section aria-labelledby="prefs" className={card}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="prefs" className="text-[15px] font-semibold text-heading">My preferences · against round {prefs.roundNo}</h2>
            <span className="text-xs text-muted">Cutoff is the lowest mark placed on that seat in round {prefs.roundNo}</span>
          </div>
          <div className="mt-3.5 grid gap-5 lg:grid-cols-2">
            {prefs.programmes.map((p) => {
              const sum = trackSummary(p.rows);
              return (
                <div key={p.program} className="grid min-w-0 content-start gap-2.5">
                  {sum.placed ? (
                    <div className="rounded-xl border border-[rgba(61,220,151,.4)] bg-[rgba(61,220,151,.10)] p-3">
                      <div className="flex items-center justify-between gap-2"><b className="text-[13px]">{p.program}{p.mark != null ? <span className="font-mono font-normal text-muted"> · {formatMarks(p.mark)}</span> : null}</b><span className="mn-pill g">Placed</span></div>
                      <p className="mt-1 text-xs">Preference #{sum.placed.preferenceNo}: <b>{sum.placed.speciality} @ {shortH(sum.placed.hospital)}</b>. Everything below it is skipped.</p>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-[rgba(229,160,75,.4)] bg-[rgba(229,160,75,.08)] p-3">
                      <div className="flex items-center justify-between gap-2"><b className="text-[13px]">{p.program}{p.mark != null ? <span className="font-mono font-normal text-muted"> · {formatMarks(p.mark)}</span> : null}</b><span className="mn-pill a">Not placed</span></div>
                      <p className="mt-1 text-xs">{sum.closestMiss ? <>Closest: #{sum.closestMiss.preferenceNo} <b>{sum.closestMiss.speciality} @ {shortH(sum.closestMiss.hospital)}</b>, {marginText(sum.closestMiss).toLowerCase()}.</> : "No preference clears its cutoff in this list."}</p>
                    </div>
                  )}
                  <div className="grid grid-cols-[30px_minmax(0,1fr)_52px_128px_76px] gap-1.5 px-2 text-[10px] uppercase tracking-[0.05em] text-muted"><span>Pref</span><span>Seat</span><span className="text-right">Cutoff</span><span className="text-right">Margin</span><span className="text-right">Status</span></div>
                  <ol className="flex max-h-[420px] flex-col gap-1 overflow-auto pr-0.5">
                    {p.rows.map((r) => {
                      const c = ROW[r.status];
                      const m = marginText(r);
                      return (
                        <li key={r.preferenceNo} className="grid grid-cols-[30px_minmax(0,1fr)_52px_128px_76px] items-center gap-1.5 rounded-[9px] px-2 py-[7px] text-xs" style={{ background: c.bg, boxShadow: c.sh }}>
                          <span className="font-mono" style={{ color: c.nc }}>#{r.preferenceNo}</span>
                          <span className="min-w-0"><span className="block truncate" style={{ color: c.tc }}>{r.speciality}</span><span className="block truncate text-[10px] text-muted">{r.hospital}{r.filled != null ? ` · ${r.filled} placed` : ""}</span></span>
                          <span className="text-right font-mono text-muted">{r.cutoff == null ? "—" : formatMarks(r.cutoff)}</span>
                          <span className="text-right font-mono text-[11px]" style={{ color: /short/i.test(m) ? "#FF7A7A" : r.status === "skipped" || r.status === "no_seats" ? "#8B8B93" : "#3DDC97" }}>{m}</span>
                          <span className="text-right"><span className="mn-pill !px-[7px] !py-0.5 !text-[10px]" style={{ background: c.sb, color: c.sc }}>{RESULT_LABELS[r.status]}</span></span>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[11px] text-muted">One final seat per programme. Lower preferences can still show &quot;would clear&quot;, but they are skipped once an earlier one is placed. <Link href={`/portal/estimates?id=${prefs.applicantId}`} className="text-[#A797FF]">Where you land in the estimate →</Link></p>
        </section>
      ) : null}

      <section aria-labelledby="short" className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="short" className="text-[15px] font-semibold text-heading">Shortlist · {items.length}</h2>
          <div className="flex items-center gap-3">
            <form action={setAlertsAction}><input type="hidden" name="on" value={alerts ? "0" : "1"} /><button type="submit" className="mn-ob">{alerts ? "Alerts on" : "Alerts off"}</button></form>
            <Link href="/portal/finder" className="text-[13px] text-[#A797FF]">Add from My chances →</Link>
          </div>
        </div>
        {items.length ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {items.map((x) => {
              const o = chances.get(`${x.program}|${x.quota}|${x.speciality}|${x.hospital}`);
              const st = o?.status;
              const c = st === "safe" ? ["g", "rgba(61,220,151,.3)", "#3DDC97"] : st === "borderline" ? ["a", "rgba(229,160,75,.3)", "#E5A04B"] : st === "out" ? ["r", "rgba(255,122,122,.3)", "#FF7A7A"] : ["n", "rgba(255,255,255,.08)", "#8B8B93"];
              const fill = o && own && total ? Math.max(6, Math.min(100, 100 - Math.max(0, (o.lastClosing - (own.marks / total) * (latestInd?.total ?? total)) * 25))) : 30;
              return (
                <article key={`${x.program}|${x.quota}|${x.speciality}|${x.hospital}`} className="rounded-[14px] border bg-white/[.03] p-3.5" style={{ borderColor: c[1] }}>
                  <div className="flex justify-between gap-2"><b className="truncate">{x.speciality}</b>{st ? <span className={cn("mn-pill", c[0])}>{st === "safe" ? "Safe" : st === "borderline" ? "Target" : "Reach"}</span> : null}</div>
                  <p className="mt-1 truncate text-xs text-muted">{shortH(x.hospital)}{o ? ` · closing ${o.lastClosing.toFixed(2)}` : ` · ${x.program} ${x.quota}`}</p>
                  <div className="mn-fill mt-2.5"><span style={{ width: `${fill}%`, background: c[2], boxShadow: st === "safe" ? `0 0 8px ${c[2]}` : "none" }} /></div>
                </article>
              );
            })}
          </div>
        ) : <p className="mt-3 text-sm text-muted">Nothing saved yet. Star seats in <Link href="/portal/finder" className="text-[#A797FF]">My chances</Link>.</p>}
      </section>

      {privacy ? (
        <section aria-labelledby="privacy" className={card}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="privacy" className="text-[15px] font-semibold text-heading">What other candidates see</h2>
            <span className="text-xs text-muted">Only about your own record · the team always sees everything</span>
          </div>
          <form action={setPrivacyAction} className="mt-3 grid gap-3">
            <label className="flex cursor-pointer items-start gap-3 rounded-[14px] border border-white/[.08] bg-white/[.03] p-3.5 has-[:checked]:border-[rgba(155,135,255,.55)] has-[:checked]:bg-[rgba(110,86,255,.10)] sm:max-w-md">
              <input type="checkbox" name="hideRecord" defaultChecked={privacy.hideRecord} className="mt-0.5 h-4 w-4 flex-none accent-[#7B61FF]" />
              <span className="min-w-0"><b className="block text-[13px]">Hide my record notes</b><span className="mt-0.5 block text-xs text-muted">PHF&apos;s verification remarks and any corrections, on your Candidates profile.</span></span>
            </label>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted">Your name, PMDC number, marks, seat and preferences always show: they are on PHF&apos;s gazette and merit lists, which everyone needs.</p>
              <button type="submit" className="mn-ob">Save</button>
            </div>
          </form>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <section className={card}>
          <h2 className="text-[15px] font-semibold text-heading">Following</h2>
          <p className="mt-3 flex flex-wrap gap-1.5">
            {places.hospitals.map((h) => <Link key={`h${h.id}`} href={`/portal/explore/hospitals/${h.id}`} className="mn-pill v">{h.name.split(",")[0]}</Link>)}
            {places.specialities.map((x) => <Link key={`s${x.id}`} href={`/portal/explore/specialities/${x.id}`} className="mn-pill v">{x.name}</Link>)}
            {!following ? <span className="text-[13px] text-muted">Follow a hospital or speciality to hear about new lists and jobs.</span> : null}
          </p>
        </section>
        <section className={card}>
          <h2 className="text-[15px] font-semibold text-heading">Saved views</h2>
          <ul className="mt-3 grid gap-2 text-[13px]">
            {views.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-2">
                <Link href={v.href} className="truncate text-[#A797FF] hover:underline">{v.label}</Link>
                <form action={deleteViewAction}><input type="hidden" name="id" value={v.id} /><button type="submit" aria-label={`Remove ${v.label}`} className="text-xs text-muted hover:text-ink">✕</button></form>
              </li>
            ))}
            {!views.length ? <li className="text-muted">Save a finder search or a filtered list to come back to it.</li> : null}
          </ul>
        </section>
        <section className={card}>
          <h2 className="text-[15px] font-semibold text-heading">Your activity</h2>
          <ul className="mt-3 grid gap-2 text-[13px] text-muted">
            {(notes?.items ?? []).slice(0, 4).map((n) => <li key={n.id} className="truncate"><Link href={n.href} className="hover:text-ink">{n.title}</Link></li>)}
            {!notes?.items.length ? <li>Nothing yet. Answers, new rounds and alerts show here.</li> : null}
          </ul>
          <p className="mt-3 flex gap-3 text-xs"><Link href="/portal/profile" className="text-[#A797FF]">My record</Link><Link href="/portal/preferences" className="text-[#A797FF]">Preference list</Link><Link href="/portal/inbox" className="text-[#A797FF]">Inbox</Link></p>
        </section>
      </div>
    </AreaPage>
  );
}
