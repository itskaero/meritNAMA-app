import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { assertCan, type Session } from "@/lib/auth/roles";
import type { Database } from "@/lib/db/client";

/**
 * Aggregates for the merit visuals (round funnel, ladder, seat flow …). Every
 * function returns counts and marks per group; applicant ids are only compared
 * inside SQL and never leave the database.
 */

const inductionSchema = z.number().int().min(1).max(999);
const trackSchema = z
  .string()
  .regex(/^[^|]{1,80}\|[^|]{1,80}$/)
  .optional();

/** Optional programme·quota filter ("FCPS|Punjab"). */
const trackWhere = (track?: string) => {
  if (!track) return sql``;
  const [program, quota] = track.split("|") as [string, string];
  return sql`and m.program = ${program} and m.quota = ${quota}`;
};

export type SettlingRound = {
  roundNo: number;
  /** Candidates holding at least one allocation in this round. */
  holding: number;
  /** Candidates in the final round who are not yet in their final seat(s) here (absent or elsewhere). */
  moving: number;
  /** Compared with the round before: newly listed, moved to a different seat, left the list. */
  entered: number;
  moved: number;
  left: number;
};

/**
 * "Who is still moving": for each round, how many of the final round's
 * candidates are not yet where they end up. Narrows to 0 at the final round.
 */
export async function roundSettling(db: Database, session: Session | null, induction: number, track?: string) {
  assertCan(session, "portal");
  const ind = inductionSchema.parse(induction);
  const tr = trackSchema.parse(track || undefined);
  const rows = (await db.execute(sql`
    with a as materialized (
      select r.round_no as n, m.applicant_id as ap,
             string_agg(m.program || '|' || m.quota || '|' || m.speciality || '|' || m.hospital, ',' order by m.row_no) as k
      from merit_rounds r join merit_allocations m on m.round_id = r.id
      where r.induction_id = ${ind} ${trackWhere(tr)}
      group by r.round_no, m.applicant_id),
    rounds as (select distinct n from a),
    f as (select ap, k from a where n = (select max(n) from a)),
    -- Each candidate in round n paired with themselves in round n - 1 (either side may be missing).
    pairs as (
      select coalesce(c.n, p.n + 1) as n, c.k as now_k, p.k as prev_k, c.ap is not null as here, p.ap is not null as before
      from a c full join a p on p.ap = c.ap and p.n = c.n - 1),
    flow as (
      select n,
        count(*) filter (where here)::int as holding,
        count(*) filter (where here and not before)::int as entered,
        count(*) filter (where here and before and now_k <> prev_k)::int as moved,
        count(*) filter (where before and not here)::int as left_list
      from pairs where n in (select n from rounds) group by n),
    settle as (
      select rounds.n, count(*) filter (where c.k is distinct from f.k)::int as moving
      from rounds cross join f left join a c on c.n = rounds.n and c.ap = f.ap
      group by rounds.n)
    select flow.n as round_no, flow.holding, settle.moving, flow.entered, flow.moved, flow.left_list, (select count(*) from f)::int as final
    from flow join settle on settle.n = flow.n order by flow.n`)) as unknown as { round_no: number; holding: number; moving: number; entered: number; moved: number; left_list: number; final: number }[];
  return {
    final: rows[0]?.final ?? 0,
    rounds: rows.map((r): SettlingRound => ({ roundNo: r.round_no, holding: r.holding, moving: r.moving, entered: r.entered, moved: r.moved, left: r.left_list })),
  };
}

/** Programme·quota tracks of an induction, largest first (for the track filter). */
export async function inductionTracks(db: Database, session: Session | null, induction: number) {
  assertCan(session, "portal");
  const ind = inductionSchema.parse(induction);
  const rows = (await db.execute(sql`
    select m.program, m.quota, count(*)::int as n
    from merit_rounds r join merit_allocations m on m.round_id = r.id
    where r.induction_id = ${ind}
    group by m.program, m.quota order by n desc`)) as unknown as { program: string; quota: string; n: number }[];
  return rows.map((r) => ({ value: `${r.program}|${r.quota}`, label: `${r.program} · ${r.quota}`, allocations: r.n }));
}

export type LadderRow = { key: string; label: string; specialityId: number | null; marks: (number | null)[] };

/**
 * Lowest closing merit per row per round, for the merit ladder and the heat grid.
 * Rows are specialities within one programme·quota, or (with `speciality`) the
 * programme·quotas of one speciality. Only rows present in every round are kept,
 * so each row's movement is comparable.
 */
