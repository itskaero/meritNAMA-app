/**
 * First-round seat allocation, ported from the legacy simulator (`js/sim-placement.js`,
 * itself a translation of PHF's `merit.py`), public repo itskaero/meritnama @ f686206.
 *
 * Candidates are processed in passes, best marks first. Each takes the first
 * preference with a free seat, or displaces that seat's lowest-marked holder when it
 * outscores them; a displaced candidate tries again in the next pass. Passes repeat
 * until nothing changes. Quotas named in the rules' tracks (Armed Forces by default)
 * form separate tracks: a candidate can hold one seat per track.
 *
 * Pure: no I/O. Behaviour matches the legacy code exactly and is pinned by the
 * golden tests in tests/engine-golden.test.ts.
 */
import { effectiveMark, parentBonus, type EngineCandidate, type MarksContext, type Preference } from "./marks";
import type { ResolvedRules } from "./rules";

/** A track id from the rules, e.g. "civilian" or "armed". */
export type Track = string;

/** One line of a seat matrix (data/induction<n>_seats.json). */
export type SeatLine = { typeName: string; quotaName: string; specialityName: string; hospitalName: string; seats: number };

export type SlotEntry = {
  applicantId: string | number;
  marksTotal: number;
  preferenceNo: number;
  track: Track;
};

export type OtherEntry = SlotEntry & {
  placed: boolean;
  /** Placed at a preference ranked above this one. */
  placedAtHigherPref: boolean;
  placedAt: { q: string; s: string; h: string } | null;
};

export type Slot = { jobs: number; candidates: SlotEntry[]; others: OtherEntry[] };

/** quota → speciality → hospital → slot */
export type SeatTree = Record<string, Record<string, Record<string, Slot>>>;

export type WorkingCandidate = {
  applicantId: string | number;
  /** Best mark over the track's preferences; the processing order. */
  sortMarks: number;
  track: Track;
  prefs: Preference[];
  placed: boolean;
  q: string | null;
  s: string | null;
  h: string | null;
  source: EngineCandidate;
};

export type PlacementResult = { seatTree: SeatTree; candidates: WorkingCandidate[]; passes: number };

