/**
 * Joining and wasted seats, worked out from the last round's list and PHF's joining file.
 *
 * PHF's joining file lists only people who joined or are pending. Anyone on the last
 * round's list who is not in the file (or is marked not joined) did not join. A seat is
 * wasted when its holder did not join, or when no list ever filled it:
 *   wasted = not joined + never filled (seats − placed).  Pending seats are not counted.
 * Pure: callers pass in the rows.
 */

export type JoinState = "joined" | "pending" | "not_joined";
export const JOIN_LABELS: Record<JoinState, string> = { joined: "Joined", pending: "Pending", not_joined: "Not joined" };

export type PlacedRow = { applicantId: string; program: string; quota: string; speciality: string; specialityId: number | null; hospital: string; hospitalId: number | null };
export type JoinFileRow = { applicantId: string; program: string; status: string };

export const joinKey = (applicantId: string, program: string) => `${applicantId}|${program.trim().toUpperCase()}`;

/** Every placed row's state. */
export function joinStates(placed: PlacedRow[], file: JoinFileRow[]): Map<string, JoinState> {
  const inFile = new Map(file.map((r) => [joinKey(r.applicantId, r.program), r.status]));
  const out = new Map<string, JoinState>();
  for (const p of placed) {
    const k = joinKey(p.applicantId, p.program);
    const s = inFile.get(k);
    out.set(k, s === "joined" ? "joined" : s === "pending" ? "pending" : "not_joined");
  }
  return out;
}

export type Waste = { seats: number; placed: number; joined: number; pending: number; notJoined: number; unfilled: number; wasted: number; pct: number };

function tally(seats: number, rows: PlacedRow[], states: Map<string, JoinState>): Waste {
  let joined = 0, pending = 0, notJoined = 0;
  for (const p of rows) {
    const s = states.get(joinKey(p.applicantId, p.program));
    if (s === "joined") joined++;
    else if (s === "pending") pending++;
    else notJoined++;
  }
  const unfilled = Math.max(0, seats - rows.length);
  const wasted = notJoined + unfilled;
  return { seats, placed: rows.length, joined, pending, notJoined, unfilled, wasted, pct: seats ? wasted / seats : 0 };
}

/** The whole induction. `seats` from the seat matrix (falls back to the number placed). */
export function wastedSeats(seats: number | null, placed: PlacedRow[], states: Map<string, JoinState>): Waste {
  return tally(seats ?? placed.length, placed, states);
}

export type SeatGroup = { key: string; name: string; id: number | null; seats: number };
export type WasteRow = Waste & { key: string; name: string; id: number | null };

/**
 * Per speciality, hospital or quota. `seatGroups` from the seat matrix; `keyOf` gives a placed
 * row's group key (the same keys). Groups with seats but nobody placed count as all unfilled.
 */
export function wasteBy(seatGroups: SeatGroup[], placed: PlacedRow[], states: Map<string, JoinState>, keyOf: (p: PlacedRow) => { key: string; name: string; id: number | null }): WasteRow[] {
  const groups = new Map<string, { name: string; id: number | null; seats: number; rows: PlacedRow[] }>();
  for (const g of seatGroups) {
    const cur = groups.get(g.key);
    if (cur) cur.seats += g.seats;
    else groups.set(g.key, { name: g.name, id: g.id, seats: g.seats, rows: [] });
  }
  for (const p of placed) {
    const k = keyOf(p);
    const cur = groups.get(k.key) ?? groups.set(k.key, { name: k.name, id: k.id, seats: 0, rows: [] }).get(k.key)!;
    cur.rows.push(p);
  }
  return [...groups.entries()]
    .map(([key, g]) => ({ key, name: g.name, id: g.id, ...tally(Math.max(g.seats, g.rows.length), g.rows, states) }))
    .sort((a, b) => b.wasted - a.wasted || b.seats - a.seats || a.name.localeCompare(b.name));
}

export const idKey = (id: number | null, name: string) => (id != null ? `id:${id}` : `name:${name.trim().toLowerCase()}`);
export const nameKey = (name: string) => `name:${name.trim().toLowerCase()}`;
