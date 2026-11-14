import Link from "next/link";
import type { CycleStep, HealthItem, QueueItem, QueueTone } from "@/lib/admin/today";
import type { InductionCard } from "@/lib/data/admin-today";
import { STAGE_LABELS, type StageState } from "@/lib/ingest/workflow";
import { cn } from "../ui/cn";

/** Admin Today and Data building blocks (v4 mockups AdminToday / AdminData). */

const TONE: Record<QueueTone, string> = {
  amber: "bg-amber/15 text-amber",
  violet: "bg-[var(--mn-violet-fill)] text-violet-pale",
  cyan: "bg-info/15 text-info",
  coral: "bg-danger/15 text-danger",
  neutral: "bg-hover text-ink",
};

export function NeedsYouList({ items }: { items: QueueItem[] }) {
  if (!items.length) {
    return <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">Nothing needs you. New files, estimates and requests show here as they come in.</p>;
  }
  return (
    <ul className="grid gap-2">
      {items.map((q) => (
        <li key={q.id} className="grid gap-3 rounded-xl border border-line bg-card p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
          <span className={cn("w-fit rounded-md px-2 py-1 text-[0.7rem] font-semibold uppercase tracking-wide", TONE[q.tone])}>{q.tag}</span>
          <span className="min-w-0">
            <span className="block font-semibold text-heading">{q.title}</span>
            <span className="block truncate text-sm text-muted sm:whitespace-normal">{q.detail}</span>
          </span>
          <Link href={q.href} className={cn("inline-flex h-9 w-fit items-center rounded-lg px-3 text-sm font-semibold", q.primary ? "mn-btn" : "mn-btn-ghost")}>{q.cta}</Link>
        </li>
      ))}
    </ul>
  );
}

const STEP_BAR: Record<CycleStep["state"], string> = { done: "bg-success", now: "bg-amber", next: "bg-violet-soft/40" };

/** PHF's schedule for the running induction: done in green, open in amber (filled by how far through), next dim. */
export function CycleStripView({ steps }: { steps: CycleStep[] }) {
  return (
    <ol className="grid grid-flow-col auto-cols-[minmax(7.5rem,1fr)] gap-2 overflow-x-auto pb-1">
      {steps.map((s, i) => (
        <li key={`${s.title}-${i}`} className="min-w-0">
          <span className="block h-1.5 overflow-hidden rounded-full bg-white/10">
            <span className={cn("block h-full rounded-full", STEP_BAR[s.state])} style={{ width: `${Math.round(s.progress * 100)}%` }} />
          </span>
          <span className={cn("mt-2 block truncate text-sm font-medium", s.state === "next" ? "text-[#F3EEE5]/60" : s.state === "now" ? "text-amber" : "text-[#F3EEE5]")}>{s.title}</span>
          <span className="block truncate text-xs text-[#F3EEE5]/60">{s.when}</span>
        </li>
      ))}
    </ol>
  );
}

const DOT: Record<HealthItem["tone"], string> = { ok: "bg-success", warn: "bg-amber", bad: "bg-danger", off: "bg-subtle" };

export function HealthRow({ items }: { items: HealthItem[] }) {
  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
      {items.map((h) => (
        <li key={h.label} className="rounded-xl border border-line bg-card px-3 py-2.5">
          <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted"><span aria-hidden className={cn("h-2 w-2 rounded-full", DOT[h.tone])} />{h.label}</span>
          <span className="mt-1 block text-sm text-ink">{h.text}</span>
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
