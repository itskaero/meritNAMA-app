/**
 * Where an induction cycle stands against its published schedule. PHF files date
 * the cycle (start → end), not each round, so rounds are placed in order across
 * the cycle and the next round's date is an estimate (labelled as one in the UI).
 */

const DAY = 86_400_000;
const parse = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

export type CycleStatus = "Not started" | "Applications" | "Rounds running" | "Final list out" | "Cycle closed";
export type CycleRound = { roundNo: number; at: number; state: "published" | "next" | "expected"; estimatedOn: string };

export type CycleProgress = {
  totalDays: number;
  /** 1-based day of the cycle, clamped to 0 … totalDays. */
  day: number;
  pct: number;
  status: CycleStatus;
  published: number;
  expected: number;
  daysLeft: number;
  rounds: CycleRound[];
  next: (CycleRound & { overdue: boolean }) | null;
};

export function cycleProgress(o: { startsOn: string; endsOn: string; published: number; expectedRounds?: number; today: Date }): CycleProgress {
  const start = parse(o.startsOn), end = parse(o.endsOn);
  const totalDays = Math.max(1, Math.round((end - start) / DAY) + 1);
  const today = Date.UTC(o.today.getUTCFullYear(), o.today.getUTCMonth(), o.today.getUTCDate());
  const day = Math.min(Math.max(Math.round((today - start) / DAY) + 1, 0), totalDays);
  const pct = Math.round((day / totalDays) * 100);
  const expected = Math.max(o.published, o.expectedRounds ?? 6, 1);
  const rounds: CycleRound[] = Array.from({ length: expected }, (_, i) => {
    const at = (i + 0.5) / expected;
    return {
      roundNo: i + 1,
      at,
      state: i < o.published ? "published" : i === o.published ? "next" : "expected",
      estimatedOn: iso(start + Math.round(at * (totalDays - 1)) * DAY),
    };
  });
  const status: CycleStatus =
    today < start ? "Not started"
    : today > end ? "Cycle closed"
    : o.published === 0 ? "Applications"
    : o.published < expected ? "Rounds running"
    : "Final list out";
  const nextRound = rounds.find((r) => r.state === "next");
  return {
    totalDays,
    day,
    pct,
    status,
    published: o.published,
    expected,
    daysLeft: Math.max(0, totalDays - day),
    rounds,
    next: nextRound && status !== "Cycle closed" ? { ...nextRound, overdue: parse(nextRound.estimatedOn) < today } : null,
  };
}

/** Annular-sector path for one gauge segment (angles in radians, 0 = 3 o'clock, clockwise). */
export function arcSegment(cx: number, cy: number, r1: number, r2: number, a0: number, a1: number): string {
  const p = (r: number, a: number) => `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  return `M${p(r1, a0)} L${p(r2, a0)} A${r2},${r2} 0 0 1 ${p(r2, a1)} L${p(r1, a1)} A${r1},${r1} 0 0 0 ${p(r1, a0)} Z`;
}
