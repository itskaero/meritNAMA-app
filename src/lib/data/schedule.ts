import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { assertCan, type Session } from "@/lib/auth/roles";
import type { Database } from "@/lib/db/client";
import { inductionSchedule } from "@/lib/db/schema";

/** PHF's dated steps (induction<n>_schedule.json) for the newest induction that has them. Public data. */
export async function latestSchedule(db: Database, session: Session | null) {
  assertCan(session, "portal");
  const [ind] = await db.select({ id: inductionSchedule.inductionId }).from(inductionSchedule).orderBy(desc(inductionSchedule.inductionId)).limit(1);
  if (!ind) return null;
  const rows = await db.select({ stepId: inductionSchedule.stepId, title: inductionSchedule.title, detail: inductionSchedule.detail, sortOrder: inductionSchedule.sortOrder, startsAt: inductionSchedule.startsAt, endsAt: inductionSchedule.endsAt })
    .from(inductionSchedule).where(eq(inductionSchedule.inductionId, ind.id)).orderBy(asc(inductionSchedule.sortOrder));
  return { induction: ind.id, rows };
}
