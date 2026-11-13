import { count, eq } from "drizzle-orm";
import { proposeSeatFile } from "@/lib/data/changes";
import { inductionSeats } from "@/lib/db/schema";
import { seatFileSchema } from "@/lib/domain/reference-data";
import { PARSED_MAX_BYTES, plainIssues, type FileKind } from "../kind";

/** An induction's seat matrix (induction<n>_seats.json). A replacement is staged for review. */
export const seatsKind: FileKind = {
  kind: "seats",
  label: "Seat matrix",
  order: 3,
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
    return { result: await proposeSeatFile(db, session, { induction: cls.induction!, file: await json(), reason }), status: "live" };
  },
};
