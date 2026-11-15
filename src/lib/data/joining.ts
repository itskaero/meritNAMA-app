import "server-only";
import { and, desc, eq, max, sql } from "drizzle-orm";
import { assertCan, type Session } from "@/lib/auth/roles";
import type { Database } from "@/lib/db/client";
import { hospitals, inductionSeats, joiningStatus, meritAllocations, meritRounds, quotas, specialities } from "@/lib/db/schema";
import { idKey, joinKey, joinStates, nameKey, wasteBy, wastedSeats, type JoinState, type PlacedRow, type Waste, type WasteRow } from "@/lib/domain/joining";

/**
 * Joining status (PHF's joining file) against the last round's list, and wasted seats.
 * Members see it on the last round, Candidates, hospital and speciality pages, My chances
 * and the Overview. Seat and status only: the file's personal fields were never stored.
 */

type Loaded = { induction: number; roundNo: number; importedAt: Date; placed: PlacedRow[]; states: Map<string, JoinState> };

/** Inductions with a joining file, newest first. */
async function joiningInductions(db: Database): Promise<{ id: number; importedAt: Date }[]> {
  return db.select({ id: joiningStatus.inductionId, importedAt: max(joiningStatus.importedAt) }).from(joiningStatus)
    .groupBy(joiningStatus.inductionId).orderBy(desc(joiningStatus.inductionId))
    .then((r) => r.map((x) => ({ id: x.id, importedAt: x.importedAt ?? new Date(0) })));
}

async function load(db: Database, induction: number, importedAt: Date): Promise<Loaded | null> {
  const [round] = await db.select({ id: meritRounds.id, roundNo: meritRounds.roundNo }).from(meritRounds)
    .where(eq(meritRounds.inductionId, induction)).orderBy(desc(meritRounds.roundNo)).limit(1);
  if (!round) return null;
  const [placed, file] = await Promise.all([
    db.select({ applicantId: meritAllocations.applicantId, program: meritAllocations.program, quota: meritAllocations.quota, speciality: meritAllocations.speciality, specialityId: meritAllocations.specialityId, hospital: meritAllocations.hospital, hospitalId: meritAllocations.hospitalId })
      .from(meritAllocations).where(eq(meritAllocations.roundId, round.id)),
    db.select({ applicantId: joiningStatus.applicantId, program: joiningStatus.program, status: joiningStatus.status }).from(joiningStatus).where(eq(joiningStatus.inductionId, induction)),
  ]);
  return { induction, roundNo: round.roundNo, importedAt, placed, states: joinStates(placed, file) };
}

async function seatsBy(db: Database, induction: number, by: "speciality" | "hospital" | "quota") {
  const t = by === "speciality" ? specialities : by === "hospital" ? hospitals : quotas;
  const col = by === "speciality" ? inductionSeats.specialityId : by === "hospital" ? inductionSeats.hospitalId : inductionSeats.quotaId;
  const rows = await db.select({ id: col, name: t.name, seats: sql<number>`sum(${inductionSeats.seats})`.mapWith(Number) })
    .from(inductionSeats).innerJoin(t, eq(t.id, col)).where(eq(inductionSeats.inductionId, induction)).groupBy(col, t.name);
  return rows.map((r) => (by === "quota" ? { key: nameKey(r.name), name: r.name, id: null, seats: r.seats } : { key: idKey(r.id, r.name), name: r.name, id: r.id, seats: r.seats }));
}

async function totalSeats(db: Database, induction: number): Promise<number | null> {
  const [r] = await db.select({ n: sql<number | null>`sum(${inductionSeats.seats})`.mapWith((v) => (v == null ? null : Number(v))) }).from(inductionSeats).where(eq(inductionSeats.inductionId, induction));
  return r?.n ?? null;
}

export type JoiningOverview = {
  induction: number; roundNo: number; importedAt: Date; total: Waste;
  bySpeciality: WasteRow[]; byHospital: WasteRow[]; byQuota: WasteRow[];
  /** Placed but did not join, per programme, most first. */
  notJoinedByProgram: { name: string; n: number }[];
};

/** Everything the joining page shows for one induction, or null without a joining file. */
export async function joiningOverview(db: Database, session: Session | null, induction: number): Promise<JoiningOverview | null> {
  assertCan(session, "portal");
  const ind = (await joiningInductions(db)).find((x) => x.id === induction);
  if (!ind) return null;
  const l = await load(db, induction, ind.importedAt);
  if (!l) return null;
  const [seats, spec, hosp, quota] = await Promise.all([totalSeats(db, induction), seatsBy(db, induction, "speciality"), seatsBy(db, induction, "hospital"), seatsBy(db, induction, "quota")]);
  return {
    induction, roundNo: l.roundNo, importedAt: l.importedAt, total: wastedSeats(seats, l.placed, l.states),
    bySpeciality: wasteBy(spec, l.placed, l.states, (p) => ({ key: idKey(p.specialityId, p.speciality), name: p.speciality, id: p.specialityId })),
    byHospital: wasteBy(hosp, l.placed, l.states, (p) => ({ key: idKey(p.hospitalId, p.hospital), name: p.hospital, id: p.hospitalId })),
    byQuota: wasteBy(quota, l.placed, l.states, (p) => ({ key: nameKey(p.quota), name: p.quota, id: null })),
    notJoinedByProgram: notJoinedBy(l),
  };
}

