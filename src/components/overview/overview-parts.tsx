import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "../ui/cn";

/*
 * Overview building blocks, to the measurements of docs/mockups/v4/Main.dc.html:
 * the video hero, glass sub-cards, the standing ticks, chance sparklines, the seat strip,
 * the median chart, the readiness arc, the preference ring and the cycle timeline.
 */

export const IV = "text-[#F3EEE5]/[.68]";

/** The hero: photo and looping video on the right, navy gradients, the aurora mesh. */
export function VideoHero({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section aria-label="Overview" className={cn("mn-head relative overflow-hidden rounded-[16px] p-5 text-[#F3EEE5] sm:p-7", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/images/v4/hero-cycle.jpg" alt="" aria-hidden className="absolute inset-0 -z-10 h-full w-full object-cover object-right opacity-70" />
      <video className="absolute inset-0 -z-10 h-full w-full object-cover object-right opacity-70 motion-reduce:hidden" src="/images/v4/overview-bg.mp4" poster="/images/v4/hero-cycle.jpg" autoPlay muted loop playsInline preload="metadata" aria-hidden />
      <div aria-hidden className="absolute inset-0 -z-10 [background:linear-gradient(90deg,rgba(16,36,58,.92)_0%,rgba(16,36,58,.6)_45%,rgba(16,36,58,.15)_75%),linear-gradient(0deg,rgba(16,36,58,.85)_0%,rgba(16,36,58,0)_55%)]" />
      <span aria-hidden className="mn-head-blob b1" /><span aria-hidden className="mn-head-blob b2" /><span aria-hidden className="mn-head-blob b3" /><span aria-hidden className="mn-head-blob b4" />
      <div className="relative grid gap-[22px]">{children}</div>
    </section>
  );
}

/** A glass sub-card inside the hero (.glass). */
export function Glass({ title, aside, children, label }: { title: string; aside?: ReactNode; children: ReactNode; label?: string }) {
  return (
    <section aria-label={label ?? title} className="rounded-[18px] border border-[#F3EEE5]/[.12] bg-[rgba(16,36,58,.45)] p-[18px] backdrop-blur-[10px] transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-[3px] hover:border-[rgba(229,160,75,.45)] hover:shadow-[0_0_30px_rgba(23,107,103,.35)]">
      <div className="flex items-center justify-between gap-3"><h2 className="text-[15px] font-semibold">{title}</h2>{aside ? <span className="text-xs">{aside}</span> : null}</div>
      {children}
    </section>
  );
}

/** 36 ticks, teal to amber, lit up to the percentile. */
export function StandingTicks({ percentile }: { percentile: number }) {
  const on = Math.round((percentile / 100) * 36);
  return (
    <div aria-hidden className="mt-2.5 flex h-[34px] gap-[3px]">
      {Array.from({ length: 36 }, (_, i) => {
        const t = i / 35, h = 176 - t * 140, lit = i < on;
        return <span key={i} className="flex-1 rounded-[2px]" style={{ background: lit ? `hsl(${h}, 62%, ${46 + t * 12}%)` : "rgba(243,238,229,0.12)", boxShadow: lit ? `0 0 8px hsla(${h}, 70%, 55%, 0.55)` : "none" }} />;
      })}
    </div>
  );
}

const SPARK = { safe: ["M0 26 C15 24, 25 28, 40 20 S 70 16, 100 5", "#3DDC97", "61,220,151"], target: ["M0 18 C15 12, 25 22, 45 16 S 75 20, 100 14", "#E5A04B", "229,160,75"], reach: ["M0 6 C20 8, 30 12, 50 16 S 80 24, 100 28", "#FF7A7A", "255,122,122"] } as const;

/** Safe / Target / Reach, each with its glowing line and count. */
export function ChanceSparks({ safe, target, reach }: { safe: number; target: number; reach: number }) {
  return (
    <div className="mt-3 grid grid-cols-3 gap-2.5">
      {([["safe", "Safe", safe], ["target", "Target", target], ["reach", "Reach", reach]] as const).map(([k, l, n]) => (
        <div key={k}>
          <p className={cn("text-xs", IV)}>{l}</p>
          <svg aria-hidden width="100%" height="32" viewBox="0 0 100 32" preserveAspectRatio="none"><path className="mn-draw-line" d={SPARK[k][0]} fill="none" stroke={SPARK[k][1]} strokeWidth="2" style={{ filter: `drop-shadow(0 0 4px rgba(${SPARK[k][2]},0.7))` }} /></svg>
          <p className="text-[26px] font-semibold tabular-nums" style={{ color: SPARK[k][1] }}>{n}</p>
        </div>
      ))}
    </div>
  );
}

/** Seat in each round: coral none, amber another seat, green this seat, dashed the next round. */
export function SeatStrip({ cells }: { cells: { label: string; state: "none" | "other" | "seat" | "next"; title: string }[] }) {
  return (
    <>
      <div className="mt-3 flex gap-1.5">
        {cells.map((c) => (
          <span key={c.label} title={c.title} className={cn("h-6 flex-1 rounded-[7px]", c.state === "none" ? "bg-[#FF7A7A]" : c.state === "other" ? "bg-[#E5A04B]" : c.state === "seat" ? "bg-[#3DDC97] shadow-[0_0_14px_rgba(61,220,151,.6)]" : "border border-dashed border-[#F3EEE5]/40")} />
        ))}
      </div>
      <div className={cn("mt-1 flex justify-between text-[11px]", IV)}>{cells.map((c) => <span key={c.label}>{c.label}</span>)}</div>
    </>
  );
}

/** The median closing merit area chart (cyan to violet line, violet fill, glowing end point). */
export function MedianChart({ values, labels }: { values: number[]; labels: string[] }) {
  if (values.length < 2) return null;
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * 700, 20 + (1 - (v - lo) / span) * 110] as const);
  const line = pts.map(([x, y], i) => (i ? `L${x.toFixed(1)} ${y.toFixed(1)}` : `M${x} ${y.toFixed(1)}`)).join(" ");
  const last = pts.at(-1)!;
  return (
    <>
      <svg role="img" aria-label={`Median closing merit from ${values[0]!.toFixed(2)} to ${values.at(-1)!.toFixed(2)}`} width="100%" height="160" viewBox="0 0 700 160" preserveAspectRatio="none" className="mt-2.5">
        <defs>
          <linearGradient id="mc-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8B73FF" stopOpacity="0.4" /><stop offset="1" stopColor="#8B73FF" stopOpacity="0" /></linearGradient>
          <linearGradient id="mc-line" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#5CE1E6" /><stop offset="1" stopColor="#9B87FF" /></linearGradient>
        </defs>
        <path d="M0 140 H700 M0 100 H700 M0 60 H700 M0 20 H700" stroke="rgba(255,255,255,0.05)" />
        <path d={`${line} L700 160 L0 160 Z`} fill="url(#mc-fill)" />
        <path className="mn-draw-line" d={line} fill="none" stroke="url(#mc-line)" strokeWidth="3" style={{ filter: "drop-shadow(0 0 8px rgba(155,135,255,0.8))" }} />
        <circle cx={Math.min(694, last[0])} cy={last[1]} r="6" fill="#0C0C0E" stroke="#9B87FF" strokeWidth="3" style={{ filter: "drop-shadow(0 0 8px #9B87FF)" }} />
      </svg>
      <div className="flex justify-between text-[11px] text-muted">{labels.map((l) => <span key={l}>{l}</span>)}</div>
    </>
  );
}

