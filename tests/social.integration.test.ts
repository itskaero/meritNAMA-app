import { drizzle } from "drizzle-orm/postgres-js";
import { eq, inArray, like } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "@/lib/auth/roles";
import { acceptAnswer, createThread, listOpenReports, moderate, replyToThread, reportContent, toggleHelpful } from "@/lib/data/community";
import { toggleShortlist } from "@/lib/data/finder";
import { importMeritRound } from "@/lib/data/merit";
import { listRoom, postToRoom, roomPulse } from "@/lib/data/rooms";
import { myBand, myReputation, peerInterest, setSocialPrefs } from "@/lib/data/social";
import { ensureUser } from "@/lib/data/users";
import * as schema from "@/lib/db/schema";

/** DISPOSABLE database only (TEST_DATABASE_URL). Uses induction 974 and *@social.test accounts. */
const url = process.env.TEST_DATABASE_URL;
const IND = 974;
const s = (name: string, role: Session["role"] = "candidate"): Session => ({ userId: `so-${name}`, email: `${name}@social.test`, role, isStub: false });
const owner = s("owner", "owner");
const [a, b, c, d, e, f] = ["a", "b", "c", "d", "e", "f"].map((n) => s(n));
const MARKS = [22.5, 22.3, 22.2, 22.1, 18.0];

const round = (roundNo: number, marks: number[]) => ({
  Table: [{ inductionId: IND, name: `PHF/34/JAN/0${roundNo}`, displayName: "Social", startDate: "2034-01-01T00:00:00", endDate: "2034-02-01T00:00:00" }],
  Table5: marks.map((m, i) => ({ rowNo: i + 1, type: "FCPS", quota: "Punjab", specialityJobId: i < 2 ? 1 : 2, speciality: i < 2 ? "Radiology" : "Ophthalmology", hospital: "Mayo Hospital, Lahore", institute: "", seats: 2, marks: m, applicantId: String(740000 + i), preferenceNo: 1, consent: "Accepted" })),
});

