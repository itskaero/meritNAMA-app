import { readFileSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, inArray, like } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "@/lib/auth/roles";
import { acceptAnswer, createThread, getThread, listThreads, markDuplicate, replyToThread } from "@/lib/data/community";
import { importMeritRound } from "@/lib/data/merit";
import { listInbox, markRead, openNotification, setFollow, unreadCount } from "@/lib/data/notifications";
import { snippetFigures } from "@/lib/data/snippets";
import { ensureUser } from "@/lib/data/users";
import * as schema from "@/lib/db/schema";
import { snippetParam } from "@/lib/domain/community";

/**
 * Q&A, merit snippets, follows and the inbox, against a DISPOSABLE database
 * (TEST_DATABASE_URL). Uses induction 940 and *-qa@test.local users.
 */
const url = process.env.TEST_DATABASE_URL;
const sample = JSON.parse(readFileSync(path.join(__dirname, "fixtures/merit_i20_round1_sample.json"), "utf8"));
const IND = 940;
const file = { ...sample, Table: [{ ...sample.Table[0], inductionId: IND }] };
const first = sample.Table5[0];
const snippet = { induction: IND, round: 1, program: first.type, quota: first.quota, speciality: first.speciality, hospital: first.hospital };

const mod: Session = { userId: "q-mod", email: "mod-qa@test.local", role: "moderator", isStub: false };
const editor: Session = { userId: "q-ed", email: "editor-qa@test.local", role: "data_editor", isStub: false };
const asker: Session = { userId: "q-ask", email: "asker-qa@test.local", role: "candidate", isStub: false };
const helper: Session = { userId: "q-help", email: "helper-qa@test.local", role: "candidate", isStub: false };
const watcher: Session = { userId: "q-watch", email: "watcher-qa@test.local", role: "candidate", isStub: false };

