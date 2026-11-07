import { z } from "zod";

/*
 * Social layer: round rooms, reputation and peer counts. Pure helpers; the data
 * layer (src/lib/data/rooms.ts, social.ts) does the reading and writing.
 */

// ── Round rooms ────────────────────────────────────────────────────────────────

export const ROOM_MESSAGE_MAX = 300;
/** Members' posting limits in rooms (on top of the community limits for threads). */
export const ROOM_RATE = { perTenSeconds: 1, perHour: 30 };
/** Messages a room shows on first load; older ones are not paged in the prototype. */
export const ROOM_PAGE = 80;

export const roomMessageSchema = z
  .string()
  .transform((s) => s.replace(/\s+/g, " ").trim())
  .pipe(z.string().min(1, "Write a message first.").max(ROOM_MESSAGE_MAX, `Keep it under ${ROOM_MESSAGE_MAX} characters.`));

export const roomKeySchema = z.object({
  induction: z.number().int().min(1).max(999),
  roundNo: z.number().int().min(1).max(99),
});

export type RoundDaySummary = {
  induction: number;
  roundNo: number;
  allocations: number;
  /** Median closing merit of this round, and of the round before (if any). */
  median: number | null;
  previousMedian: number | null;
  /** The group whose closing merit fell the most since the round before. */
  biggestFall: { speciality: string; program: string; from: number; to: number } | null;
  /** Shortlist alerts sent with this import. */
  alerted: number;
  /** The round was published before and has been replaced. */
  updated?: boolean;
};

const f2 = (n: number) => n.toFixed(2);

/** The automatic "round day" message posted into a room when a round is imported. */
export function roundDayText(s: RoundDaySummary): string {
  const parts = [`Round ${s.roundNo} ${s.updated ? "was re-published" : "is out"}: ${s.allocations.toLocaleString("en-US")} allocations.`];
  if (s.median != null) {
    const d = s.previousMedian == null ? null : s.median - s.previousMedian;
    parts.push(
      d == null || Math.abs(d) < 0.005
        ? `Median closing merit ${f2(s.median)}.`
        : `Median closing merit ${f2(s.median)} (${d < 0 ? "down" : "up"} ${f2(Math.abs(d))} on round ${s.roundNo - 1}).`,
    );
  }
  if (s.biggestFall && s.biggestFall.from - s.biggestFall.to >= 0.005) {
    parts.push(`Biggest fall: ${s.biggestFall.program} ${s.biggestFall.speciality}, ${f2(s.biggestFall.from)} → ${f2(s.biggestFall.to)}.`);
  }
  if (s.alerted > 0) parts.push(`${s.alerted.toLocaleString("en-US")} ${s.alerted === 1 ? "person was" : "people were"} told about seats on their shortlist.`);
  return parts.join(" ");
}

/**
 * A coarse, opt-in merit band shown beside a name in rooms: the programme and a
 * one-mark range ("FCPS · 21–22"). Never the exact marks.
 */
export function meritBand(program: string | null, marks: number | null): string | null {
  if (!program || marks == null || !Number.isFinite(marks)) return null;
  const lo = Math.floor(marks);
  return `${program.trim()} · ${lo}–${lo + 1}`;
}

// ── Reputation ─────────────────────────────────────────────────────────────────

/**
 * Points: 10 for each accepted answer (on someone else's question), 2 for each
 * "helpful" vote from a verified member or staff, at most 5 votes counted from any
 * one voter. Levels are named, never ranked against each other.
 */
export const REPUTATION = { accepted: 10, helpful: 2, perVoterCap: 5 } as const;

export const REPUTATION_LEVELS = [
  { key: "new", label: "New", min: 0 },
  { key: "contributor", label: "Contributor", min: 10 },
  { key: "helpful", label: "Helpful", min: 50 },
  { key: "trusted", label: "Trusted", min: 150 },
] as const;

export type ReputationLevel = (typeof REPUTATION_LEVELS)[number];

export function reputationLevel(points: number): ReputationLevel {
  let out: ReputationLevel = REPUTATION_LEVELS[0];
  for (const l of REPUTATION_LEVELS) if (points >= l.min) out = l;
  return out;
}

/** Points to the next level, or null at the top. */
export function nextLevel(points: number): { level: ReputationLevel; needed: number } | null {
  const next = REPUTATION_LEVELS.find((l) => l.min > points);
  return next ? { level: next, needed: next.min - points } : null;
}

// ── Peers ──────────────────────────────────────────────────────────────────────

/** "Near your marks" means within this many marks either side. */
export const PEER_WINDOW = 0.5;
/** Counts below this are never shown, so a figure cannot point at one person. */
export const PEER_MIN = 3;

/** A peer count for display, or null when it is too small to show. */
export const peerShown = (n: number | null | undefined) => (n != null && n >= PEER_MIN ? n : null);
