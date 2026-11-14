/**
 * Admin Today: pure helpers for the cycle strip, the "Needs you" list and the health row.
 * The data functions that fill them are in src/lib/data/admin-today.ts.
 */

export type QueueTone = "amber" | "violet" | "cyan" | "coral" | "neutral";

/** One row of "Needs you". Areas add rows through the queue registry (src/lib/data/admin-today.ts). */
export type QueueItem = {
  id: string;
  /** Short tag on the row: Estimate, Data, Names, People, Jobs, Community… */
  tag: string;
  title: string;
  detail: string;
  cta: string;
  href: string;
  tone: QueueTone;
  /** Higher first. 90 = blocks members (estimate waiting, files waiting), 50 = people waiting, 20 = housekeeping. */
  urgency: number;
  /** The button is the primary (glowing) one. */
  primary?: boolean;
};

export function sortQueue(items: (QueueItem | null)[]): QueueItem[] {
  return items.filter((x): x is QueueItem => x !== null).sort((a, b) => b.urgency - a.urgency || a.title.localeCompare(b.title));
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
export { plural };

// ── Cycle strip ──────────────────────────────────────────────────────────────

export type ScheduleRow = { title: string; sortOrder: number; startsAt: Date | null; endsAt: Date | null };
export type CycleStep = { title: string; when: string; state: "done" | "now" | "next"; progress: number };

const dayFmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Karachi" });

function whenText(s: ScheduleRow, state: CycleStep["state"]): string {
  const a = s.startsAt, b = s.endsAt;
  if (state === "now") return b ? `open · till ${dayFmt(b)}` : "open now";
  if (state === "next") return a ? `from ${dayFmt(a)}` : b ? `by ${dayFmt(b)}` : "date not set";
  if (a && b && dayFmt(a) !== dayFmt(b)) return `${dayFmt(a)} – ${dayFmt(b)}`;
  return b ? dayFmt(b) : a ? dayFmt(a) : "";
}

/**
 * PHF's schedule as a strip: finished steps, the open ones (with how far through the window),
 * and what comes next. Undated steps sit where PHF ordered them and count as next.
 */
export function cycleSteps(rows: ScheduleRow[], now: Date): CycleStep[] {
  const t = now.getTime();
  return [...rows].sort((a, b) => a.sortOrder - b.sortOrder).map((s) => {
    const start = s.startsAt?.getTime() ?? null;
    const end = s.endsAt?.getTime() ?? null;
    let state: CycleStep["state"];
    if (end != null && end < t) state = "done";
    else if (start != null && start <= t) state = "now";
    else state = "next";
    let progress = state === "done" ? 1 : 0;
    if (state === "now" && start != null && end != null && end > start) progress = Math.min(1, Math.max(0.05, (t - start) / (end - start)));
    else if (state === "now") progress = 0.5;
    return { title: s.title, when: whenText(s, state), state, progress };
  });
}

/** "Consent · Round 09, from 16 Nov" — the first step that has not started, for the strip's headline. */
export function nextPhfStep(steps: CycleStep[]): CycleStep | null {
  return steps.find((s) => s.state === "next") ?? null;
}

// ── Health ───────────────────────────────────────────────────────────────────

export type HealthItem = { label: string; text: string; tone: "ok" | "warn" | "bad" | "off" };

/** "40 s ago", "12 min ago", "3 h ago", "2 days ago". */
export function ago(then: Date, now: Date): string {
  const s = Math.max(0, Math.round((now.getTime() - then.getTime()) / 1000));
  if (s < 90) return `${s} s ago`;
  if (s < 90 * 60) return `${Math.round(s / 60)} min ago`;
  if (s < 36 * 3600) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}

/** The worker ticks every minute: quiet for 5 minutes is a warning, an hour is down. */
export function workerHealth(lastTick: Date | null, now: Date): HealthItem {
  if (!lastTick) return { label: "Worker", text: "No tick seen yet", tone: "warn" };
  const quiet = now.getTime() - lastTick.getTime();
  return { label: "Worker", text: `Last tick ${ago(lastTick, now)}`, tone: quiet > 3_600_000 ? "bad" : quiet > 300_000 ? "warn" : "ok" };
}
