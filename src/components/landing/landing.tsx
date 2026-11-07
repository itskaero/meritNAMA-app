import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { LandingFigures } from "@/lib/data/public";
import type { FeatureFlags } from "@/lib/domain/settings";
import { LogoMark, Wordmark } from "../brand";
import { LineChart } from "../charts/line-chart";
import { StatusIcon } from "../finder/status";
import { Icon, type IconName } from "../icon";
import { Badge } from "../ui/badge";
import { cn } from "../ui/cn";
import { ART, PHOTOS, type Photo } from "../brand-assets";

const gutter = "px-[max(16px,env(safe-area-inset-left,0px))] sm:px-6";
const wrap = cn("mx-auto max-w-6xl", gutter);
const eyebrow = "text-xs font-semibold uppercase tracking-[0.18em]";
const h2 = "font-serif text-[clamp(2rem,4.2vw,3.1rem)] font-semibold leading-[1.06] tracking-[-0.012em]";
const lead = "mt-5 max-w-lg text-[1.05rem] leading-relaxed";
const textLink = "inline-flex items-center gap-2 font-medium text-signal underline-offset-4 hover:underline";

const fmt = (n: number) => n.toLocaleString("en-US");
const dateOf = (d: Date | null) => (d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : null);
const mask = (src: string): CSSProperties => ({ ["--mn-mask" as string]: `url(${src})` });

/** A photograph that keeps its focal point when cropped; gently zooms on hover. */
function Photo({ photo, sizes, className, priority = false, parallax = false }: { photo: Photo; sizes: string; className?: string; priority?: boolean; parallax?: boolean }) {
  return (
    <div className={cn("relative overflow-hidden bg-navy", className)}>
      <Image
        src={photo.src}
        alt={photo.alt}
        fill
        priority={priority}
        sizes={sizes}
        className={cn("object-cover transition-transform duration-[1.2s] ease-[var(--mn-ease)] group-hover:scale-[1.03]", parallax && "mn-parallax")}
        style={{ objectPosition: photo.position }}
      />
    </div>
  );
}

/** One step of the journey: a large photograph and a text panel that overlaps it on wide screens. */
function Chapter({ n, kicker, title, photo, flip = false, children, aside }: { n: string; kicker: string; title: ReactNode; photo: Photo; flip?: boolean; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className={cn(wrap, "group grid items-center gap-8 py-14 md:grid-cols-12 md:gap-0 md:py-24")} aria-label={kicker}>
      <Photo photo={photo} sizes="(min-width: 768px) 700px, 100vw" parallax className={cn("aspect-[4/3] rounded-xl md:col-span-7 md:row-start-1 md:aspect-[5/4]", flip ? "md:col-start-6" : "md:col-start-1")} />
      <div className={cn("mn-reveal relative md:col-span-6 md:row-start-1", flip ? "md:col-start-1" : "md:col-start-7")}>
        <div className="rounded-xl border border-line bg-surface p-6 shadow-[var(--mn-shadow-2)] sm:p-8">
          <p className={cn(eyebrow, "flex items-center gap-3 text-signal")}>
            <span className="font-serif text-2xl font-semibold tracking-normal text-ember">{n}</span>
            <span aria-hidden className="h-px w-8 bg-line-strong" />
            {kicker}
          </p>
          <h2 className={cn(h2, "mt-3 text-heading")}>{title}</h2>
          <div className="mt-4 grid gap-4 text-[1.02rem] leading-relaxed text-muted">{children}</div>
          {aside ? <div className="mt-6">{aside}</div> : null}
        </div>
      </div>
    </section>
  );
}

type Capability = { icon: IconName; title: string; body: string; href: string; estimate?: boolean };

/**
 * The public story page at "/" for signed-out visitors: a cinematic hero, then the
 * candidate's journey in five chapters, each alternating with live figures from the
 * published record. Every number is live and aggregate; images are illustrations
 * (src/components/landing/photos.ts) and never captioned as a real institution.
 */
