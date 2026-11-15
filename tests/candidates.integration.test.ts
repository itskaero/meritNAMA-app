import { mkdtemp, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, desc, eq, inArray, like } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "@/lib/auth/roles";
import * as schema from "@/lib/db/schema";

// Read lazily by env(): set before anything calls it.
process.env.OWNER_EMAILS = "boss-signin@test.local";

const { consumeLoginLink, endSession, requestLoginLink, sessionFromId } = await import("@/lib/auth/login");
const { indexGazette, linkByCnic, listLinkRequests, myLink, myMerit, readEvidence, recoverAccount, requestLink, reviewLink } = await import("@/lib/data/candidates");
const { masked, myPrivacy, privacyMask, setMyPrivacy } = await import("@/lib/data/privacy");
const { proposeMeritRound } = await import("@/lib/data/changes");
const { setFeatures } = await import("@/lib/data/settings");

/**
 * Sign-in, the candidate index and account links, against a DISPOSABLE database
 * (TEST_DATABASE_URL). Uses induction 930 and *@example.test / *-signin@test.local users.
 */
const url = process.env.TEST_DATABASE_URL;
const sample = JSON.parse(readFileSync(path.join(__dirname, "fixtures/merit_i20_round1_sample.json"), "utf8"));
const IND = 930;
const applicants: string[] = [...new Set<string>(sample.Table5.map((r: { applicantId: string }) => r.applicantId))];
const admin: Session = { userId: "s-admin", email: "admin-signin@test.local", role: "owner", isStub: false };
const verifier: Session = { userId: "s-ver", email: "verifier-signin@test.local", role: "verifier", isStub: false };
const PDF = new TextEncoder().encode("%PDF-1.4\n% test proof\n");

