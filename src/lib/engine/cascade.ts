/**
 * Next-round upgrade cascade, ported from the legacy simulator (`js/sim-cascade.js`,
 * itself a port of `merit_cascade.py`), public repo itskaero/meritnama @ f686206.
 *
 * Starts from a published round's allocations, applies consent (rejected / awaited
 * candidates and those whose profile is not accepted lose their seats; a candidate
 * who accepted keeps that seat and gives up the others), then fills every vacated
 * seat in waves: the best-marked eligible candidate who listed the seat above
 * everything they currently hold moves up, which vacates their old seat for the
 * next wave. Stops when a wave changes nothing (or after `maxWaves`).
 *
 * Marks come from the shared marks module and the allocation rules decide who may
 * keep and take seats. Pure and synchronous. Under LEGACY_CASCADE_RULES behaviour
 * matches the legacy code exactly (tests/engine-golden.test.ts). Two details:
 * applicant ids must be integers, and work proceeds in ascending id order wherever
 * the legacy code walked an object keyed by id.
 */
import { marksContext, preferenceMark, type Certificate, type EngineCandidate, type MarksContext, type Preference } from "./marks";
import type { ResolvedRules } from "./rules";

/** Speciality ids that the legacy discipline file lacks; these names win over the input map. */
export const MISSING_SPEC_IDS: Readonly<Record<number, string>> = {
  63: "Physical Medicine & Rehablitation",
  69: "Nuclear Medicine",
  70: "Immunology",
  71: "Virology",
};

export type CascadeMeritEntry = {
  applicantId: number | string;
  typeName: string;
  specialityName: string;
  hospitalName: string;
  quotaName: string;
};

export type CascadeConsentRow = {
  applicantId: number | string;
  status: "Accepted" | "Rejected" | "Awaited" | string;
  preferenceNo: number;
  /** "FCPS - Punjab - Medicine - Mayo Hospital" as published; or give `seatKey` directly. */
  infoTitle?: string | null;
  seatKey?: string | null;
};

export type CascadeSeatLine = { typeName: string; specialityName: string; hospitalName: string; quotaName: string; seats: number };

export type CascadePreference = {
  typeName: string;
  typeId?: number | null;
  specialityId: number;
  hospitalName: string;
  quotaName: string;
  preferenceNo: number;
  disciplineIds?: number[] | null;
  programMarks?: number | string | null;
  /** Parent-institute bonus for this preference. */
  marks?: number | string | null;
};

export type CascadeCandidate = {
  marksTotal?: number | null;
  /** Per-programme marks, the certificate fallback when the rules allow it. */
  programMarks?: EngineCandidate["programMarks"];
  preferences?: CascadePreference[] | null;
};

export type CascadeCertificate = Certificate;

/** Profile verification status: 1 Accepted, 2 Rejected, 11 Pending, null unknown. */
export type ProfileStatusFn = (applicantId: number) => number | null | undefined;

export type CascadeInput = {
  rules: ResolvedRules;
  /** Speciality groups, for matching certificates by name when the rules allow it. */
  ctx?: MarksContext;
  merit: readonly CascadeMeritEntry[];
  consent: readonly CascadeConsentRow[];
  seats: readonly CascadeSeatLine[];
  candidates: Readonly<Record<string, CascadeCandidate>>;
  certificates: Readonly<Record<string, readonly CascadeCertificate[] | undefined>>;
  /** specialityId → speciality name as used in seat lines. */
  specialityNames: Readonly<Record<number, string>>;
  profileStatus: ProfileStatusFn;
  /** Candidates rejected in earlier simulated rounds (carried forward). */
  extraRejected?: ReadonlySet<number>;
  onWave?: (p: { wave: number; changesThisPass: number; totalPlacements: number; totalUpgrades: number }) => void;
};

export type CascadePlacement = {
  applicantId: number;
  typeName: string;
  specialityName: string;
  hospitalName: string;
  quotaName: string;
  /** 0 when the candidate holds a seat they did not list (as published); 999 for a consent seat not listed. */
  preferenceNo: number;
  marksTotal: number;
  effectiveMark: number;
  certBonus: number;
};

export type CascadeStats = {
  waves: number;
  totalPlacements: number;
  totalUpgrades: number;
  initialVacancies: number;
  finalUnfilled: number;
  initialFmCandidates: number;
  initialFmOccupancy: number;
  multiProgramFm: number;
  multiTrackFm: number;
  locked: number;
  simPlaced: number;
};