export function Landing({ f, features }: { f: LandingFigures; features: FeatureFlags }) {
  const hero = PHOTOS.hero;
  const maxComponent = Math.max(1, ...(f.policy?.components.map((c) => c.max) ?? [1]));
  const updated = dateOf(f.updatedAt);
  const capabilities: Capability[] = [
    { icon: "history", title: "Merit lists, every round", body: "Each published round, filterable by programme, quota, speciality and hospital, with the round before alongside.", href: "/portal/history" },
    { icon: "trend", title: "Closing merit analysis", body: "The lowest mark allocated to each seat group, round by round, and how it moved: who entered, moved or left.", href: "/portal/history" },
    { icon: "target", title: "Score finder", body: "Your marks against every option's past closing merit, sorted into safe, borderline and out of reach.", href: "/portal/finder" },
    { icon: "building", title: "Hospitals and specialities", body: "Seats by programme and quota, closing merit history, CPSP accreditation where it can be matched, and verified reviews.", href: "/portal/explore" },
    ...(features.calculator ? [{ icon: "calculator" as const, title: "Merit calculator", body: "Your aggregate under the published scoring policy, part by part.", href: "/portal/calculator" }] : []),
    ...(features.planner ? [{ icon: "list" as const, title: "Preference planner", body: "Draft preference lists from your shortlist, checked against closing merit.", href: "/portal/preferences" }] : []),
    { icon: "spark", title: "Next-round ranges", body: "Where closing merit will probably land next round, from the same step in past inductions.", href: "/portal/history", estimate: true },
    ...(features.simulation ? [{ icon: "sliders" as const, title: "What-if simulation", body: "Change your own consent and see the next list re-run privately.", href: "/portal/simulation", estimate: true }] : []),
    ...(features.community ? [{ icon: "chat" as const, title: "Round rooms and questions", body: "A one-line room on every round, opened with its figures on round day, and answers from verified candidates.", href: "/portal/community" }] : []),
  ];

  return (
    <div className="min-h-screen bg-canvas text-ink">
      {/* ── Hero: the photograph carries the page; text sits in its dark half ───── */}
      <header className="relative isolate overflow-hidden bg-navy text-ivory">
        {/* Phones: the photograph fills the top half (her face clear of the text); wider screens: the whole header. */}
        <div className="absolute inset-x-0 top-0 -z-10 h-[56%] overflow-hidden md:inset-0 md:h-auto">
          <Image src={hero.src} alt={hero.alt} fill priority sizes="100vw" className="mn-hero-img object-cover object-[76%_35%] md:object-[72%_45%]" />
        </div>
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-navy from-45% via-navy/40 via-60% to-navy/0 md:bg-gradient-to-r md:from-navy/95 md:from-0% md:via-navy/70 md:via-50% md:to-navy/0 " />

        <nav aria-label="Site" className={cn(wrap, "relative flex items-center justify-between gap-4 py-5")}>
          <Link href="/" className="flex items-center gap-2.5" aria-label="meritNAMA home">
            <LogoMark className="h-7 w-7 text-ivory" />
            <Wordmark className="text-ivory" />
          </Link>
          <ul className="hidden items-center gap-7 text-sm text-ivory/80 md:flex">
            <li><a href="#journey" className="hover:text-ivory">The journey</a></li>
            <li><a href="#trends" className="hover:text-ivory">Merit trends</a></li>
            <li><a href="#features" className="hover:text-ivory">What you can do</a></li>
            <li><a href="#method" className="hover:text-ivory">Methodology</a></li>
          </ul>
          <div className="flex items-center gap-2">
            <Link href="/sign-in" className="rounded-lg border border-ivory/35 px-4 py-2 text-sm font-medium text-ivory hover:bg-ivory/10">Sign in</Link>
            <details className="group/menu relative md:hidden">
              <summary className="grid h-10 w-10 cursor-pointer list-none place-items-center rounded-lg border border-ivory/35 text-ivory [&::-webkit-details-marker]:hidden" aria-label="Menu">
                <Icon name="menu" className="h-5 w-5 group-open/menu:hidden" />
                <Icon name="close" className="hidden h-5 w-5 group-open/menu:block" />
              </summary>
              <ul className="absolute right-0 top-12 z-20 grid w-56 gap-1 rounded-xl border border-line bg-surface p-2 text-sm text-ink shadow-[var(--mn-shadow-2)]">
                {[["#journey", "The journey"], ["#trends", "Merit trends"], ["#features", "What you can do"], ["#method", "Methodology"]].map(([h, l]) => (
                  <li key={h}><a href={h} className="block rounded-lg px-3 py-2.5 hover:bg-hover">{l}</a></li>
                ))}
              </ul>
            </details>
          </div>
        </nav>

        <div className={cn(wrap, "relative grid min-h-[min(84vh,760px)] content-end gap-6 pb-12 pt-[44vh] md:content-center md:gap-7 md:pb-24 md:pt-16")}>
          <p className={cn(eyebrow, "text-gold")}>Postgraduate merit, from the published record</p>
          <h1 className="max-w-[13ch] font-serif text-[clamp(2.7rem,6.6vw,5.2rem)] font-semibold leading-[0.98] tracking-[-0.02em] text-ivory">
            Know where your merit <em className="font-normal text-gold">can take you.</em>
          </h1>
          <p className="max-w-lg text-lg leading-relaxed text-ivory/85">
            meritNAMA turns PHF&apos;s published merit lists, seat matrices and scoring policy into a clear record of closing merit, seats and rounds, so you plan with evidence rather than rumour.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/portal/finder" className="inline-flex items-center gap-2 rounded-lg bg-gold px-5 py-3 font-semibold text-navy transition-colors hover:bg-ivory">
              Find where your score can go <Icon name="arrow" className="h-4 w-4" />
            </Link>
            <a href="#trends" className="rounded-lg border border-ivory/35 px-5 py-3 font-medium text-ivory transition-colors hover:bg-ivory/10">See how merit moved</a>
          </div>
          <p className="text-sm text-ivory/70">Independent and free to use. Not an official admissions authority.</p>
        </div>
      </header>

      <main id="main">
        {/* ── The record so far ───────────────────────────────────────────────── */}
        <section aria-labelledby="in-numbers" className="relative isolate overflow-hidden bg-ivory text-navy">
          <Image src={ART.paperIvory} alt="" fill sizes="100vw" className="-z-10 object-cover opacity-70" />
          <div className={cn(wrap, "py-14 md:py-16")}>
            <div className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
              <h2 id="in-numbers" className={cn(eyebrow, "text-slate")}>The record so far</h2>
              <p className="text-sm text-slate">From published lists{updated ? `, last updated ${updated}` : ""}</p>
            </div>
            <dl className="grid grid-cols-2 gap-y-8 md:grid-cols-4">
              {([
                [f.rounds, "merit rounds published", `${f.inductions} induction${f.inductions === 1 ? "" : "s"}`],
                [f.allocations, "seat allocations", "every row of every list"],
                [f.seats, "seats in the latest matrix", `${f.specialities} specialities`],
                [f.hospitals, "hospitals", "with seats in the latest matrix"],
              ] as const).map(([v, l, hint], i) => (
                <div key={l} className={cn("mn-reveal grid gap-1 pr-4", i % 2 === 1 && "border-l border-navy/15 pl-5", i >= 1 && "md:border-l md:border-navy/15 md:pl-6")}>
                  <dd className="order-1 font-serif text-[clamp(2.4rem,5vw,3.6rem)] font-semibold leading-none tracking-tight tabular-nums">{fmt(v)}</dd>
                  <dt className="order-2 mt-1 text-sm font-medium">{l}</dt>
                  <dd className="order-3 text-xs text-slate">{hint}</dd>
                </div>
              ))}
            </dl>
            <Image src={ART.divider} alt="" width={1351} height={59} className="mx-auto mt-12 h-auto w-full max-w-3xl opacity-80" />
          </div>
        </section>

        <div id="journey" className="scroll-mt-6">
          <div className={cn(wrap, "pt-16 md:pt-24")}>
            <p className={cn(eyebrow, "text-signal")}>The journey</p>
            <h2 className={cn(h2, "mt-3 max-w-3xl text-heading")}>From the library desk to the training post, <em className="font-normal">one decision at a time.</em></h2>
          </div>

          {/* 01 · Preparing */}
          <Chapter
            n="01"
            kicker="Preparing"
            photo={PHOTOS.studyDesk}
            title={f.policy ? <>{f.policy.total} marks, {f.policy.components.length} parts.</> : "Know what your merit is made of."}
            aside={
              f.policy ? (
                <div className="grid gap-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-heading">Maximum marks per part</p>
                    <Badge tone="official">Published policy {f.policy.key}</Badge>
                  </div>
                  <ul className="grid gap-2.5">
                    {f.policy.components.map((c) => (
                      <li key={c.label} className="grid gap-1">
                        <span className="flex justify-between gap-3 text-sm"><span>{c.label}</span><span className="font-medium tabular-nums text-heading">{c.max}</span></span>
                        <span className="h-1.5 overflow-hidden rounded-full bg-elevated"><span className="mn-grow-x block h-full rounded-full bg-teal" style={{ width: `${(c.max / maxComponent) * 100}%` }} /></span>
                      </li>
                    ))}
                  </ul>
                  {features.calculator ? <Link href="/portal/calculator" className={textLink}>Work out your own aggregate <Icon name="arrow" className="h-4 w-4" /></Link> : null}
                </div>
              ) : null
            }
          >
            <p>Merit is an aggregate of published parts. Before anything else, know which of them moves your total most, under the policy exactly as PHF published it.</p>
          </Chapter>
        </div>

        {/* ── Data band: merit moves every round ─────────────────────────────────── */}
        {f.latest && f.latest.trend.length > 1 ? (
          <section id="trends" className="relative isolate scroll-mt-6 overflow-hidden bg-navy text-ivory" aria-labelledby="ch-trends">
            <Image src={ART.contourNavy} alt="" fill sizes="100vw" className="-z-10 object-cover opacity-45" />
            <div className={cn(wrap, "grid gap-10 py-16 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] md:items-center md:py-24")}>
              <div className="mn-reveal">
                <p className={cn(eyebrow, "text-gold")}>Historical closing merit</p>
                <h2 id="ch-trends" className={cn(h2, "mt-3 text-ivory")}>Merit moves every round.</h2>
                <p className={cn(lead, "text-ivory/80")}>
                  Seats free up as candidates decline. In induction {f.latest.induction} ({f.latest.cycle}) the median closing merit went from{" "}
                  <strong className="font-semibold text-ivory">{f.latest.trend[0]!.median.toFixed(2)}</strong> to <strong className="font-semibold text-ivory">{f.latest.trend.at(-1)!.median.toFixed(2)}</strong>
                  {f.latest.maxMarks ? ` out of ${f.latest.maxMarks}` : ""} over {f.latest.trend.length} rounds.
                </p>
              </div>
              <figure className="mn-reveal m-0 rounded-xl bg-surface p-5 text-ink shadow-[var(--mn-shadow-2)] sm:p-6">
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
            </div>
          </section>
        ) : null}

        {/* 02 · Entering training */}
        <Chapter
          n="02"
          kicker="Entering training"
          photo={PHOTOS.doctor}
          flip
          title="Every round, as it was published."
          aside={
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link href="/portal/history" className={textLink}>Browse merit lists <Icon name="arrow" className="h-4 w-4" /></Link>
              {f.rounds ? <span className="text-sm text-muted"><strong className="font-semibold text-heading tabular-nums">{fmt(f.rounds)}</strong> rounds across {f.inductions} induction{f.inductions === 1 ? "" : "s"}</span> : null}
            </div>
          }
        >
          <p>Each induction runs through several rounds as seats are declined and re-allotted. Every list is kept whole, so you can see who entered, who moved and who left between any two rounds.</p>
          {features.community ? <p>On round day, the round&apos;s own room opens with its figures, and candidates who hold a verified record compare notes in one-line messages.</p> : null}
        </Chapter>

        {/* 03 · Exploring postgraduate options */}
        <Chapter
          n="03"
          kicker="Exploring options"
          photo={PHOTOS.planning}
          title="Safe, borderline, out of reach."
          aside={
            f.sample ? (
              <div className="grid gap-3">
                <ul className="grid grid-cols-3 gap-2.5">
                  {([["safe", f.sample.safe, "text-success"], ["borderline", f.sample.borderline, "text-amber"], ["out", f.sample.out, "text-muted"]] as const).map(([k, v, tone]) => (
                    <li key={k} className="rounded-lg border border-line bg-canvas p-3">
                      <StatusIcon status={k} className={cn("h-4 w-4", tone)} />
                      <p className="mt-2 text-3xl font-semibold tabular-nums text-heading">{v}</p>
                      <p className="text-xs text-muted">{k === "out" ? "out of reach" : k}</p>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted">What {f.sample.pct}% would have reached in {f.sample.program} · {f.sample.quota}, induction {f.latest?.induction}. A worked example on past rounds, not a prediction.</p>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  <Link href="/portal/finder" className={textLink}>Open the score finder <Icon name="arrow" className="h-4 w-4" /></Link>
                  {features.planner ? <Link href="/portal/preferences" className={textLink}>Plan your preferences <Icon name="arrow" className="h-4 w-4" /></Link> : null}
                </div>
              </div>
            ) : (
              <Link href="/portal/finder" className={textLink}>Open the score finder <Icon name="arrow" className="h-4 w-4" /></Link>
            )
          }
        >
          <p>Enter your marks and every speciality and hospital is sorted against past closing merit, so the long list of programmes becomes a short list you can act on.</p>
        </Chapter>

        {/* 04 · Comparing institutions: full-bleed photograph with the figures over it */}
        <section aria-labelledby="ch-institutions" className="group relative isolate overflow-hidden bg-navy">
          <Image src={PHOTOS.hospital.src} alt={PHOTOS.hospital.alt} fill sizes="100vw" className="mn-parallax -z-10 object-cover" style={{ objectPosition: PHOTOS.hospital.position }} />
          <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-navy/95 via-navy/55 to-navy/10" />
          <div className={cn(wrap, "grid min-h-[620px] content-end gap-8 py-14 md:grid-cols-12 md:items-end md:py-20")}>
            <div className="mn-reveal text-ivory md:col-span-6">
              <p className={cn(eyebrow, "flex items-center gap-3 text-gold")}>
                <span className="font-serif text-2xl font-semibold tracking-normal">04</span><span aria-hidden className="h-px w-8 bg-ivory/30" />Comparing institutions
              </p>
              <h2 id="ch-institutions" className={cn(h2, "mt-3 text-ivory")}>{fmt(f.hospitals)} hospitals, {fmt(f.specialities)} specialities.</h2>
              <p className={cn(lead, "text-ivory/85")}>Every hospital and speciality has its own page: seats by programme and quota, closing merit round by round, CPSP accreditation where it can be matched, and reviews from verified trainees.</p>
              <Link href="/portal/explore" className="mt-6 inline-flex items-center gap-2 rounded-lg bg-ivory px-5 py-3 font-medium text-navy transition-colors hover:bg-white">Browse hospitals <Icon name="arrow" className="h-4 w-4" /></Link>
            </div>
            <figure className="mn-reveal relative m-0 hidden overflow-hidden rounded-xl shadow-[var(--mn-shadow-2)] ring-1 ring-ivory/20 md:col-span-4 md:col-start-9 md:block">
              <div className="relative aspect-[4/3]">
                <Image src={PHOTOS.campus.src} alt={PHOTOS.campus.alt} fill sizes="380px" className="object-cover" style={{ objectPosition: PHOTOS.campus.position }} />
              </div>
              <figcaption className="bg-surface px-4 py-3 text-xs text-muted">Old colleges and new teaching blocks: compare them on the same published figures.</figcaption>
            </figure>
          </div>
        </section>

        {/* ── What you can do: the platform's actual capabilities ──────────────── */}
        <section id="features" className="relative isolate scroll-mt-6 overflow-hidden bg-surface" aria-labelledby="ch-features">
          <span aria-hidden className="mn-mask pointer-events-none absolute -right-24 top-10 -z-10 hidden h-[520px] w-[720px] text-teal opacity-[0.09] md:block" style={mask(ART.contour)} />
          <div className={cn(wrap, "py-16 md:py-24")}>
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-end">
              <div>
                <p className={cn(eyebrow, "text-signal")}>What you can do</p>
                <h2 id="ch-features" className={cn(h2, "mt-3 text-heading")}>Tools built on the record, <em className="font-normal">not on rumour.</em></h2>
              </div>
              <p className="max-w-md text-muted md:justify-self-end">Everything below works today on the published lists. Estimates are labelled as estimates wherever they appear.</p>
            </div>
            <ul className="mt-12 grid gap-x-10 border-t border-line sm:grid-cols-2 lg:grid-cols-3">
              {capabilities.map((c) => (
                <li key={c.title} className="mn-reveal border-b border-line">
                  <Link href={c.href} className="group/cap grid h-full grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 py-6">
                    <span className="row-span-2 grid h-10 w-10 place-items-center rounded-lg bg-tint text-signal transition-colors group-hover/cap:bg-teal group-hover/cap:text-white"><Icon name={c.icon} className="h-5 w-5" /></span>
                    <span className="flex flex-wrap items-center gap-2 font-semibold text-heading">
                      {c.title}
                      {c.estimate ? <Badge tone="simulated">Estimate</Badge> : null}
                    </span>
                    <span className="text-sm leading-relaxed text-muted">{c.body}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 05 · Deciding */}
        <Chapter
          n="05"
          kicker="Deciding"
          photo={PHOTOS.graduate}
          flip
          title="Choose with the whole picture."
          aside={
            <div className="flex flex-wrap gap-3">
              <Link href="/sign-in" className="inline-flex items-center gap-2 rounded-lg bg-signal px-5 py-3 font-medium text-signal-ink transition-colors hover:bg-signal-strong">Start with your record <Icon name="arrow" className="h-4 w-4" /></Link>
              {features.simulation ? <Link href="/portal/simulation" className="inline-flex items-center rounded-lg border border-line-strong px-5 py-3 font-medium text-ink hover:bg-hover">Try a what-if</Link> : null}
            </div>
          }
        >
          <p>Link your merit record and everything above becomes personal: your seat and its closing merit, what your marks reach, alerts when a shortlisted seat moves, and the people near your marks weighing the same options, counted anonymously.</p>
        </Chapter>

        {/* ── Methodology and data sources ────────────────────────────────────── */}
        <section id="method" className="relative isolate scroll-mt-6 overflow-hidden bg-ivory text-navy" aria-labelledby="ch-method">
          <Image src={ART.paperIvory} alt="" fill sizes="100vw" className="-z-10 object-cover opacity-70" />
          <div className={cn(wrap, "grid gap-12 py-16 md:grid-cols-[minmax(0,1fr)_260px] md:py-24")}>
            <div>
              <p className={cn(eyebrow, "text-slate")}>Methodology</p>
              <h2 id="ch-method" className={cn(h2, "mt-3 max-w-2xl text-navy")}>Where every number comes from.</h2>
              <div className="mt-10 grid gap-x-10 gap-y-8 md:grid-cols-3">
                {[
                  { tone: "official" as const, label: "Official", title: "Published by PHF", body: "Merit lists for every round, seat matrices and the scoring policy, imported as published. Nothing is edited." },
                  { tone: "calculated" as const, label: "Calculated", title: "Worked out from the record", body: "Closing merit (the lowest mark allocated to a seat in a round), medians, movement between rounds and your own aggregate." },
                  { tone: "simulated" as const, label: "Estimate", title: "Marked as estimates", body: "Next-round ranges and what-if simulations are labelled as estimates on every page and never shown as official results." },
                ].map((x) => (
                  <div key={x.title} className="mn-reveal grid content-start gap-2 border-t border-navy/15 pt-5">
                    <Badge tone={x.tone} className="justify-self-start bg-surface">{x.label}</Badge>
                    <h3 className="font-serif text-xl font-semibold text-navy">{x.title}</h3>
                    <p className="text-sm leading-relaxed text-slate">{x.body}</p>
                  </div>
                ))}
              </div>
              <p className="mt-10 max-w-2xl text-sm text-slate">
                CPSP accreditation comes from CPSP&apos;s published list and is matched to hospitals by name, so a missing match is not proof that a unit is unaccredited. Personal details on merit lists (names, phone numbers, CNICs) are never stored.
              </p>
            </div>
            <Image src={ART.seal} alt="" width={712} height={711} className="mn-reveal hidden h-auto w-full self-center opacity-90 md:block" />
          </div>
        </section>

        {/* ── Closing band ─────────────────────────────────────────────────────── */}
        <section className="relative isolate overflow-hidden bg-navy py-24 text-center text-ivory">
          <Image src={ART.paperWaves} alt="" fill sizes="100vw" className="-z-10 object-cover opacity-35" />
          <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-navy/70 to-navy/90" />
          <div className={wrap}>
            <h2 className="mx-auto max-w-3xl font-serif text-[clamp(2.1rem,4.8vw,3.6rem)] font-semibold leading-[1.06] text-ivory">
              Between your score and your seat, <em className="font-normal text-gold">there is a record.</em>
            </h2>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Link href="/sign-in" className="rounded-lg bg-gold px-5 py-3 font-semibold text-navy transition-colors hover:bg-ivory">Sign in to start</Link>
              <Link href="/portal/history" className="rounded-lg border border-ivory/35 px-5 py-3 font-medium text-ivory transition-colors hover:bg-ivory/10">Browse merit lists</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-canvas">
        <span aria-hidden className="mn-mask mx-auto block aspect-[1522/345] w-full max-w-5xl text-slate opacity-[0.14]" style={mask(ART.skyline)} />
        <div className={cn(wrap, "grid gap-3 border-t border-line py-8 text-sm text-muted md:grid-cols-[auto_1fr] md:items-start md:gap-10")}>
          <span className="flex items-center gap-2 text-heading"><LogoMark className="h-5 w-5" />meritNAMA</span>
          <div className="grid gap-1 md:justify-items-end md:text-right">
            <span>Independent. Not an official admissions authority. Past results do not guarantee placement.</span>
            <span className="text-xs">Images are illustrations of medical education, not photographs of particular institutions.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
