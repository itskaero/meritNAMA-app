import { eq } from "drizzle-orm";
import { joiningStatus } from "@/lib/db/schema";
import { joiningFileSchema, parseJoining } from "@/lib/domain/induction-files";
import { writeAudit } from "@/lib/data/shared";
import { PARSED_MAX_BYTES, plainIssues, type FileKind } from "../kind";

/**
 * Who joined their seat (induction<n>_joining_status.json). Official; replaced whole by a
 * newer snapshot. Only seat and status are stored: the file also carries names, emails,
 * phone numbers, CNICs and job details, which are never read.
 */
export const joiningKind: FileKind = {
  kind: "joining",
  label: "Joining status",
  order: 6,
  official: true,
  stage: () => "joining",
  fromPath: (p) => (/^(?:induction\d{1,3}_)?joining(?:_status)?\.json$/i.test(p.name) ? { kind: "joining", induction: p.induction, round: null } : null),
  missing: (c) => (c.induction == null ? "The induction is not in the name: use induction<n>_joining_status.json or put it in inductions/<n>/." : null),
  maxBytes: PARSED_MAX_BYTES,
  async check({ cls, json }) {
    const r = joiningFileSchema.safeParse(await json());
    if (!r.success) return { status: "problem", summary: null, message: plainIssues(r).join("; ") };
    const rows = parseJoining(r.data);
    const joined = rows.filter((x) => x.status === "joined").length;
    return { status: "new", summary: `Induction ${cls.induction} · ${rows.length.toLocaleString("en-US")} seats: ${joined.toLocaleString("en-US")} joined · personal details dropped`, message: null };
  },
  async apply({ db, session, cls, json, reason }) {
    const rows = parseJoining(await json());
    const ind = cls.induction!;
    await db.transaction(async (tx) => {
      await tx.delete(joiningStatus).where(eq(joiningStatus.inductionId, ind));
      for (let i = 0; i < rows.length; i += 2000) await tx.insert(joiningStatus).values(rows.slice(i, i + 2000).map((x) => ({ inductionId: ind, ...x })));
      await writeAudit(tx, session.email, { action: "joining.import", entityType: "induction", entityId: String(ind), after: { rows: rows.length }, reason });
    });
    return { result: { applied: true, message: `Joining status for induction ${ind}: ${rows.length.toLocaleString("en-US")} seats.` }, status: "live" };
  },
};
