import Image from "next/image";
import Link from "next/link";
import type { LandingFigures } from "@/lib/data/public";
import { LogoMark, Wordmark } from "../brand";
import { LineChart } from "../charts/line-chart";
import { StatusIcon } from "../finder/status";
import { Icon } from "../icon";
import { Badge } from "../ui/badge";
import { cn } from "../ui/cn";
import { PHOTOS } from "./photos";

const gutter = "px-[max(16px,env(safe-area-inset-left,0px))]";
const section = cn("mx-auto grid max-w-6xl gap-10 py-16 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:items-center md:py-24", gutter);
const eyebrow = "text-xs font-semibold uppercase tracking-[0.16em] text-signal";
const h2 = "font-serif text-[clamp(1.9rem,4vw,2.9rem)] font-semibold leading-[1.08] tracking-[-0.01em] text-heading";
const lead = "mt-4 max-w-md text-[1.02rem] leading-relaxed text-muted";

const fmt = (n: number) => n.toLocaleString("en-US");
const dateOf = (d: Date | null) => (d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : null);

/**
 * The public story page at "/" for signed-out visitors: an editorial walk from the
 * hero to the data sources. Every number is live and aggregate; nothing is
 * illustrative. Photography is credited in the footer (src/components/landing/photos.ts).
 */
