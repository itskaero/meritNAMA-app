import { and, eq } from "drizzle-orm";
import { proposeMeritRound } from "@/lib/data/changes";
import { meritRounds } from "@/lib/db/schema";
import { meritRoundFileSchema, roundNoFromFilename } from "@/lib/domain/merit-round";
import { PARSED_MAX_BYTES, plainIssues, type FileKind } from "../kind";

const NAME = /^(?:(?:induction|i)\d{1,3}[_-])?(?:merit[_-])?round[_ -]?\d{1,2}\.json$/i;

/** An official merit round (round_<n>.json in merit/, induction<n>_merit_round<n>.json, i20_round_6.json). */
export const meritKind: FileKind = {
  kind: "merit",
  label: "Merit round",
  order: 2,
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
    const r = meritRoundFileSchema.safeParse(await json());
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
    return { result: await proposeMeritRound(db, session, { roundNo: cls.round!, file: await json(), reason }), status: "live" };
  },
};
