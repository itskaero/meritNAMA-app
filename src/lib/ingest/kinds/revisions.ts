import { eq } from "drizzle-orm";
import { proposeCorrections } from "@/lib/data/changes";
import { simCandidates, simDatasets } from "@/lib/db/schema";
import { parseRevisions, revisionsFileSchema } from "@/lib/domain/induction-files";
import { UserFacingError } from "@/lib/errors";
import { PARSED_MAX_BYTES, plainIssues, type FileKind } from "../kind";

/**
 * PHF's amendment revisions (induction<n>_revisions.json): changed programme marks and
 * score parts per applicant. They become "Amendment" corrections on top of the gazette
 * (the original is kept), staged for a look like every batch of corrections. Needs the
 * induction's estimate dataset, since corrections apply to it.
 */
export const revisionsKind: FileKind = {
  kind: "revisions",
  label: "Amendment revisions",
  order: 7,
  official: true,
  stage: () => "amendment",
  fromPath: (p) => (/^(?:induction\d{1,3}_)?revisions\.json$/i.test(p.name) ? { kind: "revisions", induction: p.induction, round: null } : null),
  missing: (c) => (c.induction == null ? "The induction is not in the name: use induction<n>_revisions.json or put it in inductions/<n>/." : null),
  maxBytes: PARSED_MAX_BYTES,
  async check({ db, cls, json }) {
    const r = revisionsFileSchema.safeParse(await json());
    if (!r.success) return { status: "problem", summary: null, message: plainIssues(r).join("; ") };
    const changes = parseRevisions(r.data);
    const people = new Set(changes.map((c) => c.applicantId)).size;
    const [ds] = await db.select({ id: simDatasets.inductionId }).from(simDatasets).where(eq(simDatasets.inductionId, cls.induction!)).limit(1);
    return {
      status: "new",
      summary: `Induction ${cls.induction} · ${changes.length.toLocaleString("en-US")} amended values for ${people.toLocaleString("en-US")} candidates`,
      message: ds ? null : `Build induction ${cls.induction}'s estimate dataset first; the amendments are applied on top of it.`,
    };
  },
  async apply({ db, session, cls, json, reason }) {
    const ind = cls.induction!;
    const [ds] = await db.select({ summary: simDatasets.summary }).from(simDatasets).where(eq(simDatasets.inductionId, ind)).limit(1);
    if (!ds) throw new UserFacingError(`Build induction ${ind}'s estimate dataset first; the amendments are applied on top of it.`);
    const known = new Set(Object.keys((ds.summary as { parameters?: Record<string, number> }).parameters ?? {}));
    const inData = new Set((await db.select({ id: simCandidates.applicantId }).from(simCandidates).where(eq(simCandidates.inductionId, ind))).map((r) => r.id));
    const all = parseRevisions(await json());
    // Only values the dataset knows: a part the formula does not use, or someone not in the data, is left out (and counted).
    const usable = all.filter((c) => inData.has(c.applicantId) && (c.field === "program_marks" || known.has(c.program)));
    const skipped = all.length - usable.length;
    if (!usable.length) return { result: { applied: true, message: `Nothing to apply: none of the ${all.length} amended values matches induction ${ind}'s data.` }, status: "live" };
    const result = await proposeCorrections(db, session, {
      induction: ind,
      source: "file",
      reason: `${reason}${skipped ? ` (${skipped} values not in the data left out)` : ""}`,
      corrections: usable.map((c) => ({ applicantId: c.applicantId, field: c.field, program: c.program, value: c.value, kind: "amendment" })),
    });
    return { result, status: "live" };
  },
};