export function Landing({ f }: { f: LandingFigures }) {
  const hero = PHOTOS.hero;
  const maxComponent = Math.max(1, ...(f.policy?.components.map((c) => c.max) ?? [1]));
  const updated = dateOf(f.updatedAt);
  return (
    <div className="min-h-screen bg-canvas text-ink">
      {/* ── Hero: statement on ivory, the institution in a photograph ─────── */}
      <header className="relative bg-ivory text-navy">
        <nav aria-label="Site" className={cn("relative z-10 mx-auto flex max-w-6xl items-center justify-between gap-4 py-5", gutter)}>
          <Link href="/" className="flex items-center gap-2.5" aria-label="meritNAMA home">
            <LogoMark className="h-7 w-7 text-navy" />
            <Wordmark className="text-navy" />
          </Link>
          <ul className="hidden items-center gap-7 text-sm text-slate md:flex">
            <li><a href="#trends" className="hover:text-navy">Merit trends</a></li>
            <li><a href="#calculate" className="hover:text-navy">Score calculation</a></li>
            <li><a href="#institutions" className="hover:text-navy">Hospitals</a></li>
            <li><a href="#method" className="hover:text-navy">Methodology</a></li>
          </ul>
          <Link href="/sign-in" className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-ivory hover:bg-slate">Sign in</Link>
        </nav>

        <div className={cn("mx-auto grid max-w-6xl gap-10 pb-16 pt-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] md:items-stretch md:pb-20 md:pt-10", gutter)}>
          <div className="grid content-center gap-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">Postgraduate merit, from the published record</p>
            <h1 className="font-serif text-[clamp(2.5rem,5.6vw,4.4rem)] font-semibold leading-[1.02] tracking-[-0.015em] text-navy">
              Know where your merit <em className="font-normal">can take you.</em>
            </h1>
            <p className="max-w-lg text-lg leading-relaxed text-slate">
              meritNAMA turns PHF&apos;s published merit lists, seat matrices and scoring policy into a clear record of closing merit, seats and rounds, so you can plan with evidence rather than rumour.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/portal/finder" className="inline-flex items-center gap-2 rounded-lg bg-navy px-5 py-3 font-medium text-ivory hover:bg-slate">
                Find where your score can go <Icon name="arrow" className="h-4 w-4" />
              </Link>
              <a href="#trends" className="rounded-lg border border-navy/25 px-5 py-3 font-medium text-navy hover:bg-navy/5">See how merit moved</a>
            </div>
            <p className="text-sm text-slate/80">Independent and free to use. Not an official admissions authority.</p>
          </div>
          <figure className="relative min-h-[300px] overflow-hidden rounded-xl md:min-h-[460px]">
            <Image src={hero.src} alt={hero.alt} fill priority sizes="(min-width: 768px) 560px, 100vw" className="object-cover" style={{ objectPosition: hero.position }} />
            <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-navy/80 to-transparent px-4 pb-3 pt-10 text-xs text-ivory/90">{hero.caption}</figcaption>
          </figure>
        </div>
      </header>

      <main id="main">
        {/* ── Platform statistics ─────────────────────────────────────────── */}
        <section aria-labelledby="in-numbers" className={cn("mx-auto max-w-6xl py-12", gutter)}>
          <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="in-numbers" className="text-sm font-semibold uppercase tracking-[0.14em] text-muted">The record so far</h2>
            <p className="text-sm text-muted">From published lists{updated ? `, last updated ${updated}` : ""}</p>
          </div>
          <dl className="grid grid-cols-2 border-y border-line md:grid-cols-4">
            {([
              [f.rounds, "merit rounds published", `${f.inductions} induction${f.inductions === 1 ? "" : "s"}`],
              [f.allocations, "seat allocations", "every row of every list"],
              [f.seats, "seats in the latest matrix", `${f.specialities} specialities`],
              [f.hospitals, "hospitals", "with seats in the latest matrix"],
            ] as const).map(([v, l, hint], i) => (
              <div key={l} className={cn("grid gap-1 py-6 pr-4", i > 0 && "md:border-l md:border-line md:pl-6", i % 2 === 1 && "border-l border-line pl-4 md:pl-6", i >= 2 && "border-t border-line md:border-t-0")}>
                <dd className="order-1 text-[clamp(2rem,4.4vw,3rem)] font-semibold leading-none tracking-tight text-heading tabular-nums">{fmt(v)}</dd>
                <dt className="order-2 text-sm text-ink">{l}</dt>
                <dd className="order-3 text-xs text-muted">{hint}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* ── Historical merit trends ─────────────────────────────────────── */}
        {f.latest && f.latest.trend.length > 1 ? (
          <section id="trends" className={cn(section, "scroll-mt-6")} aria-labelledby="ch-trends">
            <div>
              <p className={eyebrow}>Historical closing merit</p>
              <h2 id="ch-trends" className={h2}>Merit moves every round.</h2>
              <p className={lead}>
                Seats free up as candidates decline. In induction {f.latest.induction} ({f.latest.cycle}) the median closing merit went from{" "}
                {f.latest.trend[0]!.median.toFixed(2)} to {f.latest.trend.at(-1)!.median.toFixed(2)}{f.latest.maxMarks ? ` out of ${f.latest.maxMarks}` : ""} over {f.latest.trend.length} rounds.
              </p>
            </div>
            <figure className="m-0 rounded-xl border border-line bg-surface p-5 shadow-[var(--mn-shadow-1)]">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <figcaption className="text-sm font-semibold text-heading">Median closing merit per round · induction {f.latest.induction}</figcaption>
                <Badge tone="calculated">Calculated from published lists</Badge>
              </div>
              <LineChart
                title={`Induction ${f.latest.induction}: median closing merit per round`}
                xLabels={f.latest.trend.map((t) => `R${t.round}`)}
                series={[{ label: "Median closing merit", values: f.latest.trend.map((t) => t.median) }]}
                height={220}
              />
              <p className="mt-3 text-xs text-muted">Closing merit is the lowest mark allocated to a programme, quota and speciality in a round; the median is across all of them. Source: PHF merit lists, rounds 1–{f.latest.trend.length}.</p>
            </figure>
          </section>
        ) : null}

        {/* ── Merit exploration ───────────────────────────────────────────── */}
        {f.sample ? (
          <section className={cn(section, "border-t border-line")} aria-labelledby="ch-explore">
            <div className="md:order-2">
              <p className={eyebrow}>Merit exploration</p>
              <h2 id="ch-explore" className={h2}>Safe, borderline, out of reach.</h2>
              <p className={lead}>
                Enter your marks and every speciality and hospital is sorted against past closing merit. This is what a score of {f.sample.pct}% would have reached in {f.sample.program} · {f.sample.quota}, induction {f.latest?.induction}.
              </p>
              <Link href="/portal/finder" className="mt-6 inline-flex items-center gap-2 font-medium text-signal hover:underline">Open the score finder <Icon name="arrow" className="h-4 w-4" /></Link>
            </div>
            <div className="grid gap-3">
              <ul className="grid grid-cols-3 gap-3">
                {([["safe", f.sample.safe, "text-success"], ["borderline", f.sample.borderline, "text-amber"], ["out", f.sample.out, "text-muted"]] as const).map(([k, n, tone]) => (
                  <li key={k} className="rounded-xl border border-line bg-surface p-4 shadow-[var(--mn-shadow-1)]">
                    <StatusIcon status={k} className={cn("h-4 w-4", tone)} />
                    <p className="mt-3 text-4xl font-semibold tabular-nums text-heading">{n}</p>
                    <p className="text-sm text-muted">{k === "out" ? "out of reach" : k} options</p>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted">A worked example on past rounds, not a prediction for the next one.</p>
            </div>
          </section>
        ) : null}

        {/* ── Score calculation ───────────────────────────────────────────── */}
        {f.policy ? (
          <section id="calculate" className={cn(section, "scroll-mt-6 border-t border-line")} aria-labelledby="ch-score">
            <div>
              <p className={eyebrow}>Score calculation</p>
              <h2 id="ch-score" className={h2}>{f.policy.total} marks, {f.policy.components.length} parts.</h2>
              <p className={lead}>The {f.policy.key} scoring policy, exactly as published. Work out your own aggregate and see which part moves your merit most.</p>
              <Link href="/portal/calculator" className="mt-6 inline-flex items-center gap-2 font-medium text-signal hover:underline">Open the merit calculator <Icon name="arrow" className="h-4 w-4" /></Link>
            </div>
            <div className="rounded-xl border border-line bg-surface p-5 shadow-[var(--mn-shadow-1)]">
              <div className="mb-4 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-heading">Maximum marks per component</p>
                <Badge tone="official">Published policy</Badge>
              </div>
              <ul className="grid gap-3">
                {f.policy.components.map((c) => (
                  <li key={c.label} className="grid gap-1.5">
                    <span className="flex justify-between gap-3 text-sm"><span>{c.label}</span><span className="font-medium tabular-nums text-heading">{c.max}</span></span>
                    <span className="h-2 overflow-hidden rounded-full bg-elevated">
                      <span className="block h-full rounded-full bg-teal" style={{ width: `${(c.max / maxComponent) * 100}%` }} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        {/* ── Institutional and programme exploration ─────────────────────── */}
        <section id="institutions" className="scroll-mt-6 border-t border-line bg-surface">
          <div className={section}>
            <figure className="relative m-0 min-h-[260px] overflow-hidden rounded-xl md:order-2 md:min-h-[380px]">
              <Image src={PHOTOS.institutions.src} alt={PHOTOS.institutions.alt} fill sizes="(min-width: 768px) 600px, 100vw" className="object-cover" style={{ objectPosition: PHOTOS.institutions.position }} />
            </figure>
            <div>
              <p className={eyebrow}>Hospitals and programmes</p>
              <h2 className={h2}>{fmt(f.hospitals)} hospitals, {fmt(f.specialities)} specialities.</h2>
              <p className={lead}>Every hospital and speciality has its own page: seats by programme and quota, closing merit round by round, CPSP accreditation where it can be matched, and reviews from verified trainees.</p>
              <Link href="/portal/explore" className="mt-6 inline-flex items-center gap-2 font-medium text-signal hover:underline">Browse hospitals <Icon name="arrow" className="h-4 w-4" /></Link>
            </div>
          </div>
        </section>

        {/* ── Methodology and data sources ────────────────────────────────── */}
        <section id="method" className={cn("mx-auto max-w-6xl scroll-mt-6 py-16 md:py-24", gutter)} aria-labelledby="ch-method">
          <p className={eyebrow}>Methodology</p>
          <h2 id="ch-method" className={cn(h2, "max-w-2xl")}>Where every number comes from.</h2>
          <div className="mt-10 grid gap-x-10 gap-y-8 md:grid-cols-3">
            {[
              { tone: "official" as const, label: "Official", title: "Published by PHF", body: "Merit lists for every round, seat matrices and the scoring policy, imported as published. Nothing is edited." },
              { tone: "calculated" as const, label: "Calculated", title: "Worked out from the record", body: "Closing merit (the lowest mark allocated to a seat in a round), medians, movement between rounds and your own aggregate in the calculator." },
              { tone: "simulated" as const, label: "Estimate", title: "Clearly marked as estimates", body: "Next-round predictions and what-if simulations are labelled as estimates on every page and never shown as official results." },
            ].map((x) => (
              <div key={x.title} className="grid content-start gap-2 border-t border-line pt-5">
                <Badge tone={x.tone} className="justify-self-start">{x.label}</Badge>
                <h3 className="font-serif text-xl font-semibold">{x.title}</h3>
                <p className="text-sm leading-relaxed text-muted">{x.body}</p>
              </div>
            ))}
          </div>
          <p className="mt-10 max-w-2xl text-sm text-muted">
            CPSP accreditation comes from CPSP&apos;s published list and is matched to hospitals by name, so a missing match is not proof that a unit is unaccredited. Personal details on merit lists (names, phone numbers, CNICs) are never stored.
          </p>
        </section>

        {/* ── Closing band ─────────────────────────────────────────────────── */}
        <section className={cn("bg-navy py-20 text-center text-ivory", gutter)}>
          <h2 className="mx-auto max-w-3xl font-serif text-[clamp(2rem,4.6vw,3.3rem)] font-semibold leading-[1.08] text-ivory">
            Between your score and your seat, <em className="font-normal">there is a record.</em>
          </h2>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/sign-in" className="rounded-lg bg-ivory px-5 py-3 font-medium text-navy hover:bg-white">Sign in to start</Link>
            <Link href="/portal/history" className="rounded-lg border border-ivory/30 px-5 py-3 font-medium text-ivory hover:bg-ivory/10">Browse merit lists</Link>
          </div>
        </section>
      </main>
      <footer className={cn("mx-auto grid max-w-6xl gap-3 py-8 text-sm text-muted md:grid-cols-[auto_1fr] md:items-start md:gap-10", gutter)}>
        <span className="flex items-center gap-2 text-heading"><LogoMark className="h-5 w-5" />meritNAMA</span>
        <div className="grid gap-1 md:justify-items-end md:text-right">
          <span>Independent. Not an official admissions authority. Past results do not guarantee placement.</span>
          <span className="text-xs">
            Photographs: {Object.values(PHOTOS).map((p, i) => (
              <span key={p.src}>{i ? "; " : ""}<a href={p.credit.url} className="underline underline-offset-2 hover:text-ink">{p.credit.text}</a></span>
            ))}.
          </span>
        </div>
      </footer>
    </div>
  );
}
