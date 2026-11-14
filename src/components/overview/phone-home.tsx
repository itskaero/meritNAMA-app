import Link from "next/link";
import { cn } from "../ui/cn";
import { SeatStrip } from "./overview-parts";

type Cell = { label: string; state: "none" | "other" | "seat" | "next"; title: string };

export type PhoneHomeProps = {
  greeting: string;
  name: string | null;
  initials: string;
  live: string | null;
  marks: string | null;
  total: number | null;
  percentile: number | null;
  counts: { safe: number; target: number; reach: number } | null;
  seat: { round: number; title: string; left: string | null; cells: Cell[] } | null;
  list: { title: string; detail: string; href: string } | null;
  estimate: { title: string; detail: string; href: string } | null;
  finderHref: string;
};

/**
 * The Overview on a phone (docs/mockups/v4/PhoneHome.dc.html): greeting and marks in a
 * navy hero, the three chance counts, the seat with its countdown, the latest list and
 * estimate, and one button. Wider screens get the full hero instead.
 */
export function PhoneHome(p: PhoneHomeProps) {
  const band = p.percentile == null ? null : p.percentile >= 75 ? "High" : p.percentile >= 40 ? "Middle" : "Lower";
  return (
    <div className="grid gap-3.5 sm:hidden">
      <section aria-label="Your marks" className="mn-head rounded-[22px] px-4 pb-4 pt-4 text-[#F3EEE5] [&>*]:min-w-0">
        <span aria-hidden className="mn-head-blob b1" /><span aria-hidden className="mn-head-blob b2" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            {p.live ? <p className="flex items-center gap-1.5 text-xs text-[#F3EEE5]/70"><span className="text-[#3DDC97]">●</span> {p.live}</p> : null}
            <h1 className="mt-0.5 text-2xl font-bold tracking-[-0.02em]">{p.name ? `Hi, ${p.name}!` : p.greeting}</h1>
          </div>
          <Link href="/portal/workspace" aria-label="Me" className="mn-av !h-11 !w-11 !text-sm bg-[linear-gradient(135deg,#8B73FF,#5B3FF5)] shadow-[0_0_16px_rgba(110,86,255,.6)]">{p.initials}</Link>
        </div>
        <div className="relative mt-3.5 rounded-[18px] border border-[#F3EEE5]/[.12] bg-[rgba(16,36,58,.45)] px-4 py-3.5 backdrop-blur-[10px]">
          {p.marks ? (
            <div className="flex items-end justify-between gap-3">
              <div><p className="text-[13px] text-[#F3EEE5]/70">Your marks</p><p className="text-[40px] font-bold leading-none tracking-[-0.03em] tabular-nums">{p.marks}{p.total ? <span className="text-base font-semibold text-[#F3EEE5]/70"> / {p.total}</span> : null}</p></div>
              {p.percentile != null ? <span className="mb-1 rounded-full border border-[rgba(155,135,255,.5)] bg-[rgba(110,86,255,.25)] px-3 py-1 text-[13px] font-semibold shadow-[0_0_16px_rgba(110,86,255,.4)]">{p.percentile}th · {band}</span> : null}
            </div>
          ) : (
            <p className="text-sm text-[#F3EEE5]/80">Link your applicant record and this page follows your own merit. <Link href="/portal/workspace" className="font-semibold text-[#D6CCFF]">Link it on Me</Link>.</p>
          )}
        </div>
      </section>

      {p.counts ? (
        <div className="grid grid-cols-3 gap-2">
          {([["Safe", p.counts.safe, "#3DDC97", "61,220,151"], ["Target", p.counts.target, "#E5A04B", "229,160,75"], ["Reach", p.counts.reach, "#FF7A7A", "255,122,122"]] as const).map(([l, n, c, rgb]) => (
            <Link key={l} href={p.finderHref} className="rounded-[14px] border px-3 py-2.5" style={{ borderColor: `rgba(${rgb},.45)`, background: `linear-gradient(160deg,rgba(${rgb},.12),rgba(23,23,28,.8))` }}>
              <span className="block text-xs" style={{ color: c }}>{l}</span>
              <span className="block text-2xl font-bold tabular-nums" style={{ color: c }}>{n}</span>
            </Link>
          ))}
        </div>
      ) : null}

      {p.seat ? (
        <section aria-label="Your seat" className="rounded-[18px] border border-white/[.07] bg-[rgba(23,23,28,.82)] px-4 py-3.5">
          <div className="flex items-center justify-between text-[13px]"><span className="text-muted">Your seat · R{p.seat.round}</span>{p.seat.left ? <b className="text-[#FF7A7A]">{p.seat.left}</b> : null}</div>
          <p className="mt-1 truncate text-[17px] font-semibold">{p.seat.title}</p>
          <SeatStrip cells={p.seat.cells} />
        </section>
      ) : null}

      {p.list || p.estimate ? (
        <section aria-label="Latest" className="grid gap-3 rounded-[18px] border border-white/[.07] bg-[rgba(23,23,28,.82)] p-3.5">
          {[p.list && { ...p.list, icon: "✓", tone: "bg-[rgba(61,220,151,.14)] text-[#3DDC97]" }, p.estimate && { ...p.estimate, icon: "◷", tone: "bg-[rgba(155,135,255,.18)] text-[#C4B8FF]" }].filter(Boolean).map((r) => (
            <Link key={r!.title} href={r!.href} className="flex items-center gap-3">
              <span aria-hidden className={cn("grid h-9 w-9 flex-none place-items-center rounded-[10px] text-sm", r!.tone)}>{r!.icon}</span>
              <span className="min-w-0"><b className="block truncate font-semibold">{r!.title}</b><span className="block truncate text-[13px] text-muted">{r!.detail}</span></span>
            </Link>
          ))}
        </section>
      ) : null}

      <Link href={p.finderHref} className="mn-btn inline-flex h-12 items-center justify-center rounded-[14px] text-[15px] font-semibold">Analyse my score →</Link>
    </div>
  );
}