export async function closingLadder(
  db: Database,
  session: Session | null,
  input: { induction: number; track?: string; specialityId?: number },
) {
  assertCan(session, "portal");
  const ind = inductionSchema.parse(input.induction);
  const tr = trackSchema.parse(input.track || undefined);
  const spec = input.specialityId === undefined ? undefined : z.number().int().positive().parse(input.specialityId);
  const bySpeciality = spec === undefined;
  const rows = (await db.execute(sql`
    select r.round_no, ${bySpeciality ? sql`m.speciality` : sql`m.program || '|' || m.quota`} as key,
           max(m.speciality_id) as speciality_id, min(m.marks) as closing
    from merit_rounds r join merit_allocations m on m.round_id = r.id
    where r.induction_id = ${ind} ${trackWhere(tr)} ${spec === undefined ? sql`` : sql`and m.speciality_id = ${spec}`}
    group by r.round_no, 2
    order by 2, r.round_no`)) as unknown as { round_no: number; key: string; speciality_id: number | null; closing: number }[];
  const rounds = [...new Set(rows.map((r) => r.round_no))].sort((a, b) => a - b);
  const byKey = new Map<string, LadderRow>();
  for (const r of rows) {
    const row = byKey.get(r.key) ?? { key: r.key, label: bySpeciality ? r.key : r.key.replace("|", " · "), specialityId: r.speciality_id == null ? null : Number(r.speciality_id), marks: rounds.map(() => null) };
    row.marks[rounds.indexOf(r.round_no)] = Number(r.closing);
    byKey.set(r.key, row);
  }
  const complete = [...byKey.values()].filter((r) => r.marks.every((m) => m !== null));
  complete.sort((a, b) => (b.marks.at(-1) ?? 0) - (a.marks.at(-1) ?? 0));
  return { rounds, rows: complete };
}

export type FlowPanel = { key: string; label: string; rounds: { roundNo: number; accepted: number; released: number }[]; released: number };

/**
 * Seats accepted vs released (declined or not available) per round. Panels are
 * specialities (largest first, up to `limit`) or, with `specialityId`, that
 * speciality's programme·quotas. Released seats are offered again next round.
 */
export async function seatFlow(db: Database, session: Session | null, input: { induction: number; specialityId?: number; limit?: number }) {
  assertCan(session, "portal");
  const ind = inductionSchema.parse(input.induction);
  const spec = input.specialityId === undefined ? undefined : z.number().int().positive().parse(input.specialityId);
  const bySpeciality = spec === undefined;
  const rows = (await db.execute(sql`
    select ${bySpeciality ? sql`m.speciality` : sql`m.program || '|' || m.quota`} as key, r.round_no,
           (count(*) filter (where m.consent = 'Accepted'))::int as accepted,
           (count(*) filter (where m.consent <> 'Accepted'))::int as released
    from merit_rounds r join merit_allocations m on m.round_id = r.id
    where r.induction_id = ${ind} ${spec === undefined ? sql`` : sql`and m.speciality_id = ${spec}`}
    group by 1, r.round_no order by 1, r.round_no`)) as unknown as { key: string; round_no: number; accepted: number; released: number }[];
  const panels = new Map<string, FlowPanel>();
  for (const r of rows) {
    const p = panels.get(r.key) ?? { key: r.key, label: bySpeciality ? r.key : r.key.replace("|", " · "), rounds: [], released: 0 };
    p.rounds.push({ roundNo: r.round_no, accepted: r.accepted, released: r.released });
    p.released += r.released;
    panels.set(r.key, p);
  }
  const size = (p: FlowPanel) => p.rounds[0] ? p.rounds[0].accepted + p.rounds[0].released : 0;
  return [...panels.values()].sort((a, b) => size(b) - size(a)).slice(0, input.limit ?? 6);
}

/**
 * For the score finder: seats each speciality·hospital released before the final
 * round of an induction (programme·quota), keyed "speciality|hospital".
 */
export async function releasedBeforeFinal(db: Database, session: Session | null, input: { induction: number; track: string }) {
  assertCan(session, "portal");
  const ind = inductionSchema.parse(input.induction);
  const tr = trackSchema.parse(input.track);
  const rows = (await db.execute(sql`
    select m.speciality, m.hospital, (count(*) filter (where m.consent <> 'Accepted'))::int as released
    from merit_rounds r join merit_allocations m on m.round_id = r.id
    where r.induction_id = ${ind} ${trackWhere(tr)}
      and r.round_no < (select max(round_no) from merit_rounds where induction_id = ${ind})
    group by m.speciality, m.hospital`)) as unknown as { speciality: string; hospital: string; released: number }[];
  return new Map(rows.map((r) => [`${r.speciality}|${r.hospital}`, r.released]));
}