export type CascadeResult = {
  placements: CascadePlacement[];
  stats: CascadeStats;
  consentRejected: Set<number>;
  consentAwaited: Set<number>;
};

export function seatKeyFromParts(typeName: string, specialityName: string, hospitalName: string, quotaName: string | null | undefined): string {
  return `${typeName}|${specialityName}|${hospitalName}|${(quotaName || "").trim()}`;
}

export function seatKey(e: { typeName: string; specialityName: string; hospitalName: string; quotaName?: string | null }): string {
  return seatKeyFromParts(e.typeName, e.specialityName, e.hospitalName, e.quotaName);
}

/** "Programme - Quota - Speciality - … - Hospital" → parts; null when it has fewer than 4. */
export function parseConsentTitle(title: unknown) {
  const parts = String(title ?? "").split(" - ").map((p) => p.trim());
  if (parts.length < 4) return null;
  const [typeName = "", quotaName = "", specialityName = ""] = parts;
  return { typeName, quotaName, specialityName, hospitalName: parts[parts.length - 1] ?? "" };
}

export function consentSeatKey(row: CascadeConsentRow): string | null {
  if (row.seatKey) return row.seatKey;
  const p = parseConsentTitle(row.infoTitle);
  return p ? seatKeyFromParts(p.typeName, p.specialityName, p.hospitalName, p.quotaName) : null;
}

const asc = (a: number, b: number) => a - b;
const part = (sk: string, i: number): string => sk.split("|")[i] ?? "";

