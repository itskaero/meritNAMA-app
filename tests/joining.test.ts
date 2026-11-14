import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseJoining } from "@/lib/domain/induction-files";
import { idKey, joinStates, nameKey, wasteBy, wastedSeats, type PlacedRow } from "@/lib/domain/joining";

const placed = (applicantId: string, speciality: string, specialityId: number | null, program = "FCPS", quota = "Punjab"): PlacedRow =>
  ({ applicantId, program, quota, speciality, specialityId, hospital: "Mayo", hospitalId: 1 });

describe("joining and wasted seats", () => {
  const rows = [placed("1", "Surgery", 10), placed("2", "Surgery", 10), placed("3", "Medicine", 11), placed("4", "Medicine", 11, "MS")];
  const states = joinStates(rows, [
    { applicantId: "1", program: "fcps", status: "joined" },
    { applicantId: "2", program: "FCPS", status: "pending" },
    { applicantId: "4", program: "FCPS", status: "joined" }, // joined FCPS, but was placed in MS
  ]);

  it("counts anyone on the last list who is not in the file as not joined", () => {
    expect([...states.values()]).toEqual(["joined", "pending", "not_joined", "not_joined"]);
  });

  it("wasted = did not join + never filled; pending is not wasted", () => {
    expect(wastedSeats(6, rows, states)).toEqual({ seats: 6, placed: 4, joined: 1, pending: 1, notJoined: 2, unfilled: 2, wasted: 4, pct: 4 / 6 });
    expect(wastedSeats(null, rows, states).unfilled).toBe(0);
  });

  it("breaks down by speciality, counting groups nobody was placed in", () => {
    const by = wasteBy(
      [{ key: idKey(10, "Surgery"), name: "Surgery", id: 10, seats: 3 }, { key: idKey(11, "Medicine"), name: "Medicine", id: 11, seats: 2 }, { key: idKey(12, "Eye"), name: "Eye", id: 12, seats: 1 }],
      rows, states, (p) => ({ key: idKey(p.specialityId, p.speciality), name: p.speciality, id: p.specialityId }),
    );
    expect(by.map((r) => [r.name, r.wasted])).toEqual([["Medicine", 2], ["Surgery", 1], ["Eye", 1]]);
    expect(nameKey(" Punjab ")).toBe("name:punjab");
  });

  const data = path.resolve(__dirname, "../../meritnama-rewrite/meritnama/data");
  it.skipIf(!existsSync(path.join(data, "induction21_joining_status.json")))("matches the real induction 21 files", () => {
    const read = (f: string) => JSON.parse(readFileSync(path.join(data, f), "utf8")) as unknown;
    const file = parseJoining(read("induction21_joining_status.json"));
    const m = read("induction21_merit_round8.json") as { Table?: Record<string, unknown>[] } | Record<string, unknown>[];
    const list = (Array.isArray(m) ? m : m.Table!).map((r) => placed(String(r.applicantId), String(r.specialityName), null, String(r.typeName), String(r.quotaName)));
    const seats = (read("induction21_seats.json") as { seats: number }[]).reduce((n, r) => n + r.seats, 0);
    const w = wastedSeats(seats, list, joinStates(list, file));
    expect({ seats: w.seats, placed: w.placed, notJoined: w.notJoined, unfilled: w.unfilled, wasted: w.wasted }).toEqual({ seats: 1449, placed: 1219, notJoined: 135, unfilled: 230, wasted: 365 });
  });
});