describe.skipIf(!url)("sign-in and candidate verification (integration)", () => {
  const sql = postgres(url ?? "postgres://unused", { max: 2, onnotice: () => {} });
  const db = drizzle(sql, { schema });
  let root = "";

  const wipe = async () => {
    const rounds = await db.select({ id: schema.meritRounds.id }).from(schema.meritRounds).where(eq(schema.meritRounds.inductionId, IND));
    if (rounds.length) await db.delete(schema.meritRounds).where(inArray(schema.meritRounds.id, rounds.map((r) => r.id)));
    await db.delete(schema.inductions).where(eq(schema.inductions.id, IND));
    await db.delete(schema.candidateIdentities).where(inArray(schema.candidateIdentities.applicantId, applicants));
    await db.delete(schema.candidatePrivacy).where(inArray(schema.candidatePrivacy.applicantId, applicants));
    await db.delete(schema.auditLog).where(and(eq(schema.auditLog.action, "candidate_link.cnic_miss"), inArray(schema.auditLog.entityId, applicants)));
    await db.delete(schema.users).where(like(schema.users.email, "%@example.test"));
    await db.delete(schema.users).where(like(schema.users.email, "%-signin@test.local"));
    await db.delete(schema.loginTokens).where(like(schema.loginTokens.email, "%-signin@test.local"));
    await db.delete(schema.loginTokens).where(like(schema.loginTokens.email, "%@example.test"));
    await db.delete(schema.devOutbox).where(like(schema.devOutbox.to, "%-signin@test.local"));
    await db.delete(schema.devOutbox).where(like(schema.devOutbox.to, "%@example.test"));
  };
  beforeAll(async () => {
    await wipe();
    root = await mkdtemp(path.join(os.tmpdir(), "mn-evidence-"));
  });
  afterAll(async () => {
    await wipe();
    await rm(root, { recursive: true, force: true });
    await sql.end();
  });

  /** Ask for a link and pull the token out of the dev outbox. */
  let ipNo = 0;
  const linkFor = async (email: string, now?: Date) => {
    // A fresh address each time: the per-IP limit is not what these tests are about.
    await requestLoginLink(db, { email, ip: `10.0.${++ipNo}.1`, now });
    const [mail] = await db.select().from(schema.devOutbox).where(eq(schema.devOutbox.to, email.trim().toLowerCase())).orderBy(desc(schema.devOutbox.id)).limit(1);
    return decodeURIComponent(/token=([^\s]+)/.exec(mail!.body)![1]!);
  };
  const signIn = async (email: string) => {
    const s = await consumeLoginLink(db, { token: await linkFor(email) });
    return (await sessionFromId(db, s.sessionId))!;
  };

  it("indexes applicants at import without storing an email or PMDC number", async () => {
    const file = { ...sample, Table: [{ ...sample.Table[0], inductionId: IND }] };
    await proposeMeritRound(db, admin, { roundNo: 1, file, reason: "candidate index test" });
    const rows = await db.select().from(schema.candidateIdentities).where(inArray(schema.candidateIdentities.applicantId, applicants));
    expect(rows.length).toBe(applicants.length);
    const stored = JSON.stringify(rows);
    expect(stored).not.toContain("@");
    expect(stored).not.toContain("0000");
    expect(rows[0]!.emailHmac).toMatch(/^[0-9a-f]{64}$/);
  });

  it("signs in with a one-time link and links the matching record automatically", async () => {
    const token = await linkFor("  Candidate0@Example.test ");
    const s = await consumeLoginLink(db, { token, userAgent: "vitest" });
    const session = await sessionFromId(db, s.sessionId);
    expect(session).toMatchObject({ email: "candidate0@example.test", role: "candidate", isStub: false });
    expect(await myLink(db, session)).toMatchObject({ status: "verified", applicantId: "A1000", method: "email" });
    await expect(consumeLoginLink(db, { token })).rejects.toThrow("already used");
    const stored = await db.select({ h: schema.loginTokens.tokenHash }).from(schema.loginTokens).where(eq(schema.loginTokens.email, "candidate0@example.test"));
    expect(stored[0]!.h).not.toBe(token);

    const mine = (await myMerit(db, session))!;
    expect(mine.applicantId).toBe("A1000");
    expect(mine.rows.length).toBe(sample.Table5.filter((r: { applicantId: string }) => r.applicantId === "A1000").length);
    expect(mine.rows.every((r) => r.closing !== null && r.closing <= r.marks)).toBe(true);

    await endSession(db, s.sessionId);
    expect(await sessionFromId(db, s.sessionId)).toBeNull();
  });

  it("refuses expired links and rate-limits requests", async () => {
    const old = await linkFor("late-signin@test.local", new Date(Date.now() - 20 * 60_000));
    await expect(consumeLoginLink(db, { token: old })).rejects.toThrow("expired");
    await expect(consumeLoginLink(db, { token: "made-up" })).rejects.toThrow("expired");
    const sent = [];
    for (let i = 0; i < 4; i++) sent.push((await requestLoginLink(db, { email: "limit-signin@test.local" })).sent);
    expect(sent).toEqual([true, true, true, false]);
    await expect(requestLoginLink(db, { email: "nope" })).rejects.toThrow("valid email");
  });

  it("makes OWNER_EMAILS owners on first sign-in, everyone else a candidate", async () => {
    expect((await signIn("boss-signin@test.local")).role).toBe("owner");
    expect((await signIn("someone-signin@test.local")).role).toBe("candidate");
  });

  it("shows nothing of anyone's merit to an unverified account", async () => {
    const s = await signIn("stranger-signin@test.local");
    expect(await myLink(db, s)).toEqual({ status: "none" });
    expect(await myMerit(db, s)).toBeNull();
  });

  it("takes manual requests to a verifier, who approves or rejects", async () => {
    const carol = await signIn("carol-signin@test.local");
    await expect(requestLink(db, carol, { applicantId: "A1001", pmdcNo: "0000 x", evidence: new TextEncoder().encode("<html>") }, { root })).rejects.toThrow("PDF, JPG or PNG");
    await expect(requestLink(db, carol, { applicantId: "ZZ999", pmdcNo: "0000-X", evidence: PDF }, { root })).rejects.toThrow("not in any merit list");
    await requestLink(db, carol, { applicantId: "A1001", pmdcNo: "0000 x", evidence: PDF }, { root });
    await expect(requestLink(db, carol, { applicantId: "A1001", pmdcNo: "0000-X", evidence: PDF }, { root })).rejects.toThrow("already have a request");
    expect(await myLink(db, carol)).toMatchObject({ status: "pending", applicantId: "A1001" });

    await expect(listLinkRequests(db, carol)).rejects.toThrow();
    const queue = await listLinkRequests(db, verifier);
    const req = queue.pending.find((p) => p.applicantId === "A1001")!;
    expect(req).toMatchObject({ email: "carol-signin@test.local", pmdcMatches: true, evidenceType: "application/pdf" });
    expect(req.rounds.length).toBeGreaterThan(0);
    await expect(readEvidence(db, carol, req.id, { root })).rejects.toThrow();
    expect(Buffer.from((await readEvidence(db, verifier, req.id, { root })).bytes).toString()).toContain("%PDF");

    await expect(reviewLink(db, verifier, { id: req.id, decision: "approve", reason: " " })).rejects.toThrow("reason");
    expect(await reviewLink(db, verifier, { id: req.id, decision: "approve", reason: "Proof shows A1001" })).toBe("verified");
    await expect(reviewLink(db, verifier, { id: req.id, decision: "reject", reason: "again" })).rejects.toThrow("already been decided");
    expect((await myMerit(db, carol))!.applicantId).toBe("A1001");

    // The same record cannot be claimed by another account.
    const dave = await signIn("dave-signin@test.local");
    await expect(requestLink(db, dave, { applicantId: "A1001", pmdcNo: "1", evidence: PDF }, { root })).rejects.toThrow();
    await requestLink(db, dave, { applicantId: "A1002", pmdcNo: "9999-Z", evidence: PDF }, { root });
    const r2 = (await listLinkRequests(db, verifier)).pending.find((p) => p.applicantId === "A1002")!;
    expect(r2.pmdcMatches).toBe(false);
    expect(await reviewLink(db, verifier, { id: r2.id, decision: "reject", reason: "Proof is for another applicant" })).toBe("rejected");
    expect(await myLink(db, dave)).toMatchObject({ status: "rejected", reason: "Proof is for another applicant" });
    expect(await myMerit(db, dave)).toBeNull();
  });

  // Made-up CNICs, indexed from a gazette-shaped file: only their HMACs are stored.
  const [A, B, C] = [applicants[3]!, applicants[4]!, applicants[5]!];
  const CNIC = { [A]: "35202-0000003-3", [B]: "35202-0000004-4", [C]: "35202-0000005-5" };

  it("indexes CNICs from a gazette without storing them", async () => {
    const n = await indexGazette(db, { Table: [{ inductionId: IND }], Table5: Object.entries(CNIC).map(([applicantId, cnic]) => ({ applicantId, cnic, nameFull: "Test" })) });
    expect(n).toBe(3);
    const rows = await db.select().from(schema.candidateIdentities).where(inArray(schema.candidateIdentities.applicantId, [A, B, C]));
    expect(rows.every((r) => /^[0-9a-f]{64}$/.test(r.cnicHmac ?? ""))).toBe(true);
    expect(JSON.stringify(rows)).not.toMatch(/35202|0000003/);
    // The email and PMDC hashes from the merit file are kept.
    expect(rows.find((r) => r.applicantId === A)!.emailHmac).toMatch(/^[0-9a-f]{64}$/);
  });

  it("links by applicant ID and CNIC at once, and moves a record from a lost account", async () => {
    const erin = await signIn("erin-signin@test.local");
    await expect(linkByCnic(db, erin, { applicantId: A, cnic: "35202-9999999-9" })).rejects.toThrow("does not match");
    await expect(linkByCnic(db, erin, { applicantId: A, cnic: "123" })).rejects.toThrow("13 digits");
    expect(await linkByCnic(db, erin, { applicantId: A, cnic: CNIC[A]! })).toEqual({ applicantId: A, moved: false });
    expect(await myLink(db, erin)).toMatchObject({ status: "verified", applicantId: A, method: "cnic" });
    await expect(linkByCnic(db, erin, { applicantId: B, cnic: CNIC[B]! })).rejects.toThrow("already linked");

    // Erin lost that email and signs up with another: the CNIC moves the record over.
    const erin2 = await signIn("erin2-signin@test.local");
    expect(await linkByCnic(db, erin2, { applicantId: A, cnic: "3520200000033" })).toEqual({ applicantId: A, moved: true });
    expect(await myLink(db, erin2)).toMatchObject({ status: "verified", applicantId: A });
    expect((await myLink(db, erin)).status).toBe("rejected");
    const [note] = await db.select().from(schema.devOutbox).where(eq(schema.devOutbox.to, "erin-signin@test.local")).orderBy(desc(schema.devOutbox.id)).limit(1);
    expect(note!.subject).toContain("moved");
  });

  it("stops guessing after a few wrong CNICs a day", async () => {
    const fay = await signIn("fay-signin@test.local");
    for (let i = 0; i < 5; i++) await expect(linkByCnic(db, fay, { applicantId: C, cnic: `35202-111111${i}-1` })).rejects.toThrow("does not match");
    await expect(linkByCnic(db, fay, { applicantId: C, cnic: CNIC[C]! })).rejects.toThrow("Too many");
  });

  it("moves a signed-out person's account to a new email", async () => {
    const gil = await signIn("gil-signin@test.local");
    await linkByCnic(db, gil, { applicantId: B, cnic: CNIC[B]! });
    await expect(recoverAccount(db, { applicantId: B, cnic: "35202-0000009-9", newEmail: "gil-new-signin@test.local" })).rejects.toThrow("does not match");
    expect(await recoverAccount(db, { applicantId: B, cnic: CNIC[B]!, newEmail: "gil-new-signin@test.local", ip: "10.0.0.2" })).toEqual({ movedAccount: true, movedAccess: false });
    // The old session ends; the same account now signs in with the new email, still linked.
    const [old] = await db.select({ n: schema.sessions.idHash }).from(schema.sessions).where(eq(schema.sessions.userId, gil.userId));
    expect(old).toBeUndefined();
    const gilNew = await signIn("gil-new-signin@test.local");
    expect(gilNew.userId).toBe(gil.userId);
    expect(await myLink(db, gilNew)).toMatchObject({ status: "verified", applicantId: B });
  });

  it("hides what a candidate chose from other candidates, not from them or staff", async () => {
    const gil = await signIn("gil-new-signin@test.local");
    const other = await signIn("someone-signin@test.local");
    await setMyPrivacy(db, gil, { hideName: true, hidePmdc: true, hideRecord: false });
    expect(await myPrivacy(db, gil)).toEqual({ hideName: true, hidePmdc: true, hideRecord: false, allowed: ["hideName", "hidePmdc", "hideRecord"] });
    await expect(setMyPrivacy(db, other, { hideName: true, hidePmdc: false, hideRecord: false })).rejects.toThrow("Link your merit record");
    const row = [{ applicantId: B, name: "Gil", pmdcNo: "1-P" }];
    expect(masked(row, await privacyMask(db, other))[0]).toMatchObject({ name: null, pmdcNo: null, nameHidden: true });
    expect(masked(row, await privacyMask(db, gil))[0]).toEqual(row[0]);
    expect(masked(row, await privacyMask(db, verifier))[0]).toEqual(row[0]);

    // The owner turns "hide my name" off: names show again, the switch leaves Me, the choice is kept.
    const [kept] = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, "features"));
    try {
      await setFeatures(db, admin, { flags: { hideName: false }, reason: "privacy switch test" });
      expect(masked(row, await privacyMask(db, other))[0]).toMatchObject({ name: "Gil", pmdcNo: null });
      expect(await myPrivacy(db, gil)).toMatchObject({ hideName: true, allowed: ["hidePmdc", "hideRecord"] });
      await setMyPrivacy(db, gil, { hideName: false, hidePmdc: false });
      expect(await myPrivacy(db, gil)).toMatchObject({ hideName: true, hidePmdc: false });
      await setFeatures(db, admin, { flags: { hideName: true }, reason: "privacy switch test" });
      expect(masked(row, await privacyMask(db, other))[0]).toMatchObject({ name: null, nameHidden: true });
    } finally {
      await db.delete(schema.appSettings).where(eq(schema.appSettings.key, "features"));
      if (kept) await db.insert(schema.appSettings).values(kept);
    }
    await db.delete(schema.candidatePrivacy).where(eq(schema.candidatePrivacy.applicantId, B));
  });
});
