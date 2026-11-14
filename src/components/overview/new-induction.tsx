import Link from "next/link";
import type { CycleStep } from "@/lib/admin/today";
import type { Policy } from "@/lib/domain/scoring-policy";
import { cn } from "../ui/cn";
import { ApplyChecklist } from "./apply-checklist";

const SEG = ["#5CE1E6", "#3DDC97", "#E5A04B", "#FF7A7A", "#8B8B93", "#C4B8FF"];
const fmt = (n: number) => n.toLocaleString("en-US");
const day = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Karachi" });
const month = (d: Date) => d.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "Asia/Karachi" });

// PHF's portal schedule has housekeeping steps (logins, timers); the timeline keeps the ones a candidate acts on.
const NOISE = /login|display|remaning|remaining|sign ?up|register/i;
const KEY = /application|profile|preference|verification|test|pget|result|gazette/i;

export type NewInductionProps = {
  induction: number;
  rows: { title: string; startsAt: Date | null; endsAt: Date | null }[];
  steps: CycleStep[];
  running: { id: number; roundNo: number | null; seat: string | null } | null;
  asking: { id: string; title: string; replies: number; helpful: number; answered: boolean }[];
  policy: Policy | null;
  previous: Policy | null;
  seats: number;
  hasEstimate: boolean;
  now: Date;
};

