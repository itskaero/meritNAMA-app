import { count, eq, min } from "drizzle-orm";
import { proposeSeatFile } from "@/lib/data/changes";
import type { Database } from "@/lib/db/client";
import { appSettings, inductionSchedule, inductions, inductionSeats } from "@/lib/db/schema";
import { seatFileSchema } from "@/lib/domain/reference-data";
import { PARSED_MAX_BYTES, plainIssues, type FileKind } from "../kind";

/** The calendar year of an induction that has no rows yet: from PHF's schedule, else its recorded cycle. */
async function yearFor(db: Database, induction: number): Promise<number | undefined> {
  const [i] = await db.select({ id: inductions.id }).from(inductions).where(eq(inductions.id, induction)).limit(1);
  if (i) return undefined;
  const [s] = await db.select({ start: min(inductionSchedule.startsAt) }).from(inductionSchedule).where(eq(inductionSchedule.inductionId, induction));
  if (s?.start) return s.start.getUTCFullYear();
  const [c] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, `induction_cycle:${induction}`)).limit(1);
  const y = Number(String((c?.value as { startDate?: string } | undefined)?.startDate ?? "").slice(0, 4));
  return y || undefined;
}

/** An induction's seat matrix (induction<n>_seats.json). A replacement is staged for review. */
export const seatsKind: FileKind = {
  kind: "seats",
  label: "Seat matrix",
  order: 2,
  official: true,
  fromPath: (p) => (/^(?:induction\d{1,3}_)?seats\.json$/i.test(p.name) ? { kind: "seats", induction: p.induction, round: null } : null),
  fromContents: { rank: 2, match: (d) => (Array.isArray(d) && seatFileSchema.safeParse(d).success ? { kind: "seats", induction: null, round: null } : null) },
  missing: (c) => (c.induction == null ? "The induction is not in the name: use induction<n>_seats.json or put it in inductions/<n>/." : null),
  maxBytes: PARSED_MAX_BYTES,
  async check({ db, cls, json }) {
    const r = seatFileSchema.safeParse(await json());
    if (!r.success) return { status: "problem", summary: null, message: plainIssues(r).join("; ") };
    const [n] = await db.select({ n: count() }).from(inductionSeats).where(eq(inductionSeats.inductionId, cls.induction!));
    const has = (n?.n ?? 0) > 0;
    return { status: has ? "replaces" : "new", summary: `Induction ${cls.induction} · ${r.data.length} seat lines`, message: has ? "Replaces the seat matrix that is live now." : null };
  },
  async apply({ db, session, cls, json, reason }) {
    const calendarYear = await yearFor(db, cls.induction!);
    return { result: await proposeSeatFile(db, session, { induction: cls.induction!, calendarYear, file: await json(), reason }), status: "live" };
  },
};
