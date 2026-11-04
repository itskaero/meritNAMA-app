import Link from "next/link";
import { Instrument_Serif } from "next/font/google";
import type { LandingFigures } from "@/lib/data/public";
import { LogoMark, Wordmark } from "../brand";
import { CountUp } from "../charts/count-up";
import { LineChart } from "../charts/line-chart";
import { StatusIcon } from "../finder/status";
import { cn } from "../ui/cn";

const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--mn-font-serif", display: "swap" });

/**
 * One hand as a soft dark silhouette pointing right, wrist at the origin: a tapering
 * forearm that runs off-canvas, the palm, an extended index finger, curled fingers
 * and a thumb. Placed twice (one mirrored) so the fingertips nearly meet.
 */
function Hand() {
  return (
    <g fill="currentColor" stroke="currentColor" strokeLinecap="round">
      <path d="M-700 -62 L-20 -30 Q8 -28 10 0 Q8 28 -20 32 L-700 70 Z" stroke="none" />
      <rect x="-14" y="-36" width="96" height="74" rx="34" stroke="none" />
      <line x1="70" y1="-18" x2="178" y2="-6" strokeWidth="19" />
      <line x1="78" y1="0" x2="110" y2="22" strokeWidth="19" />
      <line x1="68" y1="17" x2="96" y2="39" strokeWidth="17" />
      <line x1="52" y1="30" x2="76" y2="50" strokeWidth="14" />
      <line x1="24" y1="-30" x2="80" y2="-40" strokeWidth="17" />
    </g>
  );
}

const chapter = "mn-rise mx-auto grid max-w-6xl gap-10 px-[max(16px,env(safe-area-inset-left,0px))] py-20 md:grid-cols-2 md:items-center md:py-28";
const eyebrow = "font-mono text-xs uppercase tracking-[0.18em] text-ember-hot";
const h2 = "font-[family-name:var(--mn-font-serif)] text-[clamp(2.2rem,5vw,3.6rem)] leading-[1.02] text-balance";

