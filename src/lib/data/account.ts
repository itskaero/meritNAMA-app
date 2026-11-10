import "server-only";
import { eq, or } from "drizzle-orm";
import { assertCan, type Session } from "@/lib/auth/roles";
import type { Database } from "@/lib/db/client";
import {
  accessRequests,
  candidateLinks,
  chatBlocks,
  chatMembers,
  chatMessages,
  chatReactions,
  chatReports,
  discussionPollVotes,
  discussionPosts,
  discussionReports,
  discussionThreads,
  discussionVotes,
  follows,
  loginTokens,
  notifications,
  preferenceLists,
  savedViews,
  sessions,
  shortlistItems,
  simConsentScenarios,
  users,
} from "@/lib/db/schema";
import { UserFacingError } from "@/lib/errors";
import { myMerit } from "./candidates";
import { writeAudit } from "./shared";
import { ensureUser } from "./users";

/*
 * A person's own data: a copy they can download, and deletion. Deleting removes everything
 * private to them (sign-in, record link, shortlist, saved items, messages, votes) and makes
 * the account anonymous. Their questions and answers stay in the community, shown as
 * "Deleted member", because other people's replies hang on them. The payment request, if
 * any, is kept for the payment records.
 */

/** Everything stored about the signed-in person, as plain data. Never anyone else's. */
export async function exportMyData(db: Database, session: Session | null) {
  assertCan(session, "portal");
  const me = await ensureUser(db, session!);
  const email = session!.email;
  const [profile] = await db.select({ email: users.email, displayName: users.displayName, role: users.role, createdAt: users.createdAt, shortlistAlerts: users.shortlistAlerts, showBand: users.showBand, peerCounted: users.peerCounted, dmOpen: users.dmOpen }).from(users).where(eq(users.id, me.id)).limit(1);
  const [links, shortlist, views, followed, lists, notes, threads, posts, messages, requests, merit] = await Promise.all([
    db.select({ applicantId: candidateLinks.applicantId, status: candidateLinks.status, createdAt: candidateLinks.createdAt }).from(candidateLinks).where(eq(candidateLinks.userId, me.id)),
    db.select({ program: shortlistItems.program, quota: shortlistItems.quota, speciality: shortlistItems.speciality, hospital: shortlistItems.hospital, note: shortlistItems.note, createdAt: shortlistItems.createdAt }).from(shortlistItems).where(eq(shortlistItems.userId, me.id)),
    db.select({ label: savedViews.label, href: savedViews.href, createdAt: savedViews.createdAt }).from(savedViews).where(eq(savedViews.userId, me.id)),
    db.select({ kind: follows.kind, key: follows.key, createdAt: follows.createdAt }).from(follows).where(eq(follows.userId, me.id)),
    db.select({ name: preferenceLists.name, program: preferenceLists.program, quota: preferenceLists.quota, marks: preferenceLists.marks, total: preferenceLists.total, createdAt: preferenceLists.createdAt }).from(preferenceLists).where(eq(preferenceLists.userId, me.id)),
    db.select({ title: notifications.title, createdAt: notifications.createdAt }).from(notifications).where(eq(notifications.userId, me.id)),
    db.select({ title: discussionThreads.title, body: discussionThreads.body, createdAt: discussionThreads.createdAt }).from(discussionThreads).where(eq(discussionThreads.authorId, me.id)),
    db.select({ body: discussionPosts.body, createdAt: discussionPosts.createdAt }).from(discussionPosts).where(eq(discussionPosts.authorId, me.id)),
    db.select({ body: chatMessages.body, createdAt: chatMessages.createdAt }).from(chatMessages).where(eq(chatMessages.authorId, me.id)),
    db.select({ amountPkr: accessRequests.amountPkr, reference: accessRequests.reference, status: accessRequests.status, createdAt: accessRequests.createdAt }).from(accessRequests).where(eq(accessRequests.email, email)),
    myMerit(db, session).catch(() => null),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    note: "Everything meritNAMA stores about this account. Merit rows are your own rows from the published lists.",
    account: profile,
    candidateLinks: links,
    meritRows: merit?.rows ?? [],
    shortlist,
    savedViews: views,
    following: followed,
    preferenceLists: lists,
    notices: notes,
    communityQuestions: threads,
    communityReplies: posts,
    chatMessages: messages,
    accessRequests: requests,
  };
}

/**
 * Delete the signed-in person's account (see the note at the top). Staff accounts are
 * removed by the owner, so the team never loses its audit trail by accident.
 */
export async function deleteMyAccount(db: Database, session: Session | null, input: { confirmEmail: string }) {
  assertCan(session, "portal");
  if (session!.isStub) throw new UserFacingError("A development sign-in has no account to delete.");
  const me = await ensureUser(db, session!);
  const email = session!.email;
  if (me.role !== "candidate") throw new UserFacingError("Team accounts are removed by the owner from Team & roles.");
  if (input.confirmEmail.trim().toLowerCase() !== email.toLowerCase()) throw new UserFacingError("Type your email address exactly as shown to confirm.");

  await db.transaction(async (tx) => {
    await tx.delete(sessions).where(eq(sessions.userId, me.id));
    await tx.delete(loginTokens).where(eq(loginTokens.email, email));
    await tx.delete(candidateLinks).where(eq(candidateLinks.userId, me.id));
    await tx.delete(shortlistItems).where(eq(shortlistItems.userId, me.id));
    await tx.delete(savedViews).where(eq(savedViews.userId, me.id));
    await tx.delete(preferenceLists).where(eq(preferenceLists.userId, me.id));
    await tx.delete(simConsentScenarios).where(eq(simConsentScenarios.userId, me.id));
    await tx.delete(follows).where(eq(follows.userId, me.id));
    await tx.delete(notifications).where(eq(notifications.userId, me.id));
    await tx.delete(discussionVotes).where(eq(discussionVotes.userId, me.id));
    await tx.delete(discussionPollVotes).where(eq(discussionPollVotes.userId, me.id));
    await tx.delete(discussionReports).where(eq(discussionReports.reporterId, me.id));
    await tx.delete(chatReactions).where(eq(chatReactions.userId, me.id));
    await tx.delete(chatReports).where(eq(chatReports.reporterId, me.id));
    await tx.delete(chatBlocks).where(or(eq(chatBlocks.blockerId, me.id), eq(chatBlocks.blockedId, me.id)));
    await tx.delete(chatMessages).where(eq(chatMessages.authorId, me.id));
    await tx.delete(chatMembers).where(eq(chatMembers.userId, me.id));
    await tx
      .update(users)
      .set({ email: `deleted-${me.id}@deleted.invalid`, displayName: "Deleted member", shortlistAlerts: false, showBand: false, peerCounted: false, dmOpen: false })
      .where(eq(users.id, me.id));
    // The audit entry carries the user id, not the address.
    await writeAudit(tx, `deleted-${me.id}@deleted.invalid`, { action: "account.delete", entityType: "user", entityId: me.id, reason: "Deleted by the account holder" });
  });
}