export function normalizeQuotaName(quotaName: unknown): string {
  return String(quotaName ?? "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\band\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Tracks in processing order: the default track first, then the separate ones. */
export function trackIds(rules: ResolvedRules): Track[] {
  return [rules.tracks.defaultTrack, ...rules.tracks.separate.map((t) => t.id)];
}

/** The track a quota belongs to (with the default rules: Armed Forces, else civilian). */
export function quotaTrack(rules: ResolvedRules, quotaName: unknown): Track {
  const q = normalizeQuotaName(quotaName);
  return rules.tracks.separate.find((t) => t.quotaContains.some((s) => q.includes(normalizeQuotaName(s))))?.id ?? rules.tracks.defaultTrack;
}

/**
 * An empty seat tree for one programme. Repeated lines for the same quota, speciality
 * and hospital (e.g. two institutes) keep the last line's count, as the legacy loader did.
 */
export function buildSeatTree(lines: readonly SeatLine[], program: string): SeatTree {
  const tree: SeatTree = {};
  for (const l of lines) {
    if (l.typeName !== program) continue;
    const specs = (tree[l.quotaName] ??= {});
    const hosps = (specs[l.specialityName] ??= {});
    hosps[l.hospitalName] = { jobs: l.seats, candidates: [], others: [] };
  }
  return tree;
}

/** Fallback when no seat matrix is loaded: one seat per slot that any preference names. */
export function seatTreeFromPreferences(candidates: readonly EngineCandidate[], program: string): SeatTree {
  const tree: SeatTree = {};
  for (const c of candidates) {
    for (const p of c.preferences[program] ?? []) {
      const specs = (tree[p.quotaName] ??= {});
      const hosps = (specs[p.specialityName] ??= {});
      hosps[p.hospitalName] ??= { jobs: 1, candidates: [], others: [] };
    }
  }
  return tree;
}

/** Whether a candidate takes part, by profile status. */
export function isEligible(rules: ResolvedRules, c: EngineCandidate): boolean {
  if (c.profileStatus == null) return rules.placement.unknownStatus === "include";
  return rules.placement.eligibleProfileStatus.includes(c.profileStatus);
}

/** Eligible candidates who applied to `program`. */
export function candidatePool(rules: ResolvedRules, ctx: MarksContext, candidates: readonly EngineCandidate[], program: string): EngineCandidate[] {
  return candidates.filter((c) => isEligible(rules, c) && effectiveMark(rules, ctx, c, program) != null);
}

function trackPrefs(rules: ResolvedRules, c: EngineCandidate, program: string, track: Track): Preference[] {
  return (c.preferences[program] ?? [])
    .filter((p) => quotaTrack(rules, p.quotaName) === track)
    .slice()
    .sort((a, b) => a.preferenceNo - b.preferenceNo);
}

const sameId = (a: string | number, b: string | number) => String(a) === String(b);

/** Run the allocation under `rules`. `seatTree` is filled in place and returned. */
export function runPlacement(
  rules: ResolvedRules,
  ctx: MarksContext,
  candidates: readonly EngineCandidate[],
  seatTree: SeatTree,
  program: string,
): PlacementResult {
  const tracks = trackIds(rules);
  const prog: WorkingCandidate[] = candidates.flatMap((c) =>
    tracks.map((track) => {
      const prefs = trackPrefs(rules, c, program, track);
      const orderMark = (p: Preference) => {
        const m = effectiveMark(rules, ctx, c, program, p);
        return m != null && rules.placement.orderBy === "bestMarkWithoutParentBonus" ? m - parentBonus(rules, p) : m;
      };
      const scores = prefs.map(orderMark).filter((v): v is number => v != null);
      const sortMarks = scores.length ? Math.max(...scores) : (effectiveMark(rules, ctx, c, program) ?? c.baseMarks);
      return { applicantId: c.applicantId, sortMarks, track, prefs, placed: false, q: null, s: null, h: null, source: c } as WorkingCandidate;
    }).filter((w) => w.prefs.length && w.sortMarks != null),
  );

  const slot = (q: string, s: string, h: string): Slot | undefined => seatTree[q]?.[s]?.[h];
  const markFor = (w: WorkingCandidate, p: Preference) => effectiveMark(rules, ctx, w.source, program, p) ?? w.sortMarks;
  const entry = (w: WorkingCandidate, p: Preference): SlotEntry => ({
    applicantId: w.applicantId,
    marksTotal: markFor(w, p),
    preferenceNo: p.preferenceNo,
    track: w.track,
  });
  const seat = (w: WorkingCandidate, p: Preference) => {
    w.placed = true;
    w.q = p.quotaName;
    w.s = p.specialityName;
    w.h = p.hospitalName;
  };

  let prevPlaced = -1;
  let passes = 0;
  for (let pass = 0; pass < rules.placement.maxPasses; pass++) {
    // Array.prototype.sort is stable: equal marks keep input order (candidate, then track).
    const unplaced = prog.filter((w) => !w.placed).sort((a, b) => b.sortMarks - a.sortMarks);
    if (!unplaced.length) break;
    passes++;

    let placed = 0;
    let changed = false;
    for (const w of unplaced) {
      for (const p of w.prefs) {
        const sl = slot(p.quotaName, p.specialityName, p.hospitalName);
        if (!sl) continue;
        const em = markFor(w, p);
        if (sl.candidates.length < sl.jobs) {
          sl.candidates.push(entry(w, p));
          seat(w, p);
          placed++;
          changed = true;
          break;
        }
        // A 0-seat slot has no holder to displace. (The legacy code threw here.)
        if (!sl.candidates.length) continue;
        const lowest = sl.candidates.reduce((m, x) => (x.marksTotal < m.marksTotal ? x : m));
        if (em > lowest.marksTotal) {
          sl.candidates = sl.candidates.filter((x) => !(sameId(x.applicantId, lowest.applicantId) && x.track === lowest.track));
          const evicted = prog.find((x) => sameId(x.applicantId, lowest.applicantId) && x.track === lowest.track);
          if (evicted) {
            evicted.placed = false;
            evicted.q = evicted.s = evicted.h = null;
          }
          sl.candidates.push(entry(w, p));
          seat(w, p);
          placed++;
          changed = true;
          break;
        }
      }
    }

    const total = prog.filter((w) => w.placed).length;
    if (!changed || (total === prevPlaced && placed === 0)) break;
    prevPlaced = total;
  }

  // Everyone who listed a slot but does not hold it, with where they did land.
  for (const w of prog) {
    const placedPrefNo = w.placed
      ? (w.prefs.find((p) => p.quotaName === w.q && p.specialityName === w.s && p.hospitalName === w.h)?.preferenceNo ?? null)
      : null;
    for (const p of w.prefs) {
      const sl = slot(p.quotaName, p.specialityName, p.hospitalName);
      if (!sl) continue;
      const inC = sl.candidates.some((x) => sameId(x.applicantId, w.applicantId));
      const inO = sl.others.some((x) => sameId(x.applicantId, w.applicantId));
      if (inC || inO) continue;
      sl.others.push({
        ...entry(w, p),
        placed: w.placed,
        placedAtHigherPref: placedPrefNo !== null && placedPrefNo < p.preferenceNo,
        placedAt: w.placed ? { q: w.q!, s: w.s!, h: w.h! } : null,
      });
    }
  }

  for (const specs of Object.values(seatTree))
    for (const hosps of Object.values(specs))
      for (const sl of Object.values(hosps)) {
        sl.candidates.sort((a, b) => b.marksTotal - a.marksTotal);
        sl.others.sort((a, b) => b.marksTotal - a.marksTotal);
      }

  return { seatTree, candidates: prog, passes };
}

export type PreferenceOutcome =
  | { pref: Preference; status: "placed" }
  | { pref: Preference; status: "no_slot" }
  | { pref: Preference; status: "not_attempted" }
  | { pref: Preference; status: "beaten"; cutoff: number | null; capacity: number; filled: number };

/**
 * What happened at each of a candidate's preferences, in order, ending at the one
 * that placed them: no such seat, beaten (with the slot's closing mark), or placed.
 */
export function preferenceOutcomes(w: WorkingCandidate, seatTree: SeatTree): PreferenceOutcome[] {
  const placedPrefNo = w.placed
    ? (w.prefs.find((p) => p.quotaName === w.q && p.specialityName === w.s && p.hospitalName === w.h)?.preferenceNo ?? Infinity)
    : Infinity;
  const out: PreferenceOutcome[] = [];
  for (const pref of w.prefs) {
    const sl = seatTree[pref.quotaName]?.[pref.specialityName]?.[pref.hospitalName];
    if (!sl) {
      out.push({ pref, status: "no_slot" });
      continue;
    }
    if (w.placed && pref.quotaName === w.q && pref.specialityName === w.s && pref.hospitalName === w.h) {
      out.push({ pref, status: "placed" });
      break;
    }
    if (pref.preferenceNo > placedPrefNo) {
      out.push({ pref, status: "not_attempted" });
      continue;
    }
    const cutoff = sl.candidates.length ? Math.min(...sl.candidates.map((x) => x.marksTotal)) : null;
    out.push({ pref, status: "beaten", cutoff, capacity: sl.jobs, filled: sl.candidates.length });
  }
  return out;
}
