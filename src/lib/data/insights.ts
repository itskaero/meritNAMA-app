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
