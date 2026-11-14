import Link from "next/link";
import type { CycleStep, HealthItem, QueueItem, QueueTone } from "@/lib/admin/today";
import type { InductionCard } from "@/lib/data/admin-today";
import { STAGE_LABELS, type StageState } from "@/lib/ingest/workflow";
import { cn } from "../ui/cn";

/** Admin Today and Data building blocks (v4 mockups AdminToday / AdminData). */

// Each queue tone as the mockup's icon square and pill (.q .ic, .pill).
const TONE: Record<QueueTone, { bg: string; fg: string; pill: string }> = {
  amber: { bg: "rgba(229,160,75,.16)", fg: "#E5A04B", pill: "a" },
  violet: { bg: "rgba(155,135,255,.18)", fg: "#C4B8FF", pill: "v" },
  cyan: { bg: "rgba(92,225,230,.13)", fg: "#5CE1E6", pill: "c" },
  coral: { bg: "rgba(255,122,122,.15)", fg: "#FF7A7A", pill: "r" },
  neutral: { bg: "rgba(255,255,255,.06)", fg: "#ECECF1", pill: "n" },
};

// A line icon per tag; anything else gets the inbox tray.
const ICON: Record<string, string> = {
  estimate: "M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8",
  data: "M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
  changes: "M12 8v4l3 2M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5",
  names: "M4 7h16M4 12h10M4 17h7M17 15l2 2 4-4",
  people: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  access: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M22 11h-6",
  jobs: "M3 7h18v13H3zM8 7V4h8v3",
  community: "M4 22V4M4 4h13l-2 4 2 4H4",
  policy: "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6",
};
const INBOX = "M22 12h-6l-2 3h-4l-2-3H2M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z";

export function NeedsYouList({ items }: { items: QueueItem[] }) {
  if (!items.length) {
    return <p className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-muted">Nothing needs you. New files, estimates and requests show here as they come in.</p>;
  }
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((q) => {
        const tone = TONE[q.tone];
        return (
          <li key={q.id} className="grid grid-cols-[40px_minmax(0,1fr)] items-center gap-3.5 rounded-2xl border border-white/[.07] bg-white/[.02] px-4 py-3.5 sm:grid-cols-[40px_minmax(0,1fr)_auto]">
            <span aria-hidden className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: tone.bg, color: tone.fg }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={ICON[q.tag.toLowerCase()] ?? INBOX} /></svg>
            </span>
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2 font-semibold text-[#F7F7FA]">{q.title}<span className={cn("mn-pill", tone.pill)}>{q.tag}</span></span>
              <span className="mt-0.5 block text-[13px] text-muted">{q.detail}</span>
            </span>
            <Link href={q.href} className={cn("col-start-2 inline-flex h-10 w-fit items-center whitespace-nowrap rounded-xl px-3.5 text-[13px] sm:col-start-auto", q.primary ? "mn-btn font-semibold" : "border border-white/[.14] text-[#ECECF1] hover:border-[rgba(155,135,255,.6)] hover:shadow-[0_0_18px_rgba(110,86,255,.3)]")}>{q.cta}</Link>
          </li>
        );
      })}
    </ul>
  );
}

const STEP_BAR: Record<CycleStep["state"], string> = { done: "#3DDC97", now: "#E5A04B", next: "rgba(155,135,255,.4)" };

/** PHF's schedule for the running induction: done in green, open in amber (filled by how far through), next dim. */
export function CycleStripView({ steps }: { steps: CycleStep[] }) {
  return (
    <ol aria-label="PHF steps" className="flex gap-2.5 overflow-x-auto pb-1">
      {steps.map((s, i) => (
        <li key={`${s.title}-${i}`} className="flex min-w-[7rem] flex-1 flex-col gap-1.5">
          <span className="block h-1.5 overflow-hidden rounded-full bg-[#F3EEE5]/[.14]">
            <span className="mn-grow-x block h-full rounded-full" style={{ width: `${Math.round(s.progress * 100)}%`, background: STEP_BAR[s.state] }} />
          </span>
          <span className={cn("truncate text-xs", s.state === "next" ? "text-[#F3EEE5]/60" : s.state === "now" ? "text-[#E5A04B]" : "text-[#F3EEE5]")}>{s.title}</span>
          <span className="truncate text-[11px] text-[#F3EEE5]/[.68]">{s.when}</span>
        </li>
      ))}
    </ol>
  );
}

const DOT: Record<HealthItem["tone"], string> = { ok: "#3DDC97", warn: "#E5A04B", bad: "#FF7A7A", off: "#6B6B73" };

export function HealthRow({ items }: { items: HealthItem[] }) {
  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {items.map((h) => (
        <li key={h.label} className="flex items-center gap-2.5 rounded-[14px] border border-white/[.07] bg-white/[.02] px-3.5 py-3 text-[13px]">
          <span aria-hidden className="h-[9px] w-[9px] flex-none rounded-full" style={{ background: DOT[h.tone], boxShadow: `0 0 10px ${DOT[h.tone]}` }} />
          <span className="min-w-0"><span className="block text-[#ECECF1]">{h.label}</span><span className="block truncate text-xs text-muted">{h.text}</span></span>
        </li>
      ))}
    </ul>
  );
}

// ── Workflow lane ────────────────────────────────────────────────────────────

