import "server-only";
import { and, desc, eq, gt, isNotNull, isNull, lte } from "drizzle-orm";
import { assertCan, type Session } from "@/lib/auth/roles";
import type { Database } from "@/lib/db/client";
import { announcements, inductionSchedule, meritRounds, simulationRuns } from "@/lib/db/schema";
import { deadlineNotice, estimateNotice, noticeInputSchema, pickNotices, roundNotice, type Notice, type NoticeTone } from "@/lib/domain/notices";
import { UserFacingError } from "@/lib/errors";
import { isUuid } from "@/lib/format";
import { writeAudit } from "./shared";

/**
 * The notification bar: team posts plus automatic notices from the PHF schedule, the
 * latest official round and the latest published estimate. Read on every page, so it is
 * a handful of small queries; the bar is quietly empty if the database is down.
 */

/** What the bar shows now, for anyone (signed in or not: "members" posts need a session). */
export async function liveNotices(db: Database, session: Session | null, now = new Date()): Promise<Notice[]> {
  const team = await db.select({ id: announcements.id, text: announcements.text, href: announcements.href, tone: announcements.tone, audience: announcements.audience })
    .from(announcements)
    .where(and(isNull(announcements.removedAt), lte(announcements.startsAt, now), gt(announcements.endsAt, now)))
    .orderBy(desc(announcements.createdAt)).limit(3);
  const teamNotices: Notice[] = team
    .filter((t) => t.audience === "all" || session)
    .map((t) => ({ id: t.id, text: t.text, href: t.href, tone: t.tone as NoticeTone, auto: false }));

  const [ind] = await db.select({ id: inductionSchedule.inductionId }).from(inductionSchedule).orderBy(desc(inductionSchedule.inductionId)).limit(1);
  const steps = ind ? await db.select().from(inductionSchedule).where(eq(inductionSchedule.inductionId, ind.id)) : [];
  const [round] = await db.select({ induction: meritRounds.inductionId, roundNo: meritRounds.roundNo, importedAt: meritRounds.importedAt })
    .from(meritRounds).orderBy(desc(meritRounds.importedAt)).limit(1);
  const [est] = await db.select({ id: simulationRuns.id, kind: simulationRuns.kind, fromRound: simulationRuns.fromRound, publishedAt: simulationRuns.publishedAt, induction: simulationRuns.inductionId })
    .from(simulationRuns).where(isNotNull(simulationRuns.publishedAt)).orderBy(desc(simulationRuns.publishedAt)).limit(1);
  const estRound = est ? (est.kind === "next_round" ? (est.fromRound ?? 0) + 1 : 1) : 0;
  const superseded = est ? (await db.select({ id: meritRounds.id }).from(meritRounds).where(and(eq(meritRounds.inductionId, est.induction), eq(meritRounds.roundNo, estRound))).limit(1)).length > 0 : false;

  return pickNotices(teamNotices, [
    ind ? deadlineNotice(ind.id, steps, now) : null,
    roundNotice(round ? { induction: round.induction, roundNo: round.roundNo, importedAt: round.importedAt } : null, now),
    est ? estimateNotice({ id: est.id, roundNo: estRound, publishedAt: est.publishedAt!, official: superseded }, now) : null,
  ]);
}

/** Team posts, newest first, for Admin → Today. */
export async function listAnnouncements(db: Database, session: Session | null) {
  assertCan(session, "staff");
  return db.select().from(announcements).where(isNull(announcements.removedAt)).orderBy(desc(announcements.createdAt)).limit(30);
}

export async function postAnnouncement(db: Database, session: Session | null, raw: { text: string; href?: string; tone?: string; audience?: string; days: number }) {
  assertCan(session, "data.edit");
  const v = noticeInputSchema.parse(raw);
  const endsAt = new Date(Date.now() + v.days * 86_400_000);
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(announcements).values({ text: v.text, href: v.href, tone: v.tone, audience: v.audience, endsAt, createdBy: session.email }).returning({ id: announcements.id });
    await writeAudit(tx, session.email, { action: "announcement.post", entityType: "announcement", entityId: row!.id, after: { ...v, endsAt }, reason: "Notification bar" });
    return row!.id;
  });
}

export async function removeAnnouncement(db: Database, session: Session | null, id: unknown) {
  assertCan(session, "data.edit");
  if (!isUuid(id)) throw new UserFacingError("That notice is gone.");
  await db.transaction(async (tx) => {
    const [row] = await tx.update(announcements).set({ removedAt: new Date() }).where(and(eq(announcements.id, id), isNull(announcements.removedAt))).returning({ text: announcements.text });
    if (!row) throw new UserFacingError("That notice is gone.");
    await writeAudit(tx, session.email, { action: "announcement.remove", entityType: "announcement", entityId: id, before: row, reason: "Removed from the notification bar" });
  });
}
