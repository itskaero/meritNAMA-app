import "server-only";
import { and, desc, eq, gt, isNotNull, isNull, lte } from "drizzle-orm";
import { assertCan, type Session } from "@/lib/auth/roles";
import type { Database } from "@/lib/db/client";
import { announcements, inductionSchedule, meritRounds, simDatasets, simulationRuns } from "@/lib/db/schema";
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

export type StatusLine = { tone: "done" | "live" | "wait"; label: string; text: string };

/**
 * Where the data stands, for the sign-in page (no session): the latest induction with lists
 * in, and the next one, which opens here only after PHF's applications close and its gazette
 * is out. Plus the team's public posts, which say anything the dates cannot.
 */
export async function signInStatus(db: Database, now = new Date()): Promise<{ team: Notice[]; lines: StatusLine[] }> {
  const team = (await db.select({ id: announcements.id, text: announcements.text, href: announcements.href, tone: announcements.tone })
    .from(announcements)
    .where(and(isNull(announcements.removedAt), eq(announcements.audience, "all"), lte(announcements.startsAt, now), gt(announcements.endsAt, now)))
    .orderBy(desc(announcements.createdAt)).limit(2))
    .map((t) => ({ id: t.id, text: t.text, href: t.href, tone: t.tone as NoticeTone, auto: false }));
  const day = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Karachi" });

  const [last] = await db.select({ induction: meritRounds.inductionId, roundNo: meritRounds.roundNo, importedAt: meritRounds.importedAt })
    .from(meritRounds).orderBy(desc(meritRounds.inductionId), desc(meritRounds.roundNo)).limit(1);
  const [sched] = await db.select({ id: inductionSchedule.inductionId }).from(inductionSchedule).orderBy(desc(inductionSchedule.inductionId)).limit(1);
  const steps = sched ? await db.select().from(inductionSchedule).where(eq(inductionSchedule.inductionId, sched.id)) : [];
  const ends = steps.map((s) => s.endsAt).filter((d): d is Date => Boolean(d));
  const cycleEnd = ends.length ? new Date(Math.max(...ends.map((d) => d.getTime()))) : null;
  const openStep = steps.filter((s) => s.endsAt && s.endsAt > now && (!s.startsAt || s.startsAt <= now)).sort((a, b) => a.endsAt!.getTime() - b.endsAt!.getTime())[0];

  const lines: StatusLine[] = [];
  if (last) {
    const sameCycle = sched?.id === last.induction;
    const closed = sameCycle && cycleEnd != null && cycleEnd < now;
    lines.push(closed
      ? { tone: "done", label: `Induction ${last.induction}`, text: `Complete: all ${last.roundNo} rounds are in.` }
      : { tone: "live", label: `Induction ${last.induction}`, text: `Round ${last.roundNo} is the latest list, in on ${day(last.importedAt)}.${openStep && sameCycle ? ` On PHF now: ${openStep.title} until ${day(openStep.endsAt!)}.` : ""}` });
  }
  const next = sched && (!last || sched.id > last.induction) ? sched.id : (last?.induction ?? 0) + 1;
  const [gazette] = next > 0 ? await db.select({ id: simDatasets.inductionId }).from(simDatasets).where(eq(simDatasets.inductionId, next)).limit(1) : [];
  if (gazette) {
    lines.push({ tone: "live", label: `Induction ${next}`, text: "The gazette is in: every applicant and their marks are on Candidates. Round 1 shows here as soon as PHF publishes it." });
  } else if (next > 0 && (!last || next > last.induction)) {
    lines.push(sched?.id === next && openStep
      ? { tone: "wait", label: `Induction ${next}`, text: `PHF's portal is open (${openStep.title} until ${day(openStep.endsAt!)}). It opens here once applications close and the gazette is out.` }
      : { tone: "wait", label: `Induction ${next}`, text: "Not open here yet. While candidates apply on PHF's portal there is nothing to show; it opens here once applications close and the gazette is out." });
  }
  return { team, lines };
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
