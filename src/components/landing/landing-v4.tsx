import Link from "next/link";
import type { LandingCheck, LandingFigures } from "@/lib/data/public";
import type { FeatureFlags } from "@/lib/domain/settings";
import { LogoMark, Wordmark } from "../brand";
import { cn } from "../ui/cn";
import { MarksCheck } from "./marks-check";

type Tracks = { induction: number; total: number; tracks: { program: string; quota: string }[] } | null;
type Teaser = { open: number; latest: { title: string; employer: string | null; city: string | null; lastDate: string | null; official: boolean }[] } | null;

const fmt = (n: number) => n.toLocaleString("en-US");
const frame = "mx-auto w-full max-w-6xl rounded-[28px] border border-white/10 bg-[#0E0E12]/80 shadow-[0_0_80px_rgba(110,86,255,.08)]";
const NAV = [["#lists", "Merit lists"], ["#chances", "Chances"], ["#jobs", "Jobs"], ["#faq", "FAQ"], ["/contact", "Contact"]] as const;

/** A violet-highlighted word in a heading. */
const V = ({ children }: { children: React.ReactNode }) => <span className="text-violet-pale">{children}</span>;

/**
 * The public landing page (v4 mockup "Landing"): framed sections on charcoal, a merit card
 * in the hero, four numbered features, the free marks check, jobs, and the record so far.
 * Signed-in people never see it (they go to their area).
 */