/** Half-ring of 12 segments, lit to a share (consent replies in). */
export function ReadinessArc({ share, label }: { share: number; label: string }) {
  const n = 12, lit = Math.round(share * n), cx = 120, cy = 112, r1 = 66, r2 = 98;
  const p = (r: number, a: number) => `${(cx + r * Math.cos(a)).toFixed(1)} ${(cy + r * Math.sin(a)).toFixed(1)}`;
  return (
    <svg role="img" aria-label={`${Math.round(share * 100)} percent ${label}`} width="100%" height="170" viewBox="0 0 240 150" className="mt-1.5">
      {Array.from({ length: n }, (_, i) => {
        const a0 = Math.PI + (i / n) * Math.PI + 0.045, a1 = Math.PI + ((i + 1) / n) * Math.PI - 0.045;
        const on = i < lit;
        return <path key={i} d={`M${p(r1, a0)} L${p(r2, a0)} A${r2} ${r2} 0 0 1 ${p(r2, a1)} L${p(r1, a1)} A${r1} ${r1} 0 0 0 ${p(r1, a0)} Z`} fill={on ? "#9B87FF" : "#26262B"} style={{ filter: on ? "drop-shadow(0 0 6px rgba(155,135,255,0.7))" : "none" }} />;
      })}
      <text x="120" y="118" textAnchor="middle" fill="#EDEDEF" fontSize="36" fontWeight="700" fontFamily="Inter">{Math.round(share * 100)}%</text>
      <text x="120" y="139" textAnchor="middle" fill="#8B8B93" fontSize="11" fontFamily="Inter">{label}</text>
    </svg>
  );
}

export type PrefChip = { n: number; label: string; note: string; tone: "safe" | "target" | "reach" | "seat" };
const POS = ["left-1/2 top-[58px] -translate-x-1/2", "right-3.5 top-[120px]", "right-3.5 top-[250px]", "left-1/2 top-[300px] -translate-x-1/2", "left-3.5 top-[250px]", "left-3.5 top-[120px]"];
const DOT = { safe: "#3DDC97", target: "#E5A04B", reach: "#FF7A7A", seat: "#3DDC97" };

