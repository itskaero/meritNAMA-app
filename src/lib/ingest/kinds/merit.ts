import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { proposeMeritRound } from "@/lib/data/changes";
import type { Database } from "@/lib/db/client";
import { appSettings, hospitals, inductions, inductionSeats, institutes, meritRounds, programs, quotas, specialities } from "@/lib/db/schema";
import { meritRoundFileSchema, nameKey, roundNoFromFilename } from "@/lib/domain/merit-round";
import { PARSED_MAX_BYTES, plainIssues, type FileKind } from "../kind";

const NAME = /^(?:(?:induction|i)\d{1,3}[_-])?(?:merit[_-])?round[_ -]?\d{1,2}\.json$/i;

/*
 * Three shapes of round file:
 *   - PHF's export {Table: [cycle], Table5: [allocations]} — the usual one;
 *   - the same with Table5 empty: the round is not out yet, but the file names the cycle
 *     (code, name, dates), so it is kept and creates the induction;
 *   - a flat list of allocations (induction<n>_merit_round<r>.json from the scraper): no
 *     cycle, institute or seat counts, so those come from the cycle above and the seat matrix.
 */

const cycleSchema = z.looseObject({ inductionId: z.number().int(), name: z.string().min(1), displayName: z.string().min(1), startDate: z.string().nullish(), endDate: z.string().nullish() });
const emptyRoundSchema = z.looseObject({ Table: z.array(cycleSchema).min(1), Table5: z.array(z.unknown()).length(0) });
const flatRowSchema = z.looseObject({
  rowNo: z.number().int().min(1),
  applicantId: z.union([z.string().min(1), z.number()]).transform(String),
  typeName: z.string().min(1),
  quotaName: z.string().min(1),
  specialityName: z.string().min(1),
  hospitalName: z.string().min(1),
  marksTotal: z.number().min(0),
  preferenceNo: z.number().int().min(0).nullish(),
  nameFull: z.string().nullish(),
  pmdcNo: z.union([z.string(), z.number()]).nullish(),
});
const flatRoundSchema = z.array(flatRowSchema).min(1, "the round has no allocations");

type Cycle = z.infer<typeof cycleSchema>;
const cycleKey = (induction: number) => `induction_cycle:${induction}`;

/** The cycle of an induction: from an earlier round, or a stored empty PHF round file. */
async function knownCycle(db: Database, induction: number): Promise<Cycle | null> {
  const [s] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, cycleKey(induction))).limit(1);
  if (s) return s.value as Cycle;
  const [r] = await db.select({ code: meritRounds.cycleCode, name: meritRounds.cycleName, startsOn: meritRounds.startsOn, endsOn: meritRounds.endsOn }).from(meritRounds)
    .where(eq(meritRounds.inductionId, induction)).orderBy(desc(meritRounds.roundNo)).limit(1);
  return r ? { inductionId: induction, name: r.code, displayName: r.name, startDate: r.startsOn, endDate: r.endsOn } : null;
}

/** Institute and seats of each seat line, by programme | quota | speciality | hospital names. */
async function seatLines(db: Database, induction: number) {
  const rows = await db.select({ program: programs.name, quota: quotas.name, speciality: specialities.name, hospital: hospitals.name, institute: institutes.name, seats: inductionSeats.seats })
    .from(inductionSeats)
    .innerJoin(programs, eq(programs.id, inductionSeats.programId)).innerJoin(quotas, eq(quotas.id, inductionSeats.quotaId))
    .innerJoin(specialities, eq(specialities.id, inductionSeats.specialityId)).innerJoin(hospitals, eq(hospitals.id, inductionSeats.hospitalId))
    .innerJoin(institutes, eq(institutes.id, inductionSeats.instituteId))
    .where(eq(inductionSeats.inductionId, induction));
  const map = new Map<string, { institute: string; seats: number }>();
  for (const r of rows) {
    const k = [r.program, r.quota, r.speciality, r.hospital].map(nameKey).join("|");
    const cur = map.get(k);
    map.set(k, { institute: cur?.institute || r.institute, seats: (cur?.seats ?? 0) + r.seats });
  }
  return map;
}

/** A flat list → PHF's shape, so the one importer handles both. Consent is not in a flat list. */
export function flatToPhf(rows: z.infer<typeof flatRoundSchema>, cycle: Cycle, lines: Map<string, { institute: string; seats: number }>) {
  return {
    Table: [cycle],
    Table5: rows.map((r) => {
      const line = lines.get([r.typeName, r.quotaName, r.specialityName, r.hospitalName].map(nameKey).join("|"));
      return {
        rowNo: r.rowNo, type: r.typeName, quota: r.quotaName, specialityJobId: 0, speciality: r.specialityName, hospital: r.hospitalName,
        institute: line?.institute ?? "", seats: line?.seats ?? 0, marks: r.marksTotal, applicantId: r.applicantId,
        preferenceNo: r.preferenceNo ?? 0, consent: "", name: r.nameFull ?? null, pmdcNo: r.pmdcNo == null ? null : String(r.pmdcNo),
      };
    }),
  };
}

