import { readFileSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, inArray, like } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "@/lib/auth/roles";
import { createThread, getThread, listOpenReports, moderate, reportContent, votePoll } from "@/lib/data/community";
import { importMeritRound } from "@/lib/data/merit";
import { listInbox, setFollow } from "@/lib/data/notifications";
import { listHospitalReviews, saveReview, specialityReviewSummary } from "@/lib/data/reviews";
import { ensureUser } from "@/lib/data/users";
import * as schema from "@/lib/db/schema";

/**
 * Polls and hospital reviews against a DISPOSABLE database (TEST_DATABASE_URL).
 * Imports the sample round at induction 960 with test lookups 9301+ (hospital and
 * speciality of the first row), and *-pr@test.local users.
 */
const url = process.env.TEST_DATABASE_URL;
const sample = JSON.parse(readFileSync(path.join(__dirname, "fixtures/merit_i20_round1_sample.json"), "utf8"));
const IND = 960, HOSP = 9301, SPEC = 9302, OTHER_SPEC = 9303;
const first = sample.Table5[0];
const S = (who: string, role: Session["role"] = "candidate"): Session => ({ userId: who, email: `${who}-pr@test.local`, role, isStub: false });
const owner = S("owner", "owner"), mod = S("mod", "moderator"), editor = S("editor", "data_editor");
const ver = S("ver"), other = S("other"), carol = S("carol"), watcher = S("watch");
const ratings = { training: 4, workload: 2, hostel: 3, stipend: 1 };
const body = "Teaching on rounds is good, but the stipend is usually two months late.";

