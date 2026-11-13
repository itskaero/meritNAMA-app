import { eq } from "drizzle-orm";
import { inductionSchedule } from "@/lib/db/schema";
import { parseSchedule, scheduleFileSchema } from "@/lib/domain/induction-files";
import { writeAudit } from "@/lib/data/shared";
import { PARSED_MAX_BYTES, plainIssues, type FileKind } from "../kind";

/** PHF's dated steps for an induction (induction<n>_schedule.json). Official; replaced whole by a newer file. */
export const scheduleKind: FileKind = {
  kind: "schedule",
  label: "PHF schedule",
  order: 1,
  official: true,
  fromPath: (p) => (/^(?:induction\d{1,3}_)?schedule\.json$/i.test(p.name) ? { kind: "schedule", induction: p.induction, round: null } : null),
  missing: (c) => (c.induction == null ? "The induction is not in the name: use induction<n>_schedule.json or put it in inductions/<n>/." : null),
  maxBytes: PARSED_MAX_BYTES,
  async check({ db, cls, json }) {
    const r = scheduleFileSchema.safeParse(await json());
    if (!r.success) return { status: "problem", summary: null, message: plainIssues(r).join("; ") };
    const s = parseSchedule(r.data);
    if (s.induction != null && s.induction !== cls.induction) return { status: "problem", summary: null, message: `The name says induction ${cls.induction} but the file is for induction ${s.induction}.` };
    const [had] = await db.select({ n: inductionSchedule.stepId }).from(inductionSchedule).where(eq(inductionSchedule.inductionId, cls.induction!)).limit(1);
    const dated = s.steps.filter((x) => x.startsAt || x.endsAt);
    const last = dated.map((x) => x.endsAt ?? x.startsAt!).sort((a, b) => b.getTime() - a.getTime())[0];
    return { status: "new", summary: `Induction ${cls.induction} · ${s.steps.length} steps${last ? `, last ends ${last.toISOString().slice(0, 10)}` : ""}${had ? " · replaces the loaded schedule" : ""}`, message: null };
  },
  async apply({ db, session, cls, json, reason }) {
    const s = parseSchedule(await json());
    const ind = cls.induction!;
    await db.transaction(async (tx) => {
      await tx.delete(inductionSchedule).where(eq(inductionSchedule.inductionId, ind));
      await tx.insert(inductionSchedule).values(s.steps.map((x) => ({ inductionId: ind, ...x })));
      await writeAudit(tx, session.email, { action: "schedule.import", entityType: "induction", entityId: String(ind), after: { steps: s.steps.length }, reason });
    });
    return { result: { applied: true, message: `Schedule for induction ${ind}: ${s.steps.length} steps.` }, status: "live" };
  },
};