/** The Overview while a new induction is announced and has no merit list yet (docs/mockups/v4/Overview22.dc.html). */
export function NewInduction({ induction, rows, steps, running, asking, policy, previous, seats, hasEstimate, now }: NewInductionProps) {
  const next = rows.find((r) => r.startsAt && r.startsAt > now) ?? null;
  const open = rows.find((r) => r.startsAt && r.startsAt <= now && (!r.endsAt || r.endsAt > now)) ?? null;
  const target = open?.endsAt ?? next?.startsAt ?? null;
  const left = target ? Math.max(0, target.getTime() - now.getTime()) : 0;
  const days = Math.floor(left / 86_400_000), hours = Math.floor((left % 86_400_000) / 3_600_000);
  const announced = rows.map((r) => r.startsAt).filter((d): d is Date => Boolean(d)).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  const firstList = rows.find((r) => /merit/i.test(r.title) && r.startsAt)?.startsAt ?? null;

  // Timeline: announced, the steps that matter, then the estimate and the first list.
  const seen = new Set<string>();
  const key = steps.filter((s) => KEY.test(s.title) && !NOISE.test(s.title)).filter((s) => { const k = s.title.split(":")[0]!.trim().toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 4);
  const line: { title: string; when: string; state: "done" | "now" | "next" }[] = [
    { title: "Announced", when: announced ? `${day(announced)} · done` : "done", state: "done" },
    ...key.map((s) => ({ title: s.title.replace(/\s*:\s*/, " · "), when: s.when, state: s.state })),
    { title: "Estimated R1", when: hasEstimate ? "out now" : "on meritNAMA", state: hasEstimate ? "now" : "next" },
    { title: "Round 1", when: firstList ? month(firstList) : "after the gazette", state: "next" },
  ];
  const reached = Math.max(0, line.map((l) => l.state).lastIndexOf("done"), line.findIndex((l) => l.state === "now"));
  const fill = line.length > 1 ? (reached / (line.length - 1)) * 100 : 0;

  // What changed: the new policy's parts against the running induction's.
  const parts = (p: Policy | null) => (p ? p.components.filter((c) => c.included !== false && c.max_marks > 0).sort((a, b) => b.max_marks - a.max_marks) : []);
  const now_ = parts(policy), was = parts(previous);
  const wasBy = new Map(was.map((c) => [c.label.toLowerCase(), c.max_marks]));
  const nowLabels = new Set(now_.map((c) => c.label.toLowerCase()));
  const gone = was.filter((c) => !nowLabels.has(c.label.toLowerCase())).map((c) => c.label);
  const changed = policy && previous && (policy.total_marks !== previous.total_marks || gone.length > 0 || now_.some((c) => wasBy.get(c.label.toLowerCase()) !== c.max_marks));
  const biggest = now_[0];
  const isNew = (label: string) => previous != null && !wasBy.has(label.toLowerCase());

  const headline = policy && changed ? `scored out of ${fmt(policy.total_marks)}${biggest && isNew(biggest.label) ? `, with ${biggest.label}` : ""}` : null;
  const ticks = 50;

  return (
    <>
      {running ? (
        <Link href={`/portal/history/${running.id}`} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[.07] bg-[rgba(23,23,28,.82)] px-3.5 py-2.5 text-[13px] text-ink">
          <span className="mn-pill g"><span className="motion-safe:animate-pulse">●</span> Running</span>
          <span><b>Induction {running.id}</b> <span className="text-muted">{running.roundNo ? `· round ${running.roundNo} out` : ""}{running.seat ? ` · your seat ${running.seat}` : ""}</span></span>
          <span className="ml-auto text-[#B9AAFF]">Open induction {running.id} →</span>
        </Link>
      ) : null}

      <section aria-label={`Induction ${induction} announced`} className="relative min-h-[340px] overflow-hidden rounded-[18px] text-[#F3EEE5] shadow-[0_24px_60px_rgba(0,0,0,.55),0_0_0_1px_rgba(92,225,230,.15)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/v4/hero-cycle.jpg" alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover object-right" />
        <video className="absolute inset-0 h-full w-full object-cover object-right motion-reduce:hidden" src="/images/v4/overview-bg.mp4" poster="/images/v4/hero-cycle.jpg" autoPlay muted loop playsInline preload="metadata" aria-hidden />
        <div aria-hidden className="absolute inset-0 [background:linear-gradient(90deg,rgba(6,14,30,.92)_0%,rgba(6,14,30,.7)_38%,rgba(6,14,30,0)_70%)]" />
        <div className="relative flex min-h-[340px] max-w-[700px] flex-col justify-between gap-6 px-6 py-7 sm:px-8">
          <div>
            <p className="flex flex-wrap items-center gap-2"><span className="mn-pill bg-[rgba(92,225,230,.16)] text-[#7FF0F4] shadow-[0_0_12px_rgba(92,225,230,.3)]">● New induction</span><span className="text-xs text-[#F3EEE5]/[.68]">PHF schedule{announced ? ` · ${day(announced)}` : ""}</span></p>
            <h1 className="mt-3 text-[clamp(1.9rem,4vw,2.5rem)] font-bold leading-[1.05] tracking-[-0.03em]">
              Induction {induction}{firstList ? ` · ${month(firstList)}` : ""}
              {headline ? <><br /><span className="text-[#7FF0F4] [text-shadow:0_0_24px_rgba(92,225,230,.45)]">{headline}</span></> : null}
            </h1>
            <p className="mt-2.5 max-w-[560px] text-sm leading-[1.55] text-[#F3EEE5]/[.68]">
              {changed && biggest
                ? `${biggest.label} now carries ${fmt(biggest.max_marks)} of ${fmt(policy!.total_marks)} marks.${gone.length ? ` ${gone.join(", ")} no longer ${gone.length === 1 ? "counts" : "count"}.` : ""} Past closing merit is not comparable, so chances start fresh this cycle.`
                : "No merit list yet. Work out your marks under the scoring policy, check the dates, and an estimated first list appears here once the candidates' list is in."}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-[18px]">
            {target ? (
              <div className="flex items-center gap-2">
                {([[days, "days"], [hours, "hours"]] as const).map(([v, l]) => (
                  <div key={l} className="min-w-[66px] rounded-xl border border-[rgba(92,225,230,.35)] bg-[rgba(8,20,40,.55)] px-2.5 py-2 text-center shadow-[0_0_18px_rgba(92,225,230,.15)] backdrop-blur-[8px]">
                    <span className="block text-2xl font-bold tabular-nums">{String(v).padStart(2, "0")}</span><span className="text-[10px] text-[#F3EEE5]/[.68]">{l}</span>
                  </div>
                ))}
                <span className="max-w-[110px] text-xs text-[#F3EEE5]/[.68]">{open ? `until ${open.title.toLowerCase()} closes` : `until ${next!.title.toLowerCase()} opens`}</span>
              </div>
            ) : null}
            <a href="#apply" className="mn-btn inline-flex h-10 items-center rounded-xl px-4 text-[13px] font-semibold">Can I apply? →</a>
            <Link href="/portal/calculator" className="mn-ob !h-10 !rounded-xl !px-4 !text-[13px]">Calculate my marks</Link>
          </div>
        </div>
      </section>

      <section aria-label={`Induction ${induction} timeline`} className="mn-card-glass rounded-[20px] border border-white/[.07] px-[22px] py-[18px]">
        <div className="mb-3.5 flex items-center justify-between"><h2 className="text-[15px] font-semibold">Induction {induction} timeline</h2><Link href="/portal/calendar" className="text-xs text-[#B9AAFF] hover:text-[#D6CCFF]">Add to my calendar</Link></div>
        <div className="overflow-x-auto">
          <ol className="relative flex min-w-[40rem]">
            <span aria-hidden className="absolute left-[7px] right-[7px] top-[6px] h-0.5 bg-white/[.08]" />
            <span aria-hidden className="mn-grow-x absolute left-[7px] top-[6px] h-0.5 bg-[linear-gradient(90deg,#3DDC97,#7B61FF)] shadow-[0_0_10px_rgba(123,97,255,.7)]" style={{ width: `calc(${fill}% - 14px * ${fill / 100})` }} />
            {line.map((s, i) => (
              <li key={`${s.title}-${i}`} className="relative flex flex-1 flex-col gap-1.5 pr-2">
                <span aria-hidden className={cn("relative z-[1] h-3.5 w-3.5 rounded-full border-2", s.state === "done" ? "border-[#3DDC97] bg-[#3DDC97] shadow-[0_0_10px_#3DDC97]" : s.state === "now" ? "border-[#B9AAFF] bg-[#7B61FF] shadow-[0_0_0_4px_rgba(123,97,255,.25),0_0_14px_rgba(123,97,255,.8)]" : "border-white/20 bg-[#17171C]")} />
                <b className={cn("text-[13px] font-semibold", s.state === "now" && "text-[#D6CCFF]")}>{s.title}</b>
                <span className="text-[11px] text-muted">{s.when}{s.state === "now" && i > 0 ? " · now" : ""}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr_1fr]">
        <section aria-label="What changed" className="mn-card-glass rounded-[20px] border border-white/[.07] p-5">
          <div className="flex items-center justify-between"><h2 className="text-[15px] font-semibold">What changed</h2><Link href="/portal/calculator" className="text-xs text-[#B9AAFF] hover:text-[#D6CCFF]">The scoring policy</Link></div>
          {!policy ? (
            <p className="mt-3 text-sm text-muted">PHF has not published the scoring policy for induction {induction} yet{previous ? `; induction ${running?.id ?? ""} was scored out of ${fmt(previous.total_marks)}` : ""}. It appears here, and in the calculator, as soon as it is in.</p>
          ) : (
            <>
              {previous ? (
                <>
                  <p className="mb-1.5 mt-3 text-xs text-muted">Induction {running?.id ?? induction - 1} · out of {fmt(previous.total_marks)}</p>
                  <div className="flex h-[26px] gap-[3px]" role="img" aria-label={was.map((c) => `${c.label} ${c.max_marks}`).join(", ")}>{was.map((c, i) => <span key={c.key} title={`${c.label} ${c.max_marks}`} className="mn-grow-x rounded-md opacity-55" style={{ flex: c.max_marks, background: SEG[i % SEG.length], animationDelay: `${i * 0.1}s` }} />)}</div>
                </>
              ) : null}
              <p className="mb-1.5 mt-3.5 text-xs text-[#D6CCFF]">Induction {induction} · out of {fmt(policy.total_marks)}</p>
              <div className="flex h-[26px] gap-[3px]" role="img" aria-label={now_.map((c) => `${c.label} ${c.max_marks}`).join(", ")}>
                {now_.map((c, i) => <span key={c.key} title={`${c.label} ${c.max_marks}`} className="mn-grow-x rounded-md" style={{ flex: c.max_marks, background: i === 0 && isNew(c.label) ? "linear-gradient(90deg,#7B61FF,#9B87FF)" : SEG[(i - (isNew(now_[0]!.label) ? 1 : 0) + SEG.length) % SEG.length], boxShadow: i === 0 && isNew(c.label) ? "0 0 14px rgba(123,97,255,.6)" : undefined, animationDelay: `${i * 0.1}s` }} />)}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-x-3.5 gap-y-1.5 text-xs">
                {now_.slice(0, 6).map((c, i) => {
                  const old = wasBy.get(c.label.toLowerCase());
                  const color = i === 0 && isNew(c.label) ? "#9B87FF" : SEG[(i - (isNew(now_[0]!.label) ? 1 : 0) + SEG.length) % SEG.length];
                  return <span key={c.key}><span style={{ color }}>■</span> {c.label} <b>{fmt(c.max_marks)}</b> {isNew(c.label) ? <span className="mn-pill v">new</span> : old != null && old !== c.max_marks ? <span className="text-muted">was {fmt(old)}</span> : null}</span>;
                })}
                {gone.length ? <span className="col-span-2 text-muted">Gone: {gone.join(", ")}</span> : null}
              </div>
            </>
          )}
        </section>

        <section id="apply" aria-label="Can you apply" className="mn-card-glass scroll-mt-6 rounded-[20px] border border-white/[.07] p-5 [animation-delay:.08s]">
          <ApplyChecklist
            items={["MBBS/BDS recognised by PMDC", "12 months of house job", "Valid PMDC permanent licence", ...(biggest && /pget|test/i.test(biggest.label) ? [`Passed ${biggest.label}`] : []), "Under the age limit on the closing date", "Domicile for your quota"]}
            pending={biggest && /pget|test/i.test(biggest.label) ? [`Passed ${biggest.label}`] : []}
          />
          <p className="mt-2.5 text-[11px] text-muted">A self-check kept in this browser. PHF&apos;s notification decides who can apply.</p>
        </section>

        <section aria-label="Your marks under the new policy" className="mn-card-glass rounded-[20px] border border-white/[.07] p-5 [animation-delay:.16s] [background:radial-gradient(260px_200px_at_100%_0%,rgba(123,97,255,.18),transparent_70%),rgba(23,23,28,.82)]">
          <h2 className="text-[15px] font-semibold">Your marks under the {policy ? "new " : ""}policy</h2>
          <p className="mt-0.5 text-xs text-muted">{policy ? `Out of ${fmt(policy.total_marks)}, in the calculator` : "Once PHF publishes it"}</p>
          {policy ? (
            <>
              <p className="mt-3.5 text-[40px] font-bold tracking-[-0.03em]">{fmt(policy.total_marks)} <span className="text-base font-normal text-muted">marks in all</span></p>
              <div className="mt-2.5 flex h-[18px] gap-0.5" aria-hidden>
                {Array.from({ length: ticks }, (_, i) => {
                  const share = biggest ? biggest.max_marks / policy.total_marks : 0;
                  const on = i < Math.round(share * ticks);
                  return <span key={i} className="flex-1 rounded-[2px]" style={{ background: on ? "#9B87FF" : "rgba(92,225,230,.55)", boxShadow: on ? "0 0 6px rgba(123,97,255,.55)" : undefined }} />;
                })}
              </div>
              {biggest ? <p className="mt-1.5 text-[11px] text-muted">{biggest.label} is {fmt(biggest.max_marks)} of {fmt(policy.total_marks)} · the rest is from your degree and record</p> : null}
            </>
          ) : <p className="mt-3.5 text-sm text-muted">The calculator has every past policy. This induction&apos;s is added the day PHF publishes it, and your total out of the new maximum shows here.</p>}
          {changed ? <div className="mt-3 rounded-xl border border-[rgba(229,160,75,.3)] bg-[rgba(229,160,75,.08)] px-3 py-2.5 text-xs leading-normal">No past induction was scored like this, so chances appear once the gazette is out. <Link href="/portal/guide" className="text-[#B9AAFF]">Why?</Link></div> : null}
          <Link href="/portal/calculator" className="mn-btn mt-3.5 inline-flex h-10 w-full items-center justify-center rounded-xl text-[13px] font-semibold">Calculate my marks</Link>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section aria-label="Induction news" className="mn-card-glass rounded-[20px] border border-white/[.07] p-5 [animation-delay:.2s]">
          <div className="flex items-center justify-between"><h2 className="text-[15px] font-semibold">Induction news</h2><Link href="/portal/calendar" className="text-xs text-[#B9AAFF] hover:text-[#D6CCFF]">Calendar</Link></div>
          <ul>
            <News tone="c" tag="Official" title={`PHF schedule for induction ${induction}`} body={`${rows.length} steps${firstList ? `, first merit list ${month(firstList)}` : ""}. Every date is on the calendar.`} when={announced ? day(announced) : ""} href="/portal/calendar" />
            {seats ? <News tone="c" tag="Official" title={`Seat matrix for induction ${induction}`} body={`${fmt(seats)} seats. Every speciality and hospital is on Hospitals.`} when="" href="/portal/explore" />
              : <News tone="a" tag="Expected" title={`Seat matrix for induction ${induction}`} body="We show every speciality and hospital the day it is published." when="soon" />}
            {policy ? <News tone="v" tag="meritNAMA" title={`Calculator has the induction ${induction} policy`} body={`Out of ${fmt(policy.total_marks)}${biggest ? `; enter ${biggest.label} when you have it` : ""}.`} when="" href="/portal/calculator" />
              : <News tone="a" tag="Expected" title={`Scoring policy for induction ${induction}`} body="The calculator switches to it as soon as PHF publishes it." when="soon" />}
            <News tone="n" tag="Guide" title="How the cycle works" body="Gazette, verification, rounds, consent and joining, in order." when="" href="/portal/guide" last />
          </ul>
        </section>
        <section aria-label="People are asking" className="mn-card-glass flex flex-col rounded-[20px] border border-white/[.07] p-5 [animation-delay:.25s]">
          <div className="flex items-center justify-between"><h2 className="text-[15px] font-semibold">People are asking</h2><Link href="/portal/community" className="text-xs text-[#B9AAFF] hover:text-[#D6CCFF]">Community</Link></div>
          {asking.length ? (
            <ul className="mt-3 flex flex-col gap-3 text-[13px]">
              {asking.map((t) => (
                <li key={t.id}>
                  <Link href={`/portal/community/${t.id}`} className="flex gap-2.5 hover:text-[#D6CCFF]">
                    <span className="w-10 flex-none rounded-[9px] bg-white/[.04] py-1 text-center"><b>{t.helpful}</b></span>
                    <span className="min-w-0">{t.title}<span className="block text-[11px] text-muted">{t.replies} answer{t.replies === 1 ? "" : "s"}{t.answered ? <> · <span className="text-[#3DDC97]">answered</span></> : null}</span></span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="mt-3 text-sm text-muted">No questions yet.</p>}
          <div className="mt-auto pt-3.5"><Link href="/portal/community/new" className="mn-btn inline-flex h-10 w-full items-center justify-center rounded-xl text-[13px] font-semibold">Ask about induction {induction}</Link></div>
        </section>
      </div>
    </>
  );
}

function News({ tone, tag, title, body, when, href, last }: { tone: string; tag: string; title: string; body: string; when: string; href?: string; last?: boolean }) {
  const inner = (
    <>
      <span className={`mn-pill ${tone} h-fit`}>{tag}</span>
      <div className="min-w-0 flex-1"><b className="font-semibold">{title}</b><p className="mt-[3px] text-xs text-muted">{body}</p></div>
      {when ? <span className="text-xs text-muted">{when}</span> : null}
    </>
  );
  return <li className={cn("border-white/[.05] py-3", !last && "border-b")}>{href ? <Link href={href} className="flex gap-3 hover:text-[#D6CCFF]">{inner}</Link> : <div className="flex gap-3">{inner}</div>}</li>;
}