export function runCascade(input: CascadeInput): CascadeResult {
  const specMap: Record<number, string> = { ...input.specialityNames, ...MISSING_SPEC_IDS };

  const seatCapacity = new Map<string, number>();
  for (const s of input.seats) seatCapacity.set(seatKey(s), s.seats);

  // Candidates, in ascending id order (how the legacy code walked the id-keyed object).
  const candidateMarks = new Map<number, number>();
  const allCandidateIds: number[] = [];
  for (const [cidStr, cand] of Object.entries(input.candidates)) {
    const cid = Number(cidStr);
    candidateMarks.set(cid, cand.marksTotal || 0);
    allCandidateIds.push(cid);
  }
  allCandidateIds.sort(asc);

  const rules = input.rules;
  const ctx = input.ctx ?? marksContext();
  const eligibleStatus = new Set(rules.cascade.eligibleProfileStatus);

  // Mark per seat, and the preference number per seat, for listed seats that exist.
  const effMarkForSeat = new Map<number, Map<string, number>>();
  const candidatePrefMap = new Map<number, Map<string, number>>();
  for (const cid of allCandidateIds) {
    const base = candidateMarks.get(cid) || 0;
    const cand = input.candidates[String(cid)];
    if (!cand || !Array.isArray(cand.preferences)) continue;
    const marks = new Map<string, number>();
    const prefs = new Map<string, number>();
    const engineCand: EngineCandidate = {
      applicantId: cid,
      baseMarks: base,
      programMarks: cand.programMarks,
      certificates: input.certificates[String(cid)] ?? [],
      preferences: {},
    };
    for (const p of cand.preferences) {
      const specName = specMap[p.specialityId];
      if (!specName) continue;
      const sk = seatKeyFromParts(p.typeName, specName, p.hospitalName, p.quotaName);
      if (!seatCapacity.has(sk)) continue;
      const pref: Preference = { ...p, specialityName: specName };
      marks.set(sk, preferenceMark(rules, ctx, engineCand, p.typeName, pref));
      prefs.set(sk, p.preferenceNo);
    }
    if (marks.size) effMarkForSeat.set(cid, marks);
    candidatePrefMap.set(cid, prefs);
  }

  const effectiveMark = (cid: number, sk: string) => effMarkForSeat.get(cid)?.get(sk) ?? candidateMarks.get(cid) ?? 0;

  // Consent per candidate.
  const consentsByCandidate = new Map<number, CascadeConsentRow[]>();
  for (const row of input.consent) {
    const cid = Number(row.applicantId);
    if (!consentsByCandidate.has(cid)) consentsByCandidate.set(cid, []);
    consentsByCandidate.get(cid)!.push(row);
  }
  const consentApproved = new Map<number, CascadeConsentRow>();
  const consentRejected = new Set<number>();
  const consentAwaited = new Set<number>();
  for (const [cid, rows] of consentsByCandidate) {
    const accepted = rows.filter((r) => r.status === "Accepted").sort((a, b) => a.preferenceNo - b.preferenceNo);
    if (accepted[0]) consentApproved.set(cid, accepted[0]);
    if (rows.every((r) => r.status === "Rejected")) consentRejected.add(cid);
    if (rows.every((r) => r.status === "Awaited")) consentAwaited.add(cid);
  }
  for (const cid of input.extraRejected ?? []) consentRejected.add(cid);

  const isEligible = (cid: number) =>
    eligibleStatus.has(input.profileStatus(cid) ?? NaN) && !consentRejected.has(cid) && !consentAwaited.has(cid);

  // Seats, seeded with the published round.
  const seats = new Map<string, { capacity: number; occupants: Map<number, number> }>();
  for (const [sk, cap] of seatCapacity) seats.set(sk, { capacity: cap, occupants: new Map() });

  const candidateState = new Map<number, Map<string, number>>();
  const stateOf = (cid: number) => {
    if (!candidateState.has(cid)) candidateState.set(cid, new Map());
    return candidateState.get(cid)!;
  };
  const fmCandidates = new Set<number>();
  let initialFmOccupancy = 0;
  const fmPrograms = new Map<number, Set<string>>();
  const fmQuotas = new Map<number, Map<string, Set<string>>>();
  for (const e of input.merit) {
    const cid = Number(e.applicantId);
    const sk = seatKey(e);
    const prefNo = candidatePrefMap.get(cid)?.get(sk) ?? 0;
    const seat = seats.get(sk);
    if (seat) {
      seat.occupants.set(cid, prefNo);
      stateOf(cid).set(sk, prefNo);
    }
    fmCandidates.add(cid);
    initialFmOccupancy++;
    if (!fmPrograms.has(cid)) fmPrograms.set(cid, new Set());
    fmPrograms.get(cid)!.add(e.typeName);
    if (!fmQuotas.has(cid)) fmQuotas.set(cid, new Map());
    const byType = fmQuotas.get(cid)!;
    if (!byType.has(e.typeName)) byType.set(e.typeName, new Set());
    byType.get(e.typeName)!.add((e.quotaName || "").trim());
  }
  const multiProgramFm = new Set([...fmPrograms].filter(([, p]) => p.size > 1).map(([cid]) => cid));
  const multiTrackInType = new Map<number, Set<string>>();
  for (const [cid, byType] of fmQuotas) {
    for (const [tn, qs] of byType) {
      if (qs.size <= 1) continue;
      if (!multiTrackInType.has(cid)) multiTrackInType.set(cid, new Set());
      multiTrackInType.get(cid)!.add(tn);
    }
  }

  const vacantQueue: string[] = [];
  const vacate = (cid: number, sk: string) => {
    const seat = seats.get(sk);
    if (seat?.occupants.has(cid)) {
      seat.occupants.delete(cid);
      candidateState.get(cid)?.delete(sk);
      vacantQueue.push(sk);
    }
  };
  const vacateAll = (cid: number) => {
    for (const sk of [...(candidateState.get(cid)?.keys() ?? [])]) vacate(cid, sk);
  };
  const stateIds = () => [...candidateState.keys()].sort(asc);
  const acceptedSeatKey = (cid: number) => {
    const row = consentApproved.get(cid);
    return row ? consentSeatKey(row) : null;
  };

  for (const cid of stateIds()) {
    const status = input.profileStatus(cid);
    if (status != null && !eligibleStatus.has(status)) {
      vacateAll(cid);
      continue;
    }
    if (consentRejected.has(cid) || consentAwaited.has(cid)) {
      vacateAll(cid);
      continue;
    }
    if (consentApproved.has(cid)) {
      const accSk = acceptedSeatKey(cid);
      if (!accSk) continue;
      for (const sk of [...(candidateState.get(cid)?.keys() ?? [])]) {
        if (sk !== accSk && seats.get(sk)?.occupants.has(cid)) vacate(cid, sk);
      }
      const seat = seats.get(accSk);
      if (seat && !seat.occupants.has(cid) && seat.occupants.size < seat.capacity) {
        const prefNo = candidatePrefMap.get(cid)?.get(accSk) ?? 999;
        seat.occupants.set(cid, prefNo);
        stateOf(cid).set(accSk, prefNo);
      }
    }
  }

  // Which programmes and quotas each seated candidate may still move within.
  const allowedPrograms = new Map<number, Set<string>>();
  for (const cid of stateIds()) {
    if (consentApproved.has(cid)) {
      const accSk = acceptedSeatKey(cid);
      if (accSk) {
        const prog = part(accSk, 0);
        allowedPrograms.set(cid, multiProgramFm.has(cid) ? new Set([prog]) : (fmPrograms.get(cid) ?? new Set([prog])));
      }
    } else {
      allowedPrograms.set(cid, fmPrograms.get(cid) ?? new Set());
    }
  }
  const allowedQuotas = new Map<number, Set<string>>();
  for (const cid of [...multiTrackInType.keys()].sort(asc)) {
    const accSk = acceptedSeatKey(cid);
    if (!accSk) continue;
    const type = part(accSk, 0);
    if (!multiTrackInType.get(cid)?.has(type)) continue;
    allowedQuotas.set(cid, new Set([part(accSk, 3)]));
    if (!allowedPrograms.get(cid)?.has(type)) allowedPrograms.set(cid, new Set([type]));
  }

  // Accepted their first preference: may not move to another programme.
  const locked = new Set<number>();
  for (const cid of rules.cascade.lockAcceptedFirstPreference === "none" ? [] : stateIds()) {
    const accSk = acceptedSeatKey(cid);
    if (accSk && candidateState.get(cid)?.has(accSk) && candidatePrefMap.get(cid)?.get(accSk) === 1) locked.add(cid);
  }

  const initialVacancies = vacantQueue.length;

  const canTake = (cid: number, sk: string) => {
    if (!candidatePrefMap.get(cid)?.has(sk)) return false;
    const allowed = allowedPrograms.get(cid);
    if (allowed && allowed.size > 0 && !allowed.has(part(sk, 0))) return false;
    const allowedQ = allowedQuotas.get(cid);
    if (allowedQ && !allowedQ.has(part(sk, 3))) return false;
    return true;
  };
  const heldIn = (cid: number, match: (sk: string) => boolean): [string, number][] =>
    [...(candidateState.get(cid) ?? [])].filter(([sk]) => match(sk));

  // Candidates ranked per programme + speciality by their best mark there.
  const bestBySpecialty = new Map<string, Map<number, number>>();
  for (const cid of allCandidateIds) {
    for (const [sk, em] of effMarkForSeat.get(cid) ?? []) {
      const key = `${part(sk, 0)}|${part(sk, 1)}`;
      if (!bestBySpecialty.has(key)) bestBySpecialty.set(key, new Map());
      const m = bestBySpecialty.get(key)!;
      if (!m.has(cid) || em > m.get(cid)!) m.set(cid, em);
    }
  }
  const sortedBySpecialty = new Map<string, number[]>();
  for (const [key, marks] of bestBySpecialty) {
    sortedBySpecialty.set(
      key,
      allCandidateIds.slice().sort((a, b) => {
        const ma = marks.get(a) || 0;
        const mb = marks.get(b) || 0;
        return mb !== ma ? mb - ma : a - b;
      }),
    );
  }

  let wave = 0;
  let totalPlacements = 0;
  let totalUpgrades = 0;
  for (;;) {
    wave++;
    let changes = 0;
    const uniqueVacant = [...new Set(vacantQueue)];
    vacantQueue.length = 0;

    for (const sk of uniqueVacant) {
      const seat = seats.get(sk);
      if (!seat || seat.occupants.size >= seat.capacity) continue;
      const vacancies = seat.capacity - seat.occupants.size;
      const typeName = part(sk, 0);
      const seatQuota = part(sk, 3);
      const ranked = sortedBySpecialty.get(`${typeName}|${part(sk, 1)}`) ?? allCandidateIds;

      for (let v = 0; v < vacancies; v++) {
        let placed = false;
        for (const cid of ranked) {
          if (!isEligible(cid) || !canTake(cid, sk) || seat.occupants.has(cid)) continue;
          const newPref = candidatePrefMap.get(cid)?.get(sk);
          if (newPref == null) continue;

          // perQuota: one seat per quota, or per programme for candidates seated in two of its quotas.
          const held = rules.cascade.seatHolding === "perProgramme" || multiTrackInType.get(cid)?.has(typeName)
            ? heldIn(cid, (h) => part(h, 0) === typeName)
            : heldIn(cid, (h) => part(h, 0) === typeName && part(h, 3) === seatQuota);

          if (!held.length) {
            seat.occupants.set(cid, newPref);
            stateOf(cid).set(sk, newPref);
            totalPlacements++;
            changes++;
            placed = true;
            break;
          }

          const currentBest = Math.min(...held.map(([, p]) => p));
          if (locked.has(cid)) {
            const accSk = acceptedSeatKey(cid);
            if (accSk && typeName !== part(accSk, 0)) continue;
          }
          if (newPref >= currentBest) continue;

          if (seat.occupants.size >= seat.capacity) {
            const occ = [...seat.occupants.keys()].sort(asc);
            const lowest = Math.min(...occ.map((o) => effectiveMark(o, sk)));
            if (effectiveMark(cid, sk) <= lowest) continue;
          }

          for (const [oldSk] of held) {
            const old = seats.get(oldSk);
            if (old?.occupants.has(cid)) {
              old.occupants.delete(cid);
              candidateState.get(cid)?.delete(oldSk);
              if (!vacantQueue.includes(oldSk)) vacantQueue.push(oldSk);
            }
          }
          seat.occupants.set(cid, newPref);
          stateOf(cid).set(sk, newPref);
          totalPlacements++;
          totalUpgrades++;
          changes++;
          placed = true;
          break;
        }
        if (!placed) break;
      }
    }

    if (changes === 0) break;
    if (wave > rules.cascade.maxWaves) break;
    input.onWave?.({ wave, changesThisPass: changes, totalPlacements, totalUpgrades });
  }

  const placements: CascadePlacement[] = [];
  let unfilled = 0;
  for (const [sk, seat] of seats) {
    const [typeName = "", specialityName = "", hospitalName = "", quotaName = ""] = sk.split("|");
    for (const cid of [...seat.occupants.keys()].sort(asc)) {
      const eff = effectiveMark(cid, sk);
      const base = candidateMarks.get(cid) || 0;
      placements.push({
        applicantId: cid,
        typeName,
        specialityName,
        hospitalName,
        quotaName,
        preferenceNo: seat.occupants.get(cid)!,
        marksTotal: base,
        effectiveMark: eff,
        certBonus: Math.round((eff - base) * 10000) / 10000,
      });
    }
    if (seat.occupants.size < seat.capacity) unfilled += seat.capacity - seat.occupants.size;
  }
  placements.sort((a, b) => b.marksTotal - a.marksTotal || a.applicantId - b.applicantId);

  return {
    placements,
    stats: {
      waves: wave,
      totalPlacements,
      totalUpgrades,
      initialVacancies,
      finalUnfilled: unfilled,
      initialFmCandidates: fmCandidates.size,
      initialFmOccupancy,
      multiProgramFm: multiProgramFm.size,
      multiTrackFm: multiTrackInType.size,
      locked: locked.size,
      simPlaced: placements.length,
    },
    consentRejected,
    consentAwaited,
  };
}

