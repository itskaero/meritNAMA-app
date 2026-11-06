import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { assertCan, type Session } from "@/lib/auth/roles";
import type { Database } from "@/lib/db/client";
import { scoringPolicies } from "@/lib/db/schema";
import { BAND, coverage, MAX_CHANGE, MIN_SAMPLES, predictNext, samePolicyInductions, type Band } from "@/lib/domain/prediction";
import type { Db } from "./shared";

/**
 * Next-round predictions (see src/lib/domain/prediction.ts for the method).
 * Every function returns closings and bands per group; nothing per applicant.
 */

const inductionSchema = z.number().int().min(1).max(999);
const roundSchema = z.number().int().min(1).max(99);

/**
 * Speciality key that matches across years: the name with case, spaces and
 * punctuation removed (older inductions are often not mapped to lookup ids).
 */
const SPEC_KEY = sql`regexp_replace(lower(m.speciality), '[^a-z0-9]+', '', 'g')`;

type History = { bySpeciality: Map<string, number[]>; byTrack: Map<string, number[]>; inductions: number[]; dropped: number };

/** Relative round-to-round changes of closing merit in every induction except `exclude`. */
async function transitionHistory(db: Db, exclude: number): Promise<History> {
  const rows = (await db.execute(sql`
    with g as (
      select r.induction_id as i, r.round_no as n, m.program as p, m.quota as q, ${SPEC_KEY} as s, min(m.marks) as c
      from merit_rounds r join merit_allocations m on m.round_id = r.id
      where r.induction_id <> ${exclude}
      group by 1, 2, 3, 4, 5)
    select a.i, a.p, a.q, a.s, a.n as from_round, (b.c - a.c) / a.c as change
    from g a join g b on b.i = a.i and b.p = a.p and b.q = a.q and b.s = a.s and b.n = a.n + 1
    where a.c > 0`)) as unknown as { i: number; p: string; q: string; s: string; from_round: number; change: number }[];
  const bySpeciality = new Map<string, number[]>(), byTrack = new Map<string, number[]>();
  const push = (m: Map<string, number[]>, k: string, v: number) => (m.get(k) ?? m.set(k, []).get(k)!).push(v);
  let dropped = 0;
  for (const r of rows) {
    const c = Number(r.change);
    if (!Number.isFinite(c) || Math.abs(c) > MAX_CHANGE) {
      dropped++;
      continue;
    }
    push(bySpeciality, `${r.p}|${r.q}|${r.s}|${r.from_round}`, c);
    push(byTrack, `${r.p}|${r.q}|${r.from_round}`, c);
  }
  return { bySpeciality, byTrack, inductions: [...new Set(rows.map((r) => r.i))].sort((a, b) => a - b), dropped };
}

type Closing = { p: string; q: string; s: string; speciality: string; hospital: string | null; c: number };

/** Closing merit per speciality (hospital = null) and per speciality × hospital in one round. */
async function closings(db: Db, induction: number, round: number, track?: string): Promise<Closing[]> {
  const [program, quota] = track ? (track.split("|") as [string, string]) : [null, null];
  const rows = (await db.execute(sql`
    select m.program as p, m.quota as q, ${SPEC_KEY} as s, max(m.speciality) as speciality,
           case when grouping(m.hospital) = 1 then null else m.hospital end as hospital, min(m.marks) as c
    from merit_rounds r join merit_allocations m on m.round_id = r.id
    where r.induction_id = ${induction} and r.round_no = ${round}
      ${program ? sql`and m.program = ${program} and m.quota = ${quota}` : sql``}
    group by grouping sets ((m.program, m.quota, ${SPEC_KEY}), (m.program, m.quota, ${SPEC_KEY}, m.hospital))`)) as unknown as Closing[];
  return rows.map((r) => ({ ...r, c: Number(r.c) }));
}

export type PredictedRow = Band & { program: string; quota: string; speciality: string; hospital: string | null; closing: number; actual: number | null; inside: boolean | null };

function bandsFor(hist: History, now: Closing[], next: Closing[] | null, fromRound: number): PredictedRow[] {
  const key = (r: Closing) => `${r.p}|${r.q}|${r.s}|${r.hospital ?? ""}`;
  const actual = new Map((next ?? []).map((r) => [key(r), r.c]));
  const out: PredictedRow[] = [];
  for (const r of now) {
    const own = hist.bySpeciality.get(`${r.p}|${r.q}|${r.s}|${fromRound}`) ?? [];
    const pool = own.length >= MIN_SAMPLES ? { changes: own, fallback: false } : { changes: hist.byTrack.get(`${r.p}|${r.q}|${fromRound}`) ?? [], fallback: true };
    const b = predictNext({ closing: r.c, ...pool });
    if (!b) continue;
    const a = next ? actual.get(key(r)) ?? null : null;
    out.push({ ...b, program: r.p, quota: r.q, speciality: r.speciality, hospital: r.hospital, closing: r.c, actual: a, inside: a == null ? null : a >= b.low - 1e-9 && a <= b.high + 1e-9 });
  }
  return out;
}