function notJoinedBy(l: Loaded): { name: string; n: number }[] {
  const m = new Map<string, number>();
  for (const p of l.placed) if ((l.states.get(joinKey(p.applicantId, p.program)) ?? "not_joined") === "not_joined") m.set(p.program, (m.get(p.program) ?? 0) + 1);
  return [...m.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n);
}

export type JoiningListRow = { rowNo: number; applicantId: string; name: string | null; pmdcNo: string | null; program: string; speciality: string; hospital: string; marks: number; state: JoinState };

/**
 * The last round's list with each person's joining state (PHF publishes names and PMDC
 * numbers on merit lists), optionally one state only, merit order.
 */
export async function joiningList(db: Database, session: Session | null, input: { induction: number; state?: JoinState; offset?: number; limit?: number }) {
  assertCan(session, "portal");
  const ind = (await joiningInductions(db)).find((x) => x.id === input.induction);
  if (!ind) return null;
  const [round] = await db.select({ id: meritRounds.id, roundNo: meritRounds.roundNo }).from(meritRounds)
    .where(eq(meritRounds.inductionId, input.induction)).orderBy(desc(meritRounds.roundNo)).limit(1);
  if (!round) return null;
  const [rows, file] = await Promise.all([
    db.select({ rowNo: meritAllocations.rowNo, applicantId: meritAllocations.applicantId, name: meritAllocations.name, pmdcNo: meritAllocations.pmdcNo, program: meritAllocations.program, speciality: meritAllocations.speciality, hospital: meritAllocations.hospital, marks: meritAllocations.marks })
      .from(meritAllocations).where(eq(meritAllocations.roundId, round.id)).orderBy(desc(meritAllocations.marks), meritAllocations.rowNo),
    db.select({ applicantId: joiningStatus.applicantId, program: joiningStatus.program, status: joiningStatus.status }).from(joiningStatus).where(eq(joiningStatus.inductionId, input.induction)),
  ]);
  const states = joinStates(rows, file);
  const all: JoiningListRow[] = rows.map((r) => ({ ...r, state: states.get(joinKey(r.applicantId, r.program)) ?? "not_joined" }));
  const counts = { all: all.length, joined: 0, not_joined: 0, pending: 0 } as Record<"all" | JoinState, number>;
  for (const r of all) counts[r.state]++;
  const shown = input.state ? all.filter((r) => r.state === input.state) : all;
  const offset = Math.max(0, input.offset ?? 0), limit = Math.min(200, Math.max(1, input.limit ?? 50));
  return { roundNo: round.roundNo, counts, total: shown.length, rows: shown.slice(offset, offset + limit) };
}

/** The newest induction with a joining file: its totals (Overview, My chances). */
export async function latestJoining(db: Database, session: Session | null): Promise<{ induction: number; roundNo: number; total: Waste } | null> {
  assertCan(session, "portal");
  const [ind] = await joiningInductions(db);
  if (!ind) return null;
  const l = await load(db, ind.id, ind.importedAt);
  return l ? { induction: l.induction, roundNo: l.roundNo, total: wastedSeats(await totalSeats(db, l.induction), l.placed, l.states) } : null;
}

/** Wasted seats per induction that has a joining file, oldest first, for the trend. */
export async function joiningTrend(db: Database, session: Session | null) {
  assertCan(session, "portal");
  const out: { induction: number; total: Waste }[] = [];
  for (const ind of await joiningInductions(db)) {
    const l = await load(db, ind.id, ind.importedAt);
    if (l) out.push({ induction: ind.id, total: wastedSeats(await totalSeats(db, ind.id), l.placed, l.states) });
  }
  return out.sort((a, b) => a.induction - b.induction);
}

/** Per-row states for a round's candidate list: only for the last round of an induction with a joining file. */
export async function roundJoinStates(db: Database, session: Session | null, induction: number, roundNo: number): Promise<Map<string, JoinState> | null> {
  assertCan(session, "portal");
  const ind = (await joiningInductions(db)).find((x) => x.id === induction);
  if (!ind) return null;
  const l = await load(db, induction, ind.importedAt);
  return l && l.roundNo === roundNo ? l.states : null;
}

/** A hospital's or speciality's wasted seats in the newest induction with a joining file. */
export async function wasteFor(db: Database, session: Session | null, input: { kind: "speciality" | "hospital"; id: number }): Promise<{ induction: number; row: WasteRow } | null> {
  assertCan(session, "portal");
  const [ind] = await joiningInductions(db);
  if (!ind) return null;
  const l = await load(db, ind.id, ind.importedAt);
  if (!l) return null;
  const col = input.kind === "speciality" ? inductionSeats.specialityId : inductionSeats.hospitalId;
  const [s] = await db.select({ n: sql<number>`coalesce(sum(${inductionSeats.seats}), 0)`.mapWith(Number) }).from(inductionSeats)
    .where(and(eq(inductionSeats.inductionId, ind.id), eq(col, input.id)));
  const rows = l.placed.filter((p) => (input.kind === "speciality" ? p.specialityId : p.hospitalId) === input.id);
  if (!rows.length && !s?.n) return null;
  const [row] = wasteBy([{ key: "x", name: "", id: input.id, seats: s?.n ?? 0 }], rows, l.states, () => ({ key: "x", name: "", id: input.id }));
  return row ? { induction: ind.id, row } : null;
}