/** How a simulated round compares with the one PHF actually published. */
export function compareWithActual(
  sim: readonly CascadePlacement[],
  actual: readonly (CascadeMeritEntry & { preferenceNo?: number | null })[],
  prefMap?: ReadonlyMap<number, ReadonlyMap<string, number>>,
) {
  const simMap = new Map<number, { seatKey: string; prefNo: number; effMark: number }>();
  for (const p of sim) simMap.set(p.applicantId, { seatKey: seatKey(p), prefNo: p.preferenceNo, effMark: p.effectiveMark });
  const actualMap = new Map<number, { seatKey: string; prefNo: number; effMark: number }>();
  for (const e of actual) {
    const cid = Number(e.applicantId);
    if (!actualMap.has(cid)) actualMap.set(cid, { seatKey: seatKey(e), prefNo: e.preferenceNo || 0, effMark: 0 });
  }
  const common = [...simMap.keys()].filter((cid) => actualMap.has(cid)).sort(asc);
  let sameSeat = 0;
  let simBetter = 0;
  let actualBetter = 0;
  const mismatches: { cid: number; sim: string; actual: string; simPref: number; actPref: number; simEff: number }[] = [];
  for (const cid of common) {
    const s = simMap.get(cid)!;
    const a = actualMap.get(cid)!;
    if (s.seatKey === a.seatKey) {
      sameSeat++;
      continue;
    }
    const actPref = prefMap?.get(cid)?.get(a.seatKey) ?? 999;
    if (s.prefNo < actPref) simBetter++;
    else if (actPref < s.prefNo) actualBetter++;
    else if (s.effMark > a.effMark) simBetter++;
    else actualBetter++;
    mismatches.push({ cid, sim: s.seatKey, actual: a.seatKey, simPref: s.prefNo, actPref, simEff: s.effMark });
  }
  return { common: common.length, sameSeat, simBetter, actualBetter, agreement: common.length ? (sameSeat / common.length) * 100 : 0, mismatches };
}