export function LandingV4({ f, features, tracks, check, query, jobs }: {
  f: LandingFigures; features: FeatureFlags; tracks: Tracks; check: LandingCheck | null; query: { marks: string; track: string }; jobs: Teaser;
}) {
  const s = f.sample;
  const trend = f.latest?.trend ?? [];
  const last = trend.at(-1), before = trend.at(-2);
  const fell = last && before ? last.median - before.median : null;
  const more = [
    { t: "Hospitals and specialities", b: "Seats, closing merit history, CPSP accreditation and verified reviews." },
    ...(features.calculator ? [{ t: "Merit calculator", b: "Your aggregate under the published scoring policy, part by part." }] : []),
    ...(features.planner ? [{ t: "Preference planner", b: "Put your choices in order and see where the list would place you." }] : []),
    ...(features.simulation ? [{ t: "What if?", b: "Change consent and re-run the next list privately." }] : []),
    { t: "Joining and wasted seats", b: "Who joined after the last list, and which seats went unused." },
    { t: "Calendar", b: "PHF's dates, expected rounds and job deadlines in one place." },
  ];
  return (
    <div className="min-h-screen bg-canvas px-3 py-6 text-ink sm:px-6 sm:py-10 [background:radial-gradient(60rem_30rem_at_50%_-10%,rgba(23,107,103,.25),transparent),radial-gradient(50rem_40rem_at_90%_40%,rgba(110,86,255,.14),transparent),var(--mn-navy-950)]">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <header className={cn(frame, "relative overflow-hidden px-5 pb-12 pt-5 sm:px-10 sm:pb-16")}>
        <nav aria-label="Site" className="flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5" aria-label="meritNAMA home"><LogoMark animate className="h-7 w-7" /><Wordmark /></Link>
          <ul className="hidden items-center gap-7 text-sm text-muted md:flex">
            {NAV.map(([h, l]) => <li key={h}><a href={h} className="hover:text-ink">{l}</a></li>)}
          </ul>
          <Link href="/sign-in" className="inline-flex items-center gap-2 text-sm font-medium text-ink"><span className="grid h-8 w-8 place-items-center rounded-full border border-line-strong">↗</span>Sign in</Link>
        </nav>
        <div className="mt-12 grid items-center gap-10 lg:mt-16 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="grid gap-6">
            <h1 className="text-[clamp(2.2rem,5vw,3.6rem)] font-medium leading-[1.08] tracking-tight text-heading">
              Know where you stand. See every <V>merit list</V>, your <V>chances</V>, and where you&apos;ll train.
            </h1>
            <p className="text-sm text-muted">For doctors applying to Punjab&apos;s postgraduate training{f.inductions ? `, across ${f.inductions} inductions` : ""}. Independent; not an official admissions authority.</p>
            <div className="flex flex-wrap items-center gap-4">
              <Link href="/sign-in" className="mn-btn inline-flex h-12 items-center gap-3 rounded-full pl-5 pr-2 text-sm font-semibold uppercase tracking-wider">Get started <span className="grid h-8 w-8 place-items-center rounded-full bg-violet text-white">↗</span></Link>
              <a href="#lists" className="text-sm text-muted hover:text-ink">See how it works →</a>
            </div>
          </div>
          {s && f.latest ? (
            <div aria-label="A sample merit card" className="mx-auto w-full max-w-sm -rotate-6 rounded-3xl border border-violet-soft/50 bg-[linear-gradient(140deg,#0F2A2E,#14102A_60%,#2A1F5C)] p-6 shadow-[0_0_60px_rgba(110,86,255,.35)]">
              <div className="flex items-center justify-between text-sm"><span className="font-semibold text-[#F3EEE5]">meritNAMA</span><span className="text-xs text-violet-pale">Induction {f.latest.induction}</span></div>
              <p className="mt-8 text-xs text-[#F3EEE5]/60">Typical merit · {s.program} {s.quota}</p>
              <p className="text-5xl font-light tabular-nums text-[#F3EEE5]">{s.marks.toFixed(2)}<span className="ml-1 text-lg text-[#F3EEE5]/60">/{s.total}</span></p>
              <p className="mt-6 flex justify-between font-mono text-xs"><span className="text-success">{s.safe} safe</span><span className="text-amber">{s.borderline} target</span><span className="text-danger">{s.out} reach</span></p>
            </div>
          ) : null}
        </div>
      </header>

      {/* ── Every list ───────────────────────────────────────────────────── */}
      <section id="lists" aria-labelledby="lists-h" className={cn(frame, "mt-6 grid gap-8 p-5 sm:p-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]")}>
        <div className="grid content-start gap-5">
          <h2 id="lists-h" className="text-3xl font-medium leading-tight text-heading"><V>Every list</V> and every seat, in one place</h2>
          <div className="relative overflow-hidden rounded-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/v4/night-study.jpg" alt="A doctor studying late at night" className="h-72 w-full object-cover" />
            {last ? (
              <div className="absolute inset-x-4 bottom-4 flex items-center justify-between rounded-xl border border-white/15 bg-black/60 px-4 py-3 text-sm backdrop-blur">
                <span><span className="block font-semibold text-[#F3EEE5]">Round {last.round} of induction {f.latest!.induction}</span><span className="text-xs text-[#F3EEE5]/70">Median closing merit {last.median.toFixed(2)}</span></span>
                {fell != null ? <span className={fell <= 0 ? "text-success" : "text-danger"}>{fell <= 0 ? "▼" : "▲"} {Math.abs(fell).toFixed(2)}</span> : null}
              </div>
            ) : null}
          </div>
        </div>
        <div className="grid content-start gap-6">
          <div className="grid gap-4 text-sm sm:grid-cols-2">
            <p className="text-heading">meritNAMA keeps every PHF merit list{f.inductions ? ` of ${f.inductions} inductions` : ""}: {fmt(f.allocations)} allocations in {fmt(f.rounds)} rounds.</p>
            <p className="text-muted">Names, marks, seats, consent and preferences, easy to search and compare.</p>
          </div>
          <ol className="grid gap-3 sm:grid-cols-2">
            {[
              ["Merit lists", "Every round and candidate, with their preferences and seat."],
              ["My chances", "Where your marks get a seat, from past closing merit."],
              ["Estimates", "The next round, simulated from consent replies before PHF."],
              ["Community and jobs", "Ask other doctors, read reviews, and find open posts."],
            ].map(([t, b], i) => (
              <li key={t} className="rounded-2xl border border-line bg-card p-5">
                <span className="text-3xl font-light text-violet-pale">0{i + 1}</span>
                <p className="mt-3 font-semibold text-heading">{t}</p>
                <p className="mt-1 text-sm text-muted">{b}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Your chances: the free marks check ───────────────────────────── */}
      <section id="chances" aria-labelledby="chances-h" className={cn(frame, "mt-6 grid gap-6 p-5 sm:p-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]")}>
        <div className="grid content-start gap-3">
          <h2 id="chances-h" className="text-3xl font-medium leading-tight text-heading">Check your marks, <V>free</V></h2>
          <p className="text-sm text-muted">Put in your marks and see how many seats were safe, a target or a reach last time. Counts only; nothing is saved.</p>
        </div>
        <MarksCheck tracks={tracks} check={check} query={query} />
      </section>

      {/* ── Much more ─────────────────────────────────────────────────────── */}
      <section aria-labelledby="more-h" className={cn(frame, "mt-6 grid gap-6 p-5 sm:p-10")}>
        <h2 id="more-h" className="text-3xl font-medium leading-tight text-heading"><V>Much more</V> than a merit list</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {more.map((x) => <li key={x.t} className="rounded-2xl border border-line bg-card p-5"><p className="font-semibold text-heading">{x.t}</p><p className="mt-1 text-sm text-muted">{x.b}</p></li>)}
        </ul>
      </section>

      {/* ── Jobs teaser ──────────────────────────────────────────────────── */}
      {jobs && jobs.open ? (
        <section id="jobs" aria-labelledby="jobs-h" className={cn(frame, "mt-6 grid gap-5 p-5 sm:p-10")}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="jobs-h" className="text-3xl font-medium leading-tight text-heading"><V>{fmt(jobs.open)} open jobs</V> for doctors</h2>
            <Link href="/sign-in" className="text-sm font-semibold text-violet-pale hover:underline">Sign in to see them all →</Link>
          </div>
          <ul className="grid gap-3 md:grid-cols-3">
            {jobs.latest.map((j, i) => (
              <li key={i} className="rounded-2xl border border-line bg-card p-5">
                <p className="line-clamp-2 font-semibold text-heading">{j.title}</p>
                <p className="mt-1 text-sm text-muted">{[j.employer, j.city].filter(Boolean).join(" · ")}</p>
                <p className="mt-2 text-xs text-muted">{j.lastDate ? `Apply by ${j.lastDate}` : "Last date in the advert"}{j.official ? " · official" : ""}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ── The record, FAQ, footer ───────────────────────────────────────── */}
      <section id="faq" aria-labelledby="faq-h" className={cn(frame, "mt-6 grid gap-8 p-5 sm:p-10 lg:grid-cols-2")}>
        <div className="grid content-start gap-4">
          <h2 id="faq-h" className="text-3xl font-medium leading-tight text-heading">Questions</h2>
          {[
            ["Is this official?", "No. meritNAMA is independent and reads PHF's published lists. Always check with PHF."],
            ["Where do estimates come from?", "From the gazette, portal preferences and consent replies, run through the same allocation rules. They are labelled as estimates and replaced by the real list."],
            ["What do you keep about me?", "Your email to sign in, and what you save. Emails, phone numbers and CNICs in PHF's files are never stored."],
          ].map(([q, a]) => (
            <details key={q} className="rounded-xl border border-line bg-card p-4"><summary className="cursor-pointer font-semibold text-heading">{q}</summary><p className="mt-2 text-sm text-muted">{a}</p></details>
          ))}
        </div>
        <dl className="grid grid-cols-2 content-start gap-3">
          {([[fmt(f.allocations), "seat allocations"], [fmt(f.seats), "seats in the latest matrix"], [fmt(f.hospitals), "hospitals"], [fmt(f.rounds), `rounds in ${f.inductions} inductions`]] as const).map(([v, l]) => (
            <div key={l} className="rounded-2xl border border-line bg-card p-5"><dd className="text-3xl font-semibold tabular-nums text-heading">{v}</dd><dt className="mt-1 text-sm text-muted">{l}</dt></div>
          ))}
        </dl>
      </section>
      <footer className="mx-auto mt-8 flex max-w-6xl flex-wrap items-center justify-between gap-3 px-2 text-xs text-subtle">
        <span>meritNAMA · independent, not an official admissions authority</span>
        <span className="flex gap-4"><Link href="/privacy" className="hover:text-ink">Privacy</Link><Link href="/terms" className="hover:text-ink">Terms</Link><Link href="/contact" className="hover:text-ink">Contact</Link></span>
      </footer>
    </div>
  );
}