describe.skipIf(!url)("Q&A, snippets and inbox (integration)", () => {
  const sql = postgres(url ?? "postgres://unused", { max: 2, onnotice: () => {} });
  const db = drizzle(sql, { schema });

  const wipe = async () => {
    const ids = (await db.select({ id: schema.users.id }).from(schema.users).where(like(schema.users.email, "%-qa@test.local"))).map((u) => u.id);
    if (ids.length) {
      await db.delete(schema.discussionPosts).where(inArray(schema.discussionPosts.authorId, ids));
      await db.delete(schema.discussionThreads).where(inArray(schema.discussionThreads.authorId, ids));
      await db.delete(schema.users).where(inArray(schema.users.id, ids));
    }
    const rounds = await db.select({ id: schema.meritRounds.id }).from(schema.meritRounds).where(eq(schema.meritRounds.inductionId, IND));
    if (rounds.length) await db.delete(schema.meritRounds).where(inArray(schema.meritRounds.id, rounds.map((r) => r.id)));
    await db.delete(schema.inductions).where(eq(schema.inductions.id, IND));
  };
  beforeAll(async () => {
    await wipe();
    await importMeritRound(db, editor, { roundNo: 1, file, reason: "qa test" });
    for (const [who, a] of [[asker, "QA-1"], [helper, "QA-2"]] as const) {
      const me = await ensureUser(db, who);
      await db.insert(schema.candidateLinks).values({ userId: me.id, applicantId: a, status: "verified", method: "manual", reviewedBy: "test" });
    }
  });
  afterAll(async () => {
    await wipe();
    await sql.end();
  });

  let qid = "", answerId = "", otherId = "";

  it("shows live figures for a merit card and refuses groups that are not in the round", async () => {
    const figures = await snippetFigures(db, [snippet]);
    const f = figures.get(snippetParam(snippet))!;
    const marks = sample.Table5.filter((r: typeof first) => r.type === first.type && r.quota === first.quota && r.speciality === first.speciality && r.hospital === first.hospital).map((r: typeof first) => r.marks);
    expect(f.closing).toBeCloseTo(Math.min(...marks));
    expect(f.opening).toBeCloseTo(Math.max(...marks));
    expect(f.allocations).toBe(marks.length);
    await expect(createThread(db, asker, { topic: { kind: "round", key: `${IND}:1` }, title: "Is this group real at all?", body: "Asking about a made-up hospital.", snippet: { ...snippet, hospital: "Nowhere Hospital" } }))
      .rejects.toThrow("not in the round");
  });

  it("asks with a merit card, notifies topic followers, and follows the asker's own question", async () => {
    await setFollow(db, watcher, { kind: "round", key: `${IND}:1` }, true);
    const t = await createThread(db, asker, { topic: { kind: "round", key: `${IND}:1` }, title: "Will anaesthesia close lower next round?", body: "Closing looked high this time.", snippet });
    qid = t.id;
    const view = (await getThread(db, asker, qid))!;
    expect(view.thread.snippet).toEqual(snippet);
    expect(view.figures.get(snippetParam(snippet))).toBeTruthy();
    expect(view.me).toMatchObject({ canAccept: true, following: true });
    expect(await unreadCount(db, watcher)).toBe(1);
    expect(await unreadCount(db, asker)).toBe(0);
  });

  it("tells followers about answers, but never the person who wrote it", async () => {
    answerId = (await replyToThread(db, helper, { threadId: qid, body: "It usually falls by a mark or two." })).id;
    otherId = (await replyToThread(db, mod, { threadId: qid, body: "Seats were added this year as well." })).id;
    const inbox = await listInbox(db, asker);
    expect(inbox.items.map((i) => i.kind)).toEqual(["answer", "answer"]);
    expect(inbox.items[0]!.href).toBe(`/portal/community/${qid}`);
    // The helper follows now (answered), and got the moderator's reply only.
    expect((await listInbox(db, helper)).items.map((i) => i.title)).toEqual([expect.stringContaining("New answer")]);
  });

  it("lets only the asker or a moderator accept, puts the accepted answer first and ranks answered questions first", async () => {
    await expect(acceptAnswer(db, helper, { threadId: qid, postId: answerId })).rejects.toThrow("Only the person who asked");
    expect(await acceptAnswer(db, asker, { threadId: qid, postId: otherId })).toEqual({ accepted: true });
    expect(await acceptAnswer(db, asker, { threadId: qid, postId: answerId })).toEqual({ accepted: true });
    const view = (await getThread(db, helper, qid))!;
    expect(view.posts[0]).toMatchObject({ id: answerId, accepted: true });
    expect((await listInbox(db, helper)).items[0]).toMatchObject({ kind: "accepted" });

    const later = await createThread(db, asker, { topic: { kind: "round", key: `${IND}:1` }, title: "Another newer question here", body: "Nobody has answered this one." });
    const list = await listThreads(db, asker, { topic: { kind: "round", key: `${IND}:1` } });
    expect(list[0]).toMatchObject({ id: qid, answered: true });
    expect((await listThreads(db, asker, { topic: { kind: "round", key: `${IND}:1` }, filter: "unanswered" })).map((t) => t.id)).toEqual([later.id]);

    // Duplicates: moderators only; locks and links the original.
    await expect(markDuplicate(db, asker, { threadId: later.id, originalId: qid, reason: "same" })).rejects.toThrow();
    await markDuplicate(db, mod, { threadId: later.id, originalId: qid, reason: "Same question" });
    const dup = (await getThread(db, asker, later.id))!;
    expect(dup.thread).toMatchObject({ duplicateOf: qid, locked: true });
    expect(dup.original).toMatchObject({ id: qid });
    await expect(replyToThread(db, helper, { threadId: later.id, body: "late answer" })).rejects.toThrow("locked");
  });

  it("tells induction followers about a new round", async () => {
    await setFollow(db, watcher, { kind: "induction", key: String(IND) }, true);
    await markRead(db, watcher, "all");
    await importMeritRound(db, editor, { roundNo: 2, file, reason: "qa test round 2" });
    const inbox = await listInbox(db, watcher);
    expect(inbox.items[0]).toMatchObject({ kind: "new_round", href: `/portal/history/${IND}/rounds/2` });
    expect(inbox.items.filter((i) => i.kind === "new_round")).toHaveLength(1); // round and induction follows do not double up
  });

  it("keeps each inbox private", async () => {
    const theirs = (await listInbox(db, watcher)).items[0]!;
    expect(await openNotification(db, asker, theirs.id)).toBeNull();
    expect(await openNotification(db, watcher, theirs.id)).toBe(`/portal/history/${IND}/rounds/2`);
    expect(await unreadCount(db, watcher)).toBe(0);
    await setFollow(db, watcher, { kind: "induction", key: String(IND) }, false);
    expect((await listInbox(db, watcher)).followed.map((f) => f.kind)).toEqual(["round"]);
  });
});
