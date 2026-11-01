import type { Metadata } from "next";
import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLockup } from "@/components/brand";
import { Icon, type IconName } from "@/components/icon";
import { RevealOnScroll } from "@/components/landing/reveal";
import { SiteNav } from "@/components/landing/site-nav";
import campus from "@/assets/journey/campus.jpg";
import induction from "@/assets/journey/induction.jpg";
import hero from "@/assets/journey/journey-hero.jpg";
import specialist from "@/assets/journey/specialist.jpg";
import study from "@/assets/journey/study.jpg";
import training from "@/assets/journey/training.jpg";

export const metadata: Metadata = {
  title: { absolute: "MeritNAMA — From Study to Speciality" },
};

type Chapter = {
  id: string;
  n: string;
  icon: IconName;
  title: string;
  kicker: string;
  body: string;
  points: string[];
  image: StaticImageData;
  alt: string;
  /** Extra label over the artwork, only where the art does not already say it. */
  overlay?: ReactNode;
};

const chapters: Chapter[] = [
  {
    id: "preparation",
    n: "01",
    icon: "books",
    title: "Preparation",
    kicker: "Late nights, clear direction",
    body: "Plan your path, understand the competition and make informed choices long before the induction opens.",
    points: ["How merit is calculated under each policy", "Where you stand against past inductions", "Which specialities fit your goals"],
    image: study,
    alt: "A medical graduate studying at a desk late at night beside books labelled IMM, Pediatrics, Medicine and FCPS.",
  },
  {
    id: "induction",
    n: "02",
    icon: "clipboard",
    title: "Induction & Placement",
    kicker: "The decision that shapes the next years",
    body: "Analyse merit, explore preferences and simulate your placement — with every result clearly labelled as a simulation.",
    points: ["Closing merit by speciality and hospital", "Preference lists you can draft and compare", "Placement simulation on the real seat matrix"],
    image: induction,
    alt: "The graduate in front of a screen titled PRP Induction with merit, preferences and placement checked off.",
  },
  {
    id: "training",
    n: "03",
    icon: "stethoscope",
    title: "Training",
    kicker: "Into the wards",
    body: "Track your training, rotations and progression with insights drawn from those who walked the corridor before you.",
    points: ["Rotations and milestones in one place", "What each programme actually involves", "Guides from trainees and supervisors"],
    image: training,
    alt: "The trainee in a white coat walking down a hospital corridor under a sign reading Pediatrics.",
  },
  {
    id: "specialist",
    n: "04",
    icon: "award",
    title: "Specialist",
    kicker: "A future, well planned",
    body: "A focused, deliberate journey towards your speciality — and the confidence that every step was an informed one.",
    points: ["Fellowship and exit-exam pathways", "Career outcomes by speciality", "Give back: mentor the next cohort"],
    image: specialist,
    alt: "A confident specialist doctor in a white coat with a stethoscope, looking up at a sunset sky over the hospital.",
    overlay: (
      <span className="glass absolute bottom-4 left-4 inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold">
        <Icon name="award" className="h-4 w-4 text-amber" /> Consultant track
      </span>
    ),
  },
];

const features: { icon: IconName; title: string; body: string }[] = [
  { icon: "bars", title: "Real data", body: "Merit, trends and competition from official induction records — with sources and dates shown." },
  { icon: "layers", title: "Simulations", body: "Predict your placement on the actual seat matrix. Always labelled, never mistaken for a result." },
  { icon: "route", title: "Career guidance", body: "Speciality insights, timelines and the questions worth asking before you choose." },
  { icon: "book", title: "Resources", body: "Guides, policy explainers and checklists for every stage of the journey." },
];

const principles: { icon: IconName; title: string; body: string }[] = [
  { icon: "shield", title: "Your data stays yours", body: "Self-hosted, server-side access checks, no third-party trackers." },
  { icon: "info", title: "Provenance on every number", body: "Historical, current or simulated — each figure says which it is." },
  { icon: "spark", title: "Independent", body: "MeritNAMA is not an admissions authority. Official decisions come from the official process." },
];