describe.skipIf(!url)("polls and hospital reviews (integration)", () => {
  const sql = postgres(url ?? "postgres://unused", { max: 2, onnotice: () => {} });
  const db = drizzle(sql, { schema });

  const wipe = async () => {
    const ids = (await db.select({ id: schema.users.id }).from(schema.users).where(like(schema.users.email, "%-pr@test.local"))).map((u) => u.id);
    if (ids.length) {
      await db.delete(schema.discussionThreads).where(inArray(schema.discussionThreads.authorId, ids));
      await db.delete(schema.hospitalReviews).where(inArray(schema.hospitalReviews.authorId, ids));
      await db.delete(schema.discussionReports).where(inArray(schema.discussionReports.reporterId, ids));
      await db.delete(schema.users).where(inArray(schema.users.id, ids));
    }
    const rounds = await db.select({ id: schema.meritRounds.id }).from(schema.meritRounds).where(eq(schema.meritRounds.inductionId, IND));
    if (rounds.length) await db.delete(schema.meritRounds).where(inArray(schema.meritRounds.id, rounds.map((r) => r.id)));
    await db.delete(schema.inductions).where(eq(schema.inductions.id, IND));
    await db.delete(schema.nameAliases).where(inArray(schema.nameAliases.lookupId, [HOSP, SPEC]));
    await db.delete(schema.hospitals).where(eq(schema.hospitals.id, HOSP));
    await db.delete(schema.specialities).where(inArray(schema.specialities.id, [SPEC, OTHER_SPEC]));
  };

  beforeAll(async () => {
    await wipe();
    // Aliases map the first row's names to our test lookups, whatever else the database holds.
    await db.insert(schema.hospitals).values({ id: HOSP, name: "Test Hospital PR" });
    await db.insert(schema.specialities).values([{ id: SPEC, name: "Test Speciality PR" }, { id: OTHER_SPEC, name: "Test Other PR" }]);
    const { nameKey } = await import("@/lib/domain/merit-round");
    for (const [kind, name, lookupId] of [["hospital", first.hospital, HOSP], ["speciality", first.speciality, SPEC]] as const) {
      await db.insert(schema.nameAliases).values({ kind, nameKey: nameKey(name), lookupId, createdBy: "test" })
        .onConflictDoUpdate({ target: [schema.nameAliases.kind, schema.nameAliases.nameKey], set: { lookupId } });
    }
    await importMeritRound(db, editor, { roundNo: 1, file: { ...sample, Table: [{ ...sample.Table[0], inductionId: IND }] }, reason: "polls/reviews test" });
    for (const [who, applicantId] of [[ver, first.applicantId], [other, "NOT-IN-LISTS"]] as const) {
      const me = await ensureUser(db, who);
      await db.insert(schema.candidateLinks).values({ userId: me.id, applicantId, status: "verified", method: "manual", reviewedBy: "test" });
    }
  });
  afterAll(async () => {
    await wipe();
    await sql.end();
  });

  it("runs a poll: verified members vote and change votes; results after voting or closing", async () => {
    const t = await createThread(db, owner, {
      topic: { kind: "general", key: "" }, title: "Which round will Anaesthesia close lowest?", body: "Based on last year's lists.",
      poll: { question: "Which round will close lowest?", options: ["Round 5", "Round 6"], closesInDays: 7 },
    });
    const view = (await getThread(db, ver, t.id))!;
    const [r5, r6] = view.poll!.options;
    expect(view.poll).toMatchObject({ question: "Which round will close lowest?", total: 0, myOptionId: null, showResults: false, closed: false });
    expect(r5!.votes).toBeNull();

    await expect(votePoll(db, carol, { threadId: t.id, optionId: r5!.id })).rejects.toThrow("Verify it on your profile");
    await votePoll(db, ver, { threadId: t.id, optionId: r5!.id });
    await votePoll(db, other, { threadId: t.id, optionId: r6!.id });
    await votePoll(db, ver, { threadId: t.id, optionId: r6!.id }); // change of mind
    const after = (await getThread(db, ver, t.id))!.poll!;
    expect(after).toMatchObject({ total: 2, myOptionId: r6!.id, showResults: true });
    expect(after.options.map((o) => [o.votes, o.pct])).toEqual([[0, 0], [2, 100]]);
    expect((await getThread(db, carol, t.id))!.poll!.showResults).toBe(false);
    await expect(votePoll(db, ver, { threadId: t.id, optionId: 999999 })).rejects.toThrow("Pick one");

    await db.update(schema.discussionPolls).set({ closesAt: new Date(Date.now() - 1000) }).where(eq(schema.discussionPolls.threadId, t.id));
    await expect(votePoll(db, other, { threadId: t.id, optionId: r5!.id })).rejects.toThrow("closed");
    expect((await getThread(db, carol, t.id))!.poll).toMatchObject({ closed: true, showResults: true });
  });

  it("takes reviews from verified candidates only, one per hospital and speciality", async () => {
    await setFollow(db, watcher, { kind: "hospital", key: String(HOSP) }, true);
    await expect(saveReview(db, carol, { hospitalId: HOSP, specialityId: SPEC, induction: IND, ...ratings, body })).rejects.toThrow("Verify it on your profile");
    await expect(saveReview(db, ver, { hospitalId: HOSP, specialityId: OTHER_SPEC, induction: IND, ...ratings, body })).rejects.toThrow("no seats at this hospital");
    expect(await saveReview(db, ver, { hospitalId: HOSP, specialityId: SPEC, induction: IND, ...ratings, body })).toMatchObject({ created: true });
    expect(await saveReview(db, ver, { hospitalId: HOSP, specialityId: SPEC, induction: IND, ...ratings, training: 5, body })).toMatchObject({ created: false });
    await saveReview(db, other, { hospitalId: HOSP, specialityId: SPEC, induction: IND, training: 3, workload: 4, hostel: 5, stipend: 3, body });

    const list = await listHospitalReviews(db, carol, { hospitalId: HOSP });
    expect(list.count).toBe(2);
    expect(list.averages).toEqual([{ key: "training", value: 4 }, { key: "workload", value: 3 }, { key: "hostel", value: 4 }, { key: "stipend", value: 2 }]);
    const byVer = list.reviews.find((r) => r.training === 5)!, byOther = list.reviews.find((r) => r.training === 3)!;
    // "Allocated here" only when the reviewer's verified record has a seat at this hospital.
    expect(byVer).toMatchObject({ authorVerified: true, allocatedHere: true, speciality: "Test Speciality PR" });
    expect(byOther).toMatchObject({ authorVerified: true, allocatedHere: false });
    expect(JSON.stringify(list)).not.toContain("@test.local");
    expect(list.mayWrite).toBe(false);
    expect((await listHospitalReviews(db, ver, { hospitalId: HOSP, specialityId: SPEC })).mine).toMatchObject({ training: 5 });

    // Followers hear about new reviews, not edits.
    expect((await listInbox(db, watcher)).items.filter((i) => i.kind === "new_review")).toHaveLength(2);
    expect(await specialityReviewSummary(db, carol, SPEC)).toEqual([expect.objectContaining({ hospitalId: HOSP, count: 2, training: 4 })]);

    // Reported, then hidden by a moderator: gone for members, still there for moderators.
    await reportContent(db, carol, { kind: "review", id: byOther.id, reason: "Not about this hospital" });
    expect((await listOpenReports(db, mod)).find((r) => r.target_id === byOther.id)).toMatchObject({ target_kind: "review", review_hospital_id: HOSP });
    await moderate(db, mod, { kind: "review", id: byOther.id, action: "hide", reason: "Off topic" });
    expect((await listHospitalReviews(db, carol, { hospitalId: HOSP })).reviews.map((r) => r.id)).toEqual([byVer.id]);
    expect((await listHospitalReviews(db, mod, { hospitalId: HOSP })).reviews).toHaveLength(2);
    await expect(moderate(db, mod, { kind: "review", id: byOther.id, action: "pin", reason: "x" })).rejects.toThrow("only be hidden or shown");
  });
});