/** An official merit round (round_<n>.json in merit/, induction<n>_merit_round<n>.json, i20_round_6.json). */
export const meritKind: FileKind = {
  kind: "merit",
  label: "Merit round",
  order: 3,
  official: true,
  stage: () => "rounds",
  fromPath(p) {
    const round = roundNoFromFilename(p.name);
    return round != null && NAME.test(p.name) ? { kind: "merit", induction: p.induction, round } : null;
  },
  fromContents: {
    rank: 1,
    match(d) {
      if (!meritRoundFileSchema.safeParse(d).success) return null;
      return { kind: "merit", induction: (d as { Table: { inductionId: number }[] }).Table[0]!.inductionId, round: null };
    },
  },
  missing: (c) => (c.round == null ? "The round number is not in the file name (use round_<n>.json)." : null),
  maxBytes: PARSED_MAX_BYTES,
  async check({ db, cls, json }) {
    const data = await json();
    const empty = emptyRoundSchema.safeParse(data);
    if (empty.success) {
      const c = empty.data.Table[0]!;
      return { cls: { ...cls, induction: c.inductionId }, status: "new", summary: `Induction ${c.inductionId} · ${c.displayName} (${c.name}) · round ${cls.round} not out yet`, message: "Names the cycle; the round itself is empty." };
    }
    if (Array.isArray(data)) {
      const flat = flatRoundSchema.safeParse(data);
      if (!flat.success) return { status: "problem", summary: null, message: plainIssues(flat).join("; ") };
      if (cls.induction == null) return { status: "problem", summary: null, message: "The induction is not in the name: use induction<n>_merit_round<r>.json." };
      if (!(await knownCycle(db, cls.induction))) return { status: "problem", summary: null, message: `Induction ${cls.induction}'s cycle is not known yet. Add PHF's round file (inductions/${cls.induction}/merit/round_1.json, even empty) first.` };
      const [ex] = await db.select({ id: meritRounds.id }).from(meritRounds).where(and(eq(meritRounds.inductionId, cls.induction), eq(meritRounds.roundNo, cls.round!))).limit(1);
      return {
        status: ex ? "replaces" : "new",
        summary: `Induction ${cls.induction}, round ${cls.round} · ${flat.data.length.toLocaleString("en-US")} allocations (list without consent)`,
        message: ex ? "Replaces the round that is live now. Applying shows exactly what changes." : null,
      };
    }
    const r = meritRoundFileSchema.safeParse(data);
    if (!r.success) return { status: "problem", summary: null, message: plainIssues(r).join("; ") };
    const ind = r.data.Table[0]!.inductionId;
    if (cls.induction != null && cls.induction !== ind) return { status: "problem", summary: null, message: `The name says induction ${cls.induction} but the file is for induction ${ind}.` };
    const [ex] = await db.select({ id: meritRounds.id }).from(meritRounds).where(and(eq(meritRounds.inductionId, ind), eq(meritRounds.roundNo, cls.round!))).limit(1);
    return {
      cls: { ...cls, induction: ind },
      status: ex ? "replaces" : "new",
      summary: `Induction ${ind}, round ${cls.round} · ${r.data.Table5.length.toLocaleString("en-US")} allocations`,
      message: ex ? "Replaces the round that is live now. Applying shows exactly what changes." : null,
    };
  },
  async apply({ db, session, cls, json, reason }) {
    const data = await json();
    const empty = emptyRoundSchema.safeParse(data);
    if (empty.success) {
      const c = empty.data.Table[0]!;
      const value = { inductionId: c.inductionId, name: c.name, displayName: c.displayName, startDate: c.startDate ?? null, endDate: c.endDate ?? null };
      await db.insert(appSettings).values({ key: cycleKey(c.inductionId), value, updatedBy: session!.email }).onConflictDoUpdate({ target: appSettings.key, set: { value, updatedBy: session!.email, updatedAt: new Date() } });
      const year = Number((c.startDate ?? "").slice(0, 4)) || new Date().getFullYear();
      const label = `Induction ${c.inductionId} · ${c.displayName}`;
      // A seat file may have made the induction first, with a bare label: give it the cycle's name.
      await db.insert(inductions).values({ id: c.inductionId, label, calendarYear: year, status: "active" })
        .onConflictDoUpdate({ target: inductions.id, set: { label }, setWhere: eq(inductions.label, `Induction ${c.inductionId}`) });
      return { result: { applied: true, message: `induction ${c.inductionId}: cycle ${c.displayName} noted` }, status: "live" };
    }
    if (Array.isArray(data)) {
      const cycle = await knownCycle(db, cls.induction!);
      if (!cycle) throw new Error(`Induction ${cls.induction}'s cycle is not known yet.`);
      const file = flatToPhf(flatRoundSchema.parse(data), { ...cycle, inductionId: cls.induction! }, await seatLines(db, cls.induction!));
      return { result: await proposeMeritRound(db, session, { roundNo: cls.round!, file, reason }), status: "live" };
    }
    return { result: await proposeMeritRound(db, session, { roundNo: cls.round!, file: data, reason }), status: "live" };
  },
};