/** The public story page at "/" for signed-out visitors. Every number is live and aggregate. */
export function Landing({ f }: { f: LandingFigures }) {
  const maxComponent = Math.max(1, ...(f.policy?.components.map((c) => c.max) ?? [1]));
  return (
    <div className={cn(serif.variable, "min-h-screen bg-canvas text-ink")}>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <header className="relative isolate overflow-hidden bg-[radial-gradient(ellipse_70%_60%_at_50%_35%,#e2481f_0%,#b8250f_35%,#5e1006_70%,#0b0b0c_100%)] text-[#fff3ec]">
        {/* Two hands reaching toward the merit spark above the headline (drift is CSS; off under reduced motion) */}
        <svg aria-hidden viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice" className="pointer-events-none absolute inset-0 h-full w-full text-[#1c0502]">
          <defs>
            <filter id="mn-hand-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.4" /></filter>
          </defs>
          <g filter="url(#mn-hand-soft)" opacity="0.82">
            <g className="mn-hand-left"><g transform="translate(372 150) rotate(20)"><Hand /></g></g>
            <g className="mn-hand-right"><g transform="translate(828 300) rotate(-160) scale(1 -1)"><Hand /></g></g>
          </g>
        </svg>
        <nav aria-label="Site" className="relative z-10 mx-auto flex max-w-6xl items-center justify-between gap-4 px-[max(16px,env(safe-area-inset-left,0px))] py-5">
          <Link href="/" className="flex items-center gap-2.5 text-[#fff3ec]" aria-label="meritNAMA home">
            <LogoMark className="h-7 w-7" />
            <Wordmark />
          </Link>
          <ul className="hidden items-center gap-7 text-sm text-[#ffd9c7] md:flex">
            <li><Link href="/portal/finder" className="hover:text-white">Score finder</Link></li>
            <li><Link href="/portal/history" className="hover:text-white">Merit lists</Link></li>
            <li><Link href="/portal/community" className="hover:text-white">Community</Link></li>
          </ul>
          <Link href="/sign-in" className="rounded-full bg-[#fff3ec] px-4 py-2 text-sm font-semibold text-[#3a0d05] hover:bg-white">Sign in</Link>
        </nav>

        <div className="relative mx-auto grid min-h-[min(88vh,820px)] max-w-6xl place-items-center content-start px-[max(16px,env(safe-area-inset-left,0px))] pb-24 pt-[10vh]">
          <div className="relative z-10 grid justify-items-center gap-5 text-center">
            <span className="relative grid h-24 w-24 place-items-center">
              <span aria-hidden className="mn-spark absolute left-1/2 top-1/2 h-44 w-44 rounded-full bg-[radial-gradient(circle,#ffd2b8_0%,rgba(255,138,92,0.5)_32%,transparent_70%)]" />
              <LogoMark className="mn-spark relative h-14 w-14 text-[#fff3ec]" />
            </span>
            <h1 className="max-w-3xl font-[family-name:var(--mn-font-serif)] text-[clamp(2.6rem,7vw,5.4rem)] leading-[0.98] text-balance">
              Imagine a seat between your score <em>&amp; your future.</em>
            </h1>
            <p className="text-lg text-[#ffd9c7]">That&apos;s where meritNAMA works.</p>
            <div className="mt-2 flex flex-wrap justify-center gap-3">
              <Link href="/portal/finder" className="rounded-full bg-[#fff3ec] px-6 py-3 font-semibold text-[#3a0d05] hover:bg-white">Find where your score can go</Link>
              <a href="#story" className="rounded-full border border-[#ffd9c7]/50 px-6 py-3 font-semibold text-[#fff3ec] hover:bg-white/10">See how it works</a>
            </div>
          </div>
        </div>
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-canvas" />
      </header>

      <main id="story">
        {/* ── Figures ─────────────────────────────────────────────────────── */}
        <section aria-label="In numbers" className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-[max(16px,env(safe-area-inset-left,0px))] pt-6 md:grid-cols-4">
          {[
            [f.rounds, "merit rounds"],
            [f.allocations, "allocations"],
            [f.seats, "seats in the latest matrix"],
            [f.hospitals, "hospitals"],
          ].map(([v, l]) => (
            <div key={l as string} className="mn-rise border-l border-line pl-4">
              <p className="font-display text-[clamp(2rem,5vw,3.4rem)] font-extrabold leading-none tracking-tight [font-stretch:115%]"><CountUp value={v as number} /></p>
              <p className="mt-2 text-sm text-muted">{l}</p>
            </div>
          ))}
        </section>

        {/* ── 1. Score ────────────────────────────────────────────────────── */}
        {f.policy ? (
          <section className={chapter} aria-labelledby="ch-score">
            <div>
              <p className={eyebrow}>Your score</p>
              <h2 id="ch-score" className={h2}>{f.policy.total} marks, {f.policy.components.length} parts.</h2>
              <p className="mt-5 max-w-md text-muted">The {f.policy.key} formula, exactly as published. See which part moves your merit most before you plan anything else.</p>
            </div>
            <ul className="grid gap-3">
              {f.policy.components.map((c, i) => (
                <li key={c.label} className="grid gap-1.5">
                  <span className="flex justify-between text-sm"><span>{c.label}</span><span className="font-mono text-muted">{c.max}</span></span>
                  <span className="h-2.5 overflow-hidden rounded-full bg-elevated">
                    <span className="mn-grow-x block h-full rounded-full bg-gradient-to-r from-ember-deep to-ember" style={{ width: `${(c.max / maxComponent) * 100}%`, animationDelay: `${i * 80}ms` }} />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* ── 2. Rounds ───────────────────────────────────────────────────── */}
        {f.latest && f.latest.trend.length > 1 ? (
          <section className={cn(chapter, "border-t border-line")} aria-labelledby="ch-rounds">
            <div className="md:order-2">
              <p className={eyebrow}>The rounds</p>
              <h2 id="ch-rounds" className={h2}>Merit moves every round.</h2>
              <p className="mt-5 max-w-md text-muted">
                Seats free up as candidates decline. In induction {f.latest.induction} ({f.latest.cycle}) the median closing merit went from{" "}
                {f.latest.trend[0]!.median.toFixed(2)} to {f.latest.trend.at(-1)!.median.toFixed(2)}{f.latest.maxMarks ? ` out of ${f.latest.maxMarks}` : ""} over {f.latest.trend.length} rounds.
              </p>
            </div>
            <div className="rounded-[1.5rem] border border-line bg-surface p-5">
              <LineChart
                title={`Induction ${f.latest.induction}: median closing merit per round`}
                xLabels={f.latest.trend.map((t) => `R${t.round}`)}
                series={[{ label: "Median closing merit", values: f.latest.trend.map((t) => t.median) }]}
                height={220}
              />
            </div>
          </section>
        ) : null}

        {/* ── 3. Options ──────────────────────────────────────────────────── */}
        {f.sample ? (
          <section className={cn(chapter, "border-t border-line")} aria-labelledby="ch-options">
            <div>
              <p className={eyebrow}>Your options</p>
              <h2 id="ch-options" className={h2}>Safe, borderline, out of reach.</h2>
              <p className="mt-5 max-w-md text-muted">
                Enter your marks and every speciality and hospital is sorted for you. Here is what a score of {f.sample.pct}% would have reached in {f.sample.program} · {f.sample.quota}, induction {f.latest?.induction}.
              </p>
            </div>
            <ul className="grid grid-cols-3 gap-3">
              {([["safe", f.sample.safe, "text-success"], ["borderline", f.sample.borderline, "text-amber"], ["out", f.sample.out, "text-subtle"]] as const).map(([k, n, tone], i) => (
                <li key={k} className="mn-rise rounded-[1.25rem] border border-line bg-surface p-4" style={{ animationDelay: `${i * 90}ms` }}>
                  <StatusIcon status={k} className={cn("h-4 w-4", tone)} />
                  <p className="mt-3 font-display text-4xl font-extrabold tabular-nums [font-stretch:110%]">{n}</p>
                  <p className="text-sm text-muted">{k === "out" ? "out of reach" : k}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* ── 4. Community ────────────────────────────────────────────────── */}
        <section className={cn(chapter, "border-t border-line")} aria-labelledby="ch-people">
          <div className="md:order-2">
            <p className={eyebrow}>The people</p>
            <h2 id="ch-people" className={h2}>Ask people who have been through it.</h2>
            <p className="mt-5 max-w-md text-muted">Questions and answers about every induction, round, speciality and hospital, from candidates who went through the same rounds. No phone numbers or CNICs, ever.</p>
          </div>
          <div className="rounded-[1.5rem] border border-line bg-surface p-6">
            <p className="font-display text-5xl font-extrabold tabular-nums [font-stretch:110%]"><CountUp value={f.discussions} /></p>
            <p className="mt-2 text-muted">posts so far, across {f.specialities} specialities and {f.hospitals} hospitals</p>
          </div>
        </section>

        {/* ── Closing band ─────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden bg-[radial-gradient(ellipse_60%_80%_at_50%_0%,#e2481f_0%,#8f1d0d_60%,#0b0b0c_100%)] px-[max(16px,env(safe-area-inset-left,0px))] py-24 text-center text-[#fff3ec]">
          <h2 className="mx-auto max-w-3xl font-[family-name:var(--mn-font-serif)] text-[clamp(2.2rem,5.4vw,4rem)] leading-[1.02] text-balance">
            Between your score and your seat, <em>there is a map.</em>
          </h2>
          <Link href="/sign-in" className="mt-8 inline-block rounded-full bg-[#fff3ec] px-6 py-3 font-semibold text-[#3a0d05] hover:bg-white">Sign in to start</Link>
        </section>
      </main>
      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-[max(16px,env(safe-area-inset-left,0px))] py-8 text-sm text-subtle">
        <span className="flex items-center gap-2"><LogoMark className="h-5 w-5 text-muted" />meritNAMA</span>
        <span>Independent. Not an official admissions authority. Past results do not guarantee placement.</span>
      </footer>
    </div>
  );
}