/** Your top six preferences around your marks. */
export function PrefRing({ marks, chips, total, href }: { marks: string; chips: PrefChip[]; total: number; href: string }) {
  return (
    <section aria-label="Your preferences" className="mn-card-glass mn-hover relative h-[360px] overflow-hidden rounded-[20px] border border-line p-5 [background:radial-gradient(220px_200px_at_50%_58%,rgba(110,86,255,.24),transparent_70%),rgba(23,23,28,.78)]">
      <div className="flex items-center justify-between"><h2 className="text-[15px] font-semibold text-heading">Your preferences</h2><Link href={href} className="text-xs text-muted hover:text-ink">top {chips.length} of {total}</Link></div>
      <svg aria-hidden width="100%" height="290" viewBox="0 0 330 290" className="absolute bottom-0 left-0">
        <circle cx="165" cy="150" r="118" fill="none" stroke="rgba(255,255,255,0.10)" strokeDasharray="2 4" />
        <circle cx="165" cy="150" r="76" fill="none" stroke="rgba(155,135,255,0.45)" style={{ filter: "drop-shadow(0 0 6px rgba(155,135,255,0.6))" }} />
      </svg>
      <div className="absolute left-1/2 top-[210px] grid h-[86px] w-[86px] -translate-x-1/2 -translate-y-1/2 place-items-center content-center rounded-full border border-violet-soft/55 bg-[#1E1E24] shadow-[0_0_24px_rgba(110,86,255,.4)]">
        <span className="text-[11px] text-muted">You</span><span className="text-xl font-semibold tabular-nums text-heading">{marks}</span>
      </div>
      {chips.slice(0, 6).map((c, i) => (
        <div key={c.n} className={cn("absolute w-[112px] rounded-[10px] border bg-[rgba(30,30,36,.9)] px-2 py-1.5 text-[11px] leading-[1.3]", POS[i], c.tone === "seat" ? "border-[rgba(61,220,151,.6)] shadow-[0_0_16px_rgba(61,220,151,.3)]" : "border-white/[.09]")}>
          <span style={{ color: DOT[c.tone] }}>●</span> <span className="text-ink">#{c.n} {c.label}</span>
          <span className={cn("block", c.tone === "seat" ? "text-[#3DDC97]" : "text-muted")}>{c.note}</span>
        </div>
      ))}
    </section>
  );
}

export type CycleBar = { label: string; from: Date; to: Date; tone: "done" | "list" | "due" | "estimate" | "expected" };
const BAR = {
  done: "bg-[rgba(61,220,151,.16)] text-[#3DDC97] shadow-[inset_3px_0_0_#3DDC97]",
  list: "bg-[#3DDC97] text-[#0C0C0E] shadow-[0_0_16px_rgba(61,220,151,.5)]",
  due: "bg-[rgba(229,160,75,.22)] text-[#E5A04B] shadow-[inset_3px_0_0_#E5A04B,0_0_18px_rgba(229,160,75,.25)]",
  estimate: "border border-dashed border-[rgba(155,135,255,.8)] text-[#B9AAFF]",
  expected: "bg-[rgba(92,225,230,.16)] text-[#5CE1E6] shadow-[inset_3px_0_0_#5CE1E6]",
};

/** Three weeks around today, with the cycle's steps as bars and a glowing "now" line. */
export function CycleGantt({ bars, now }: { bars: CycleBar[]; now: Date }) {
  const day = 86_400_000, start = now.getTime() - 9 * day, span = 21 * day;
  const ticks = Array.from({ length: 7 }, (_, i) => new Date(start + i * 3 * day + 1.5 * day));
  const x = (d: Date) => Math.min(100, Math.max(0, ((d.getTime() - start) / span) * 100));
  const shown = bars.filter((b) => b.to.getTime() >= start && b.from.getTime() <= start + span).slice(0, 5);
  const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Karachi" }).replace(/(\d+) (\w+)/, "$2 $1");
  return (
    <div className="relative mt-4 h-[270px] overflow-hidden rounded-[14px] border border-white/5 bg-[rgba(12,12,14,.6)]">
      <div className="grid grid-cols-7 pt-2.5 text-center text-[11px] text-muted">{ticks.map((t, i) => <span key={i} className={i === 3 ? "font-semibold text-ink" : undefined}>{fmt(t)}</span>)}</div>
      <div aria-hidden className="absolute bottom-0 top-[26px] w-0.5 bg-[#9B87FF] shadow-[0_0_12px_#9B87FF]" style={{ left: `${x(now)}%` }} />
      {shown.length ? shown.map((b, i) => (
        <div key={`${b.label}-${i}`} title={b.label} className={cn("absolute flex h-[34px] items-center overflow-hidden whitespace-nowrap rounded-[9px] px-2.5 text-[11px] font-semibold", BAR[b.tone])}
          style={{ left: `${x(b.from)}%`, width: `${Math.max(7, x(b.to) - x(b.from))}%`, top: `${50 + i * 44}px` }}>{b.label}</div>
      )) : <p className="absolute inset-x-0 top-1/2 text-center text-sm text-muted">Nothing dated in these three weeks.</p>}
    </div>
  );
}