export default function LandingPage() {
  return (
    <>
      <SiteNav />
      <RevealOnScroll />

      <main id="main" className="overflow-x-clip">
        {/* ---------- Hero: the framed, cinematic opening ---------- */}
        <section aria-labelledby="hero-title" className="relative px-2 pt-2 sm:px-4 sm:pt-4">
          <div className="relative isolate flex min-h-[100svh] flex-col overflow-hidden rounded-[1.75rem] border border-white/5 sm:min-h-[calc(100svh-2rem)] sm:rounded-[2.5rem]">
            <Image
              src={hero}
              alt=""
              fill
              preload
              placeholder="blur"
              sizes="100vw"
              className="mn-push -z-20 object-cover object-[50%_40%]"
            />
            {/* Darken the centre for the headline; keep the study desk and the specialist visible at the edges. */}
            <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_55%_60%_at_50%_48%,rgba(10,9,24,0.82),rgba(10,9,24,0.35)_70%,rgba(10,9,24,0.15))]" />
            <div aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-2/5 bg-gradient-to-t from-canvas via-canvas/70 to-transparent" />
            <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-32 bg-gradient-to-b from-canvas/80 to-transparent" />

            <div className="flex flex-1 flex-col items-center justify-center px-5 pt-28 pb-10 text-center">
              <p className="mn-rise font-mono text-[0.7rem] font-semibold uppercase tracking-[0.32em] text-amber [animation-delay:200ms]">
                Your medical career, with data
              </p>
              <h1 id="hero-title" className="mn-rise mt-5 font-serif text-[length:var(--mn-text-display)] leading-[0.95] tracking-tight [animation-delay:350ms]">
                From Study
                <br />
                to <em className="bg-gradient-to-r from-signal-strong via-signal to-amber bg-clip-text text-transparent">Speciality</em>
              </h1>
              <p className="mn-rise mt-6 max-w-xl text-base text-muted sm:text-lg [animation-delay:550ms]">
                MeritNAMA is a data-driven companion for your postgraduate medical journey — from preparation and induction to
                training and beyond.
              </p>
              <div className="mn-rise mt-9 flex flex-wrap items-center justify-center gap-3 [animation-delay:700ms]">
                <Link
                  href="/start"
                  className="inline-flex h-12 items-center gap-2 rounded-full bg-signal px-6 font-semibold text-signal-ink shadow-glow transition-colors hover:bg-signal-strong"
                >
                  Get started <Icon name="arrow" className="h-4 w-4" />
                </Link>
                <a
                  href="#journey"
                  className="glass inline-flex h-12 items-center gap-2.5 rounded-full px-5 font-semibold transition-colors hover:bg-white/10"
                >
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-white/10">
                    <Icon name="play" className="h-3.5 w-3.5" />
                  </span>
                  Follow the journey
                </a>
              </div>
            </div>

            {/* Chapter strip along the bottom of the frame. */}
            <nav aria-label="Journey chapters" className="mn-rise px-4 pb-6 [animation-delay:900ms] sm:px-8">
              <ol className="mx-auto grid max-w-5xl grid-cols-2 gap-2 sm:grid-cols-4">
                {chapters.map((c) => (
                  <li key={c.id}>
                    <a
                      href={`#${c.id}`}
                      className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-canvas/40 px-3 py-2.5 backdrop-blur transition-colors hover:border-signal/40"
                    >
                      <span className="font-mono text-xs text-amber">{c.n}</span>
                      <span className="text-sm font-medium text-muted group-hover:text-ink">{c.title}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </div>
        </section>

        {/* ---------- Journey: four chapters on one glowing path ---------- */}
        <section id="journey" aria-labelledby="journey-title" className="relative mx-auto max-w-6xl scroll-mt-24 px-5 py-24 sm:py-32">
          <div className="mn-reveal mx-auto max-w-2xl text-center">
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.28em] text-signal">The journey</p>
            <h2 id="journey-title" className="mt-4 font-serif text-5xl leading-none tracking-tight sm:text-6xl">
              One path. <em className="text-amber">Four chapters.</em>
            </h2>
            <p className="mt-5 text-muted">
              Every doctor&apos;s road to a speciality passes the same milestones. MeritNAMA gives you the data to walk each one with
              intent.
            </p>
          </div>

          <div className="relative mt-20">
            {/* The path: lavender at the desk, sunset gold at the end. */}
            <div
              aria-hidden
              className="absolute top-0 bottom-0 left-[19px] w-px bg-gradient-to-b from-signal/0 via-signal/60 to-amber shadow-[0_0_12px_rgba(245,185,122,0.6)] lg:left-1/2"
            />
            <ol className="space-y-24 sm:space-y-32">
              {chapters.map((c, i) => (
                <li key={c.id} id={c.id} className="relative scroll-mt-28 pl-14 lg:pl-0">
                  <span aria-hidden className="absolute top-2 left-[12px] grid h-4 w-4 place-items-center lg:left-1/2 lg:-translate-x-1/2">
                    <span className="mn-node absolute h-4 w-4 rounded-full bg-amber/40" />
                    <span className="relative h-2.5 w-2.5 rounded-full bg-amber shadow-[0_0_14px_var(--mn-amber)]" />
                  </span>
                  <article className="grid items-center gap-10 lg:grid-cols-2 lg:gap-24">
                    <div className={`mn-reveal relative ${i % 2 ? "lg:order-2" : ""}`}>
                      <div
                        className={`relative aspect-[4/3.4] overflow-hidden border border-white/10 shadow-float ${
                          i % 2 ? "rounded-[2rem] rounded-tl-[6rem]" : "rounded-[2rem] rounded-tr-[6rem]"
                        }`}
                      >
                        <Image src={c.image} alt={c.alt} fill placeholder="blur" sizes="(min-width: 1024px) 520px, 90vw" className="object-cover" />
                        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-canvas/70 via-transparent to-transparent" />
                      </div>
                      {c.overlay}
                    </div>
                    <div className={`mn-reveal ${i % 2 ? "lg:order-1 lg:text-right" : ""}`}>
                      <p className={`flex items-center gap-3 font-mono text-xs uppercase tracking-[0.24em] text-subtle ${i % 2 ? "lg:justify-end" : ""}`}>
                        <span className="text-amber">Chapter {c.n}</span> <span aria-hidden>·</span> {c.kicker}
                      </p>
                      <h3 className={`mt-4 flex items-center gap-4 text-3xl font-semibold tracking-tight sm:text-4xl ${i % 2 ? "lg:flex-row-reverse" : ""}`}>
                        <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl border border-signal/30 bg-signal/10 text-signal">
                          <Icon name={c.icon} className="h-6 w-6" />
                        </span>
                        {c.title}
                      </h3>
                      <p className="mt-4 text-lg text-muted">{c.body}</p>
                      <ul className={`mt-6 space-y-2.5 ${i % 2 ? "lg:ml-auto" : ""} w-fit text-left`}>
                        {c.points.map((p) => (
                          <li key={p} className="flex items-start gap-3 text-sm text-muted">
                            <Icon name="check" className="mt-0.5 h-4 w-4 flex-none text-signal" />
                            {p}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </article>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ---------- Features ---------- */}
        <section id="features" aria-labelledby="features-title" className="scroll-mt-24 px-5 pb-24 sm:pb-32">
          <div className="mx-auto max-w-6xl">
            <div className="mn-reveal flex flex-wrap items-end justify-between gap-6">
              <div>
                <p className="font-mono text-xs font-semibold uppercase tracking-[0.28em] text-signal">What you get</p>
                <h2 id="features-title" className="mt-4 max-w-xl font-serif text-5xl leading-none tracking-tight sm:text-6xl">
                  Plan smarter. <em className="text-signal-strong">Train better.</em>
                </h2>
              </div>
              <p className="max-w-sm text-muted">Tools built around the questions every candidate asks — answered with records, not rumours.</p>
            </div>
            <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {features.map((f, i) => (
                <li
                  key={f.title}
                  className="mn-reveal glass group relative overflow-hidden rounded-[1.75rem] p-6 transition-transform duration-500 hover:-translate-y-1"
                  style={{ transitionDelay: `${i * 80}ms` }}
                >
                  <div aria-hidden className="absolute -top-20 -right-20 h-40 w-40 rounded-full bg-signal/20 opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100" />
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-signal/25 to-signal-deep/10 text-signal ring-1 ring-signal/30">
                    <Icon name={f.icon} className="h-6 w-6" />
                  </span>
                  <h3 className="mt-6 text-lg font-semibold">{f.title}</h3>
                  <p className="mt-2 text-sm text-muted">{f.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---------- Principles ---------- */}
        <section id="about" aria-labelledby="about-title" className="scroll-mt-24 border-y border-line bg-surface/40 px-5 py-20">
          <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="mn-reveal">
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.28em] text-signal">About</p>
              <h2 id="about-title" className="mt-4 font-serif text-4xl leading-tight tracking-tight sm:text-5xl">
                One honest picture of the whole process.
              </h2>
              <p className="mt-5 text-muted">
                MeritNAMA turns scattered gazettes, merit lists and word of mouth into one honest picture. It is in active development —
                features arrive in stages and are marked until they are connected to verified data.
              </p>
            </div>
            <ul className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
              {principles.map((p) => (
                <li key={p.title} className="mn-reveal flex gap-4 rounded-2xl border border-line bg-canvas/60 p-5">
                  <Icon name={p.icon} className="mt-0.5 h-5 w-5 flex-none text-amber" />
                  <div>
                    <h3 className="font-semibold">{p.title}</h3>
                    <p className="mt-1 text-sm text-muted">{p.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---------- Closing call to action over the campus at dusk ---------- */}
        <section aria-labelledby="cta-title" className="px-2 py-20 sm:px-4 sm:py-28">
          <div className="mn-reveal relative isolate mx-auto max-w-7xl overflow-hidden rounded-[2rem] border border-white/10 px-6 py-24 text-center sm:rounded-[2.5rem] sm:py-32">
            <Image src={campus} alt="" fill placeholder="blur" sizes="100vw" className="-z-20 object-cover" />
            <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-canvas/85 via-canvas/55 to-canvas/30" />
            <h2 id="cta-title" className="font-serif text-5xl leading-none tracking-tight sm:text-7xl">
              Reach <em className="text-amber">further.</em>
            </h2>
            <p className="mx-auto mt-5 max-w-md text-muted">Start with your merit. End with a speciality you chose on purpose.</p>
            <Link
              href="/start"
              className="mt-9 inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 font-semibold text-canvas transition-colors hover:bg-signal-strong"
            >
              Open MeritNAMA <Icon name="arrow" className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="px-5 pb-10">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 border-t border-line pt-8 sm:flex-row sm:items-center">
          <BrandLockup />
          <p className="text-xs text-subtle">
            MeritNAMA is independent and not an official admissions authority. Simulations are estimates, not decisions.
          </p>
        </div>
      </footer>
    </>
  );
}