const LANE: Record<StageState["state"], { icon: string; fg: string; bar: string; label: string }> = {
  official: { icon: "✓", fg: "text-success", bar: "bg-success shadow-[0_0_8px_rgba(61,220,151,.5)]", label: "official" },
  unofficial: { icon: "◐", fg: "text-amber", bar: "bg-[repeating-linear-gradient(90deg,var(--mn-amber)_0_6px,transparent_6px_9px)]", label: "unofficial" },
  estimate: { icon: "◆", fg: "text-violet-pale", bar: "bg-violet-soft shadow-[0_0_10px_var(--mn-violet-glow)]", label: "estimate" },
  waiting: { icon: "◷", fg: "text-amber", bar: "bg-amber/35", label: "file waiting" },
  none: { icon: "○", fg: "text-subtle", bar: "bg-white/10", label: "not yet" },
};

export function WorkflowLane({ lane }: { lane: StageState[] }) {
  return (
    <ol aria-label="Workflow" className="grid grid-flow-col auto-cols-[minmax(6.5rem,1fr)] gap-2 overflow-x-auto pb-1">
      {lane.map((s) => {
        const l = LANE[s.state];
        return (
          <li key={s.stage} className="min-w-0" title={`${STAGE_LABELS[s.stage]}: ${l.label}`}>
            <span aria-hidden className={cn("block h-1 rounded-full", l.bar)} />
            <span className={cn("mt-2 flex items-center gap-1 text-sm font-medium", s.state === "none" ? "text-muted" : "text-ink")}>
              <span aria-hidden className={l.fg}>{l.icon}</span>
              <span className="truncate">{s.stage === "estimate" && s.state === "estimate" ? `Estimate ${s.detail.match(/round (\d+)/)?.[0] ?? ""}` : STAGE_LABELS[s.stage]}</span>
            </span>
            <span className="block truncate text-xs text-muted">{s.stage === "estimate" && s.state === "estimate" ? s.detail.replace(/^round \d+ · /, "") : s.detail}</span>
            <span className="sr-only">({l.label})</span>
          </li>
        );
      })}
    </ol>
  );
}

function RoundBoxes({ label, all, waiting = [] }: { label: string; all: number[]; waiting?: number[] }) {
  const nums = [...new Set([...all, ...waiting])].sort((a, b) => a - b);
  if (!nums.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-24 text-xs text-muted">{label}</span>
      {nums.map((r) => (
        <span key={r} title={waiting.includes(r) ? `Round ${r}: new file waiting` : `Round ${r}`}
          className={cn("grid h-6 min-w-6 place-items-center rounded-md px-1 text-xs tabular-nums", waiting.includes(r) ? "bg-amber/20 text-amber" : "bg-success/15 text-success")}>{r}</span>
      ))}
    </div>
  );
}

export function laneHeadline(c: InductionCard): string {
  if (c.closed) return "Closed";
  if (c.joining) return `Joining · ${c.joining.joined.toLocaleString("en-US")} joined`;
  if (c.rounds.length) return `Rounds running · round ${c.rounds.at(-1)} out`;
  if (c.lane.find((s) => s.stage === "gazette")?.state === "official") return "Gazette out";
  if (c.lane.some((s) => s.state !== "none")) return "Applications";
  return "Announced";
}

/** One induction on the Data page (and the running one on Today): lane, rounds, consent and the one next step. */
/** The running induction on Today: each stage as a chip, and the one next step (.chk). */
export function InductionChecks({ c }: { c: InductionCard }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {c.lane.map((s) => {
        const l = LANE[s.state];
        const color = s.state === "official" ? "#3DDC97" : s.state === "estimate" ? "#C4B8FF" : s.state === "none" ? "#8B8B93" : "#E5A04B";
        return (
          <span key={s.stage} title={`${STAGE_LABELS[s.stage]}: ${s.detail || l.label}`} className="inline-flex h-[30px] items-center gap-1.5 rounded-[9px] border px-2.5 text-xs"
            style={{ color, borderColor: s.state === "none" ? "rgba(255,255,255,.08)" : `${color}55` }}>
            {l.icon} {STAGE_LABELS[s.stage]}
          </span>
        );
      })}
    </div>
  );
}

export function InductionCardView({ c, compact = false }: { c: InductionCard; compact?: boolean }) {
  return (
    <article className={cn("grid gap-4 rounded-2xl border bg-card p-4 sm:p-5", c.next ? "border-violet-soft/35" : "border-line")}>
      <header className="flex flex-wrap items-center gap-3">
        <h3 className="text-lg font-semibold text-heading">Induction {c.induction}{c.label ? <span className="ml-2 text-sm font-normal text-muted">· {c.label}</span> : null}</h3>
        <span className="rounded-full border border-line px-2.5 py-0.5 text-xs text-muted">{laneHeadline(c)}</span>
        <span className="flex-1" />
        {c.next ? (
          <Link href={c.next.href} className="mn-btn inline-flex h-9 items-center rounded-lg px-3 text-sm font-semibold">{c.next.label}</Link>
        ) : (
          <Link href={`/portal/history/${c.induction}`} className="mn-btn-ghost inline-flex h-9 items-center rounded-lg px-3 text-sm">Open the lists</Link>
        )}
      </header>
      <WorkflowLane lane={c.lane} />
      {compact ? null : (
        <div className="grid gap-1.5">
          <RoundBoxes label="Merit lists" all={c.rounds} waiting={c.roundsWaiting} />
          <RoundBoxes label="Consent" all={c.consent} />
          <p className="text-xs text-muted">
            {[c.hasSchedule ? "PHF schedule in" : "No PHF schedule", c.joining ? `joining: ${c.joining.joined.toLocaleString("en-US")} of ${c.joining.total.toLocaleString("en-US")} listed joined` : "no joining file"].join(" · ")}
          </p>
        </div>
      )}
    </article>
  );
}