async function roundNumbers(db: Db, induction: number) {
  const rows = (await db.execute(sql`select round_no, ends_on from merit_rounds where induction_id = ${induction} order by round_no`)) as unknown as { round_no: number; ends_on: string | null }[];
  return { rounds: rows.map((r) => r.round_no), endsOn: rows[0]?.ends_on ?? null };
}

/**
 * An induction is still running when its cycle has not ended (or has no end date):
 * only then is "the next round" a forecast rather than a look back.
 */
export async function inductionRunning(db: Db, induction: number, today = new Date()) {
  const { endsOn } = await roundNumbers(db, induction);
  return !endsOn || Date.parse(`${endsOn}T23:59:59Z`) >= today.getTime();
}

/**
 * Predicted closing for round `fromRound + 1` of an induction, per speciality and
 * per hospital, from the same transition in the other inductions. When that round
 * already exists, each row also carries the actual value and whether it fell inside.
 */
export async function predictRound(db: Database, session: Session | null, input: { induction: number; fromRound: number; track?: string }) {
  assertCan(session, "portal");
  const induction = inductionSchema.parse(input.induction), fromRound = roundSchema.parse(input.fromRound);
  const { rounds } = await roundNumbers(db, induction);
  const hasNext = rounds.includes(fromRound + 1);
  const [hist, now, next] = await Promise.all([
    transitionHistory(db, induction),
    closings(db, induction, fromRound, input.track),
    hasNext ? closings(db, induction, fromRound + 1, input.track) : Promise.resolve(null),
  ]);
  const rows = bandsFor(hist, now, next, fromRound);
  return {
    induction,
    fromRound,
    toRound: fromRound + 1,
    hasActual: hasNext,
    specialities: rows.filter((r) => r.hospital === null),
    hospitals: new Map(rows.filter((r) => r.hospital !== null).map((r) => [`${r.program}|${r.quota}|${r.speciality}|${r.hospital}`, r])),
    method: { inductions: hist.inductions, band: BAND, dropped: hist.dropped },
  };
}

/**
 * How well the method did on a finished induction: for each transition, predict
 * from round r with the other inductions, compare with the real round r + 1.
 */
export async function methodCheck(db: Database, session: Session | null, input: { induction: number; track?: string }) {
  assertCan(session, "portal");
  const induction = inductionSchema.parse(input.induction);
  const { rounds } = await roundNumbers(db, induction);
  const hist = await transitionHistory(db, induction);
  const perRound = await Promise.all(rounds.slice(0, -1).map(async (r) => {
    const [now, next] = await Promise.all([closings(db, induction, r, input.track), closings(db, induction, r + 1, input.track)]);
    const rows = bandsFor(hist, now, next, r).filter((x) => x.hospital === null && x.actual !== null);
    return { from: r, to: r + 1, ...coverage(rows.map((x) => ({ low: x.low, high: x.high, actual: x.actual! }))) };
  }));
  const all = perRound.reduce((a, t) => ({ inside: a.inside + (t.share ?? 0) * t.n, n: a.n + t.n }), { inside: 0, n: 0 });
  return { induction, transitions: perRound, share: all.n ? all.inside / all.n : null, n: all.n, inductionsUsed: hist.inductions };
}

/**
 * Whether the first round of `induction` could be predicted in raw marks: that
 * needs at least two earlier inductions under the same scoring policy.
 */
export async function nextInductionGate(db: Database, session: Session | null, induction: number) {
  assertCan(session, "portal");
  const rows = await db.select({ key: scoringPolicies.policyKey, definition: scoringPolicies.definition }).from(scoringPolicies);
  const policies = Object.fromEntries(rows.map((r) => [r.key, r.definition as { induction?: unknown; label?: string; total_marks?: number }]));
  const p = samePolicyInductions(policies, induction);
  const open = p.earlier.length >= 2;
  const reason = !p.policy
    ? `No scoring policy is recorded for induction ${induction}, so its first round cannot be compared with earlier ones.`
    : open
      ? `Inductions ${p.earlier.join(", ")} share the ${p.label} policy, so their first rounds can be compared.`
      : `Induction ${induction} uses the ${p.label} policy${p.total ? ` (${p.total} marks)` : ""}${p.earlier.length ? `, shared only with induction ${p.earlier[0]}` : ", which no earlier induction used"}. At least two earlier inductions under the same policy are needed to predict its first round.`;
  return { open, policy: p.policy, earlier: p.earlier, reason };
}