describe.skipIf(!url)("round rooms, reputation and peers (integration)", () => {
  const sql = postgres(url ?? "postgres://unused", { max: 2, onnotice: () => {} });
  const db = drizzle(sql, { schema });

  const wipe = async () => {
    await db.delete(schema.roundRoomMessages).where(eq(schema.roundRoomMessages.induction, IND));
    const rs = await db.select({ id: schema.meritRounds.id }).from(schema.meritRounds).where(eq(schema.meritRounds.inductionId, IND));
    if (rs.length) await db.delete(schema.meritRounds).where(inArray(schema.meritRounds.id, rs.map((r) => r.id)));
    await db.delete(schema.inductions).where(eq(schema.inductions.id, IND));
    const ids = (await db.select({ id: schema.users.id }).from(schema.users).where(like(schema.users.email, "%@social.test"))).map((u) => u.id);
    if (ids.length) {
      await db.delete(schema.discussionReports).where(inArray(schema.discussionReports.reporterId, ids));
      await db.delete(schema.discussionVotes).where(inArray(schema.discussionVotes.userId, ids));
      await db.update(schema.discussionThreads).set({ acceptedPostId: null }).where(inArray(schema.discussionThreads.authorId, ids));
      await db.delete(schema.discussionPosts).where(inArray(schema.discussionPosts.authorId, ids));
      await db.delete(schema.discussionThreads).where(inArray(schema.discussionThreads.authorId, ids));
      await db.delete(schema.users).where(inArray(schema.users.id, ids));
    }
  };
  beforeAll(async () => {
    await wipe();
    for (const [i, who] of [a, b, c, d, e].entries()) {
      const me = await ensureUser(db, who!);
      await db.insert(schema.candidateLinks).values({ userId: me.id, applicantId: String(740000 + i), status: "verified", method: "manual", reviewedBy: "test" });
    }
    await ensureUser(db, f!);
  });
  afterAll(async () => {
    await wipe();
    await sql.end();
  });

  it("posts the round's figures into its room on import", async () => {
    await importMeritRound(db, owner, { roundNo: 1, file: round(1, MARKS), reason: "r1" });
    await importMeritRound(db, owner, { roundNo: 2, file: round(2, [22.5, 21.9, 22.2, 22.1, 18.0]), reason: "r2" });
    const room = (await listRoom(db, f!, { induction: IND, roundNo: 2 }))!;
    expect(room.mayPost).toBe(false);
    expect(room.messages).toHaveLength(1);
    expect(room.messages[0]!.kind).toBe("system");
    expect(room.messages[0]!.author).toBeNull();
    expect(room.messages[0]!.body).toMatch(/^Round 2 is out: 5 allocations\. Median closing merit .* Biggest fall: FCPS Radiology, 22\.30 → 21\.90\./);
    expect(await listRoom(db, f!, { induction: IND, roundNo: 9 })).toBeNull();
  });

  it("lets verified members post one line at a time; everyone reads", async () => {
    await expect(postToRoom(db, f!, { induction: IND, roundNo: 2, body: "hello" })).rejects.toThrow(/link/i);
    await expect(postToRoom(db, a!, { induction: IND, roundNo: 2, body: "x".repeat(301) })).rejects.toThrow();
    await postToRoom(db, a!, { induction: IND, roundNo: 2, body: "  Moved up   to Ophthalmology! " });
    await expect(postToRoom(db, a!, { induction: IND, roundNo: 2, body: "again" })).rejects.toThrow(/ten seconds/);
    const seen = (await listRoom(db, b!, { induction: IND, roundNo: 2 }))!.messages;
    expect(seen.map((m) => m.body)).toEqual([expect.stringMatching(/^Round 2/), "Moved up to Ophthalmology!"]);
    expect(seen[1]).toMatchObject({ kind: "message", verified: true, band: null, mine: false });
    // Polling returns only what is new.
    expect((await listRoom(db, b!, { induction: IND, roundNo: 2 }, { after: seen[1]!.seq }))!.messages).toEqual([]);
    // An opted-in band: programme and a one-mark range from the latest allocation.
    await setSocialPrefs(db, a!, { showBand: true });
    expect(await myBand(db, a!)).toBe("FCPS · 22–23");
    expect((await listRoom(db, b!, { induction: IND, roundNo: 2 }))!.messages[1]!.band).toBe("FCPS · 22–23");
    const pulse = await roomPulse(db, b!);
    expect(pulse.rooms.find((r) => r.induction === IND && r.roundNo === 2)).toMatchObject({ messages: 1, today: 1 });
  });

  it("takes reports on room messages and lets moderators hide them", async () => {
    const msg = (await listRoom(db, b!, { induction: IND, roundNo: 2 }))!.messages[1]!;
    await reportContent(db, b!, { kind: "message", id: msg.id, reason: "Rude or abusive" });
    const rep = (await listOpenReports(db, owner)).find((r) => r.target_id === msg.id)!;
    expect(rep).toMatchObject({ target_kind: "message", room_href: `/portal/history/${IND}/rounds/2#room`, excerpt: "Moved up to Ophthalmology!" });
    await moderate(db, owner, { kind: "message", id: msg.id, action: "hide", reason: "test hide" });
    expect((await listRoom(db, b!, { induction: IND, roundNo: 2 }))!.messages).toHaveLength(1);
    expect((await listRoom(db, owner, { induction: IND, roundNo: 2 }))!.messages[1]!.hidden).toBe(true);
    await expect(moderate(db, owner, { kind: "message", id: msg.id, action: "lock", reason: "test" })).rejects.toThrow(/hidden or shown/);
  });

  it("earns reputation from accepted answers and verified helpful votes", async () => {
    expect((await myReputation(db, a!)).points).toBe(0);
    const t = await createThread(db, b!, { topic: { kind: "general", key: "" }, title: "Which unit at Mayo for Ophthalmology?", body: "Looking for advice on the units and their workload." });
    const p = await replyToThread(db, a!, { threadId: t.id, body: "Unit I has the better OT exposure in my experience." });
    await acceptAnswer(db, b!, { threadId: t.id, postId: p.id });
    expect((await myReputation(db, a!)).points).toBe(10);
    await toggleHelpful(db, c!, { kind: "post", id: p.id });
    await toggleHelpful(db, f!, { kind: "post", id: p.id }); // not verified: not counted
    const rep = await myReputation(db, a!);
    expect(rep).toMatchObject({ points: 12, accepted: 1, level: expect.objectContaining({ label: "Contributor" }) });
    // Accepting your own answer to your own question earns nothing.
    const own = await createThread(db, a!, { topic: { kind: "general", key: "" }, title: "Answering my own question here", body: "Testing that self-accepts do not count." });
    const op = await replyToThread(db, a!, { threadId: own.id, body: "Self answer that should not count." });
    await acceptAnswer(db, a!, { threadId: own.id, postId: op.id });
    expect((await myReputation(db, a!)).points).toBe(12);
  });

  it("counts people near your marks without naming them, and only from three", async () => {
    const seat = { program: "FCPS", quota: "Punjab", speciality: "Ophthalmology", hospital: "Mayo Hospital, Lahore" };
    for (const who of [a, b, c, d, e]) await toggleShortlist(db, who!, seat);
    // a has 22.5; b 21.9, c 22.2, d 22.1 (latest round); e 18.0. Within 0.5 of a: c and d only.
    let mine = await peerInterest(db, a!);
    expect(mine).toMatchObject({ marks: 22.5, source: "record", near: null, seats: [] });
    // From c (22.2): a, b? (21.9 is within 0.3) and d → three.
    mine = await peerInterest(db, c!);
    expect(mine.near).toBe(3);
    expect(mine.seats).toEqual([{ ...seat, peers: 3 }]);
    await setSocialPrefs(db, d!, { peerCounted: false });
    mine = await peerInterest(db, c!);
    expect(mine).toMatchObject({ near: null, seats: [] });
    // No record and no plan: nothing to compare.
    expect(await peerInterest(db, f!)).toEqual({ marks: null, source: null, near: null, seats: [] });
  });
});
