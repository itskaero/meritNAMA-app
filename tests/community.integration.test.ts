import { drizzle } from "drizzle-orm/postgres-js";
import { eq, inArray } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "@/lib/auth/roles";
import {
  createThread,
  getThread,
  listOpenReports,
  listThreads,
  moderate,
  replyToThread,
  reportContent,
  setDisplayName,
  toggleHelpful,
} from "@/lib/data/community";
import * as schema from "@/lib/db/schema";

/** Runs against a DISPOSABLE database (TEST_DATABASE_URL); uses its own test users and removes them. */
const url = process.env.TEST_DATABASE_URL;
const admin: Session = { userId: "c-admin", email: "community-admin@test.local", role: "admin", isStub: false };
const alice: Session = { userId: "c-alice", email: "community-alice@test.local", role: "candidate", isStub: false };
const bob: Session = { userId: "c-bob", email: "community-bob@test.local", role: "candidate", isStub: false };

describe.skipIf(!url)("community (integration)", () => {
  const sql = postgres(url ?? "postgres://unused", { max: 2, onnotice: () => {} });
  const db = drizzle(sql, { schema });
  const emails = [admin.email, alice.email, bob.email];

  const wipe = async () => {
    const ids = (await db.select({ id: schema.users.id }).from(schema.users).where(inArray(schema.users.email, emails))).map((u) => u.id);
    if (!ids.length) return;
    await db.delete(schema.discussionReports).where(inArray(schema.discussionReports.reporterId, ids));
    await db.delete(schema.discussionVotes).where(inArray(schema.discussionVotes.userId, ids));
    await db.delete(schema.discussionPosts).where(inArray(schema.discussionPosts.authorId, ids));
    await db.delete(schema.discussionThreads).where(inArray(schema.discussionThreads.authorId, ids));
    await db.delete(schema.users).where(inArray(schema.users.id, ids));
  };
  beforeAll(wipe);
  afterAll(async () => {
    await wipe();
    await sql.end();
  });

  let threadId = "";

  it("needs a signed-in user", async () => {
    await expect(listThreads(db, null)).rejects.toThrow("unauthenticated");
  });

  it("starts a thread under an anonymous name and refuses personal data", async () => {
    const t = await createThread(db, alice, { topic: { kind: "round", key: "20:6" }, title: "Did anaesthesia close lower in round 6?", body: "Looks like it fell by almost three marks." });
    threadId = t.id;
    await expect(createThread(db, alice, { topic: { kind: "general", key: "" }, title: "Contact me about seats", body: "My number is 0300-1234567" })).rejects.toThrow("Remove a phone number");
    const list = await listThreads(db, bob, { topic: { kind: "round", key: "20:6" } });
    expect(list[0]).toMatchObject({ title: "Did anaesthesia close lower in round 6?", replies: 0 });
    expect(list[0]!.author).toMatch(/^member-/);
    expect(JSON.stringify(list)).not.toContain("@test.local");
    expect(list[0]!.topic).toMatchObject({ label: "Induction 20 · round 6", href: "/portal/history/20/rounds/6" });
  });

  it("replies, votes and lets members pick a display name", async () => {
    await setDisplayName(db, bob, "Bob from Multan");
    await expect(setDisplayName(db, alice, "bob FROM multan")).rejects.toThrow("taken");
    const reply = await replyToThread(db, bob, { threadId, body: "Yes, from 22.48 to 19.60 in FCPS Punjab." });
    await expect(toggleHelpful(db, bob, { kind: "post", id: reply.id })).rejects.toThrow("own post");
    expect(await toggleHelpful(db, alice, { kind: "post", id: reply.id })).toEqual({ voted: true });
    const view = (await getThread(db, alice, threadId))!;
    expect(view.posts).toHaveLength(1);
    expect(view.posts[0]).toMatchObject({ author: "Bob from Multan", helpful: 1, voted: true, mine: false });
    expect(await toggleHelpful(db, alice, { kind: "post", id: reply.id })).toEqual({ voted: false });
  });

  it("limits posting speed", async () => {
    // 1 thread + 4 replies = 5 posts this minute, the limit
    for (let i = 0; i < 4; i++) await replyToThread(db, alice, { threadId, body: `Follow-up number ${i + 1}` });
    await expect(replyToThread(db, alice, { threadId, body: "One too many" })).rejects.toThrow("posting quickly");
  });

  it("reports go to admins, who can hide and lock", async () => {
    await reportContent(db, bob, { kind: "thread", id: threadId, reason: "Off topic" });
    await reportContent(db, bob, { kind: "thread", id: threadId, reason: "Again" }); // one report per member
    await expect(listOpenReports(db, alice)).rejects.toThrow("forbidden");
    const reports = await listOpenReports(db, admin);
    expect(reports.find((r) => r.target_id === threadId)).toMatchObject({ reports: 1, reasons: ["Off topic"] });

    await moderate(db, admin, { kind: "thread", id: threadId, action: "lock", reason: "resolved" });
    await expect(replyToThread(db, bob, { threadId, body: "late reply here" })).rejects.toThrow("locked");
    await moderate(db, admin, { kind: "thread", id: threadId, action: "hide", reason: "off topic" });
    expect(await getThread(db, bob, threadId)).toBeNull();
    expect(await getThread(db, admin, threadId)).not.toBeNull();
    expect((await listOpenReports(db, admin)).find((r) => r.target_id === threadId)).toBeUndefined();
    const audit = await db.select().from(schema.auditLog).where(eq(schema.auditLog.entityId, threadId));
    expect(audit.map((a) => a.action).sort()).toEqual(["community.hide", "community.lock"]);
    await db.delete(schema.auditLog).where(eq(schema.auditLog.entityId, threadId));
  });
});
