import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, inArray, like } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "@/lib/auth/roles";
import { createList } from "@/lib/data/preferences";
import { applyRetention, backupStatus, featureFlags, loadRetention, mailStatus, retentionIfDue, retentionPreview, sendTestEmail, setFeatures, setRetention } from "@/lib/data/settings";
import { ensureUser } from "@/lib/data/users";
import * as schema from "@/lib/db/schema";

/** DISPOSABLE database only (TEST_DATABASE_URL). Rewrites app_settings; uses *@settings.test emails. */
const url = process.env.TEST_DATABASE_URL;
const owner: Session = { userId: "st-o", email: "owner@settings.test", role: "owner", isStub: false };
const editor: Session = { userId: "st-e", email: "editor@settings.test", role: "data_editor", isStub: false };
const candidate: Session = { userId: "st-c", email: "cand@settings.test", role: "candidate", isStub: false };
const days = (n: number) => new Date(Date.now() - n * 86_400_000);

describe.skipIf(!url)("workspace settings (integration)", () => {
  const sql = postgres(url ?? "postgres://unused", { max: 2, onnotice: () => {} });
  const db = drizzle(sql, { schema });
  const root = mkdtempSync(path.join(tmpdir(), "mn-settings-"));

  const wipe = async () => {
    await db.delete(schema.appSettings);
    const us = await db.select({ id: schema.users.id }).from(schema.users).where(like(schema.users.email, "%@settings.test"));
    if (us.length) {
      await db.delete(schema.candidateLinks).where(inArray(schema.candidateLinks.userId, us.map((u) => u.id)));
      await db.delete(schema.users).where(inArray(schema.users.id, us.map((u) => u.id)));
    }
    await db.delete(schema.loginTokens).where(like(schema.loginTokens.email, "%@settings.test"));
    await db.delete(schema.devOutbox).where(like(schema.devOutbox.to, "%@settings.test"));
  };
  beforeAll(wipe);
  afterAll(async () => {
    await wipe();
    await sql.end();
    rmSync(root, { recursive: true, force: true });
  });

  it("switches features off for candidates only, and only owners can", async () => {
    expect(await featureFlags(db, candidate)).toEqual({ community: true, calculator: true, planner: true, simulation: true });
    await expect(setFeatures(db, editor, { flags: { planner: false }, reason: "x" })).rejects.toThrow("forbidden");
    await expect(setFeatures(db, owner, { flags: { planner: false }, reason: " " })).rejects.toThrow(/reason/);
    await setFeatures(db, owner, { flags: { planner: false, nonsense: true } as never, reason: "result week" });
    expect((await featureFlags(db, candidate)).planner).toBe(false);
    await expect(createList(db, candidate, { name: "Plan", program: "FCPS", quota: "Open Merit" })).rejects.toThrow(/switched off/);
    // Staff keep access, to try it before switching it back on.
    expect((await createList(db, editor, { name: "Plan", program: "FCPS", quota: "Open Merit" })).id).toBeTruthy();
    await setFeatures(db, owner, { flags: { planner: true }, reason: "back on" });
    const [audit] = await db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "settings.features")).orderBy(schema.auditLog.id).limit(1);
    expect(audit).toMatchObject({ actorEmail: "owner@settings.test", reason: "result week" });
  });

  it("removes only what is past its retention period, and evidence files with it", async () => {
    await expect(setRetention(db, owner, { days: { signInLinks: 0 }, reason: "x" })).rejects.toThrow(/between 1 and 365/);
    await setRetention(db, owner, { days: { signInLinks: 3, evidence: 30 }, reason: "shorter" });
    expect((await loadRetention(db)).days).toMatchObject({ signInLinks: 3, evidence: 30, sessions: 30 });

    await db.insert(schema.loginTokens).values([
      { tokenHash: "st-old", email: "a@settings.test", expiresAt: days(10) },
      { tokenHash: "st-new", email: "b@settings.test", expiresAt: days(1) },
      { tokenHash: "st-live", email: "c@settings.test", expiresAt: days(-1) },
    ]);
    await db.insert(schema.devOutbox).values([{ to: "a@settings.test", subject: "s", body: "b", createdAt: days(30) }]);
    const u = await ensureUser(db, candidate);
    const evDir = path.join(root, "evidence");
    mkdirSync(evDir, { recursive: true });
    writeFileSync(path.join(evDir, "old.pdf"), "x");
    writeFileSync(path.join(evDir, "recent.pdf"), "x");
    await db.insert(schema.candidateLinks).values([
      { userId: u.id, applicantId: "st-1", status: "rejected", method: "manual", evidenceFile: "old.pdf", evidenceType: "application/pdf", reviewedAt: days(60), reviewedBy: "v", reason: "no" },
      { userId: u.id, applicantId: "st-2", status: "pending", method: "manual", evidenceFile: "recent.pdf", evidenceType: "application/pdf" },
    ]);

    const preview = await retentionPreview(db, owner);
    expect(preview.signInLinks).toBeGreaterThanOrEqual(1);
    expect(preview.evidence).toBe(1);
    await expect(applyRetention(db, editor, { reason: "x" }, { root })).rejects.toThrow("forbidden");
    const r = await applyRetention(db, owner, { reason: "clean-up" }, { root });
    expect(r.evidence).toBe(1);
    const left = await db.select({ h: schema.loginTokens.tokenHash }).from(schema.loginTokens).where(like(schema.loginTokens.email, "%@settings.test"));
    expect(left.map((x) => x.h).sort()).toEqual(["st-live", "st-new"]);
    expect(existsSync(path.join(evDir, "old.pdf"))).toBe(false);
    expect(existsSync(path.join(evDir, "recent.pdf"))).toBe(true);
    const links = await db.select().from(schema.candidateLinks).where(eq(schema.candidateLinks.userId, u.id));
    expect(links.find((l) => l.applicantId === "st-1")).toMatchObject({ status: "rejected", evidenceFile: null, reason: "no" });
    // Ran just now, so the daily run waits; the periods survive the run.
    expect(await retentionIfDue(db)).toBe(false);
    expect((await loadRetention(db)).days.signInLinks).toBe(3);
  });

  it("reports backups from the backups folder", async () => {
    const dir = path.join(root, "backups");
    expect((await backupStatus(owner, { dir })).state).toBe("unreadable");
    mkdirSync(dir);
    expect((await backupStatus(owner, { dir })).state).toBe("missing");
    const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
    mkdirSync(path.join(dir, `meritnama-${stamp(days(3))}`));
    writeFileSync(path.join(dir, `meritnama-${stamp(days(3))}`, "database.dump"), "x".repeat(2048));
    mkdirSync(path.join(dir, "not-a-backup"));
    expect((await backupStatus(owner, { dir })).state).toBe("stale");
    const fresh = path.join(dir, `meritnama-${stamp(new Date())}`);
    mkdirSync(fresh);
    for (const f of ["database.dump", "storage.tar.gz", "SHA256SUMS"]) writeFileSync(path.join(fresh, f), "y");
    const s = await backupStatus(owner, { dir });
    expect(s.state).toBe("ok");
    expect(s.backups).toHaveLength(2);
    expect(s.backups[0]).toMatchObject({ database: true, storage: true, checksums: true, bytes: 3 });
    await expect(backupStatus(editor, { dir })).rejects.toThrow("forbidden");
  });

  it("sends a test email to the owner (dev mailbox without SMTP) and shows no password", async () => {
    await expect(sendTestEmail(db, editor)).rejects.toThrow("forbidden");
    const before = await db.select().from(schema.devOutbox).where(eq(schema.devOutbox.to, owner.email));
    expect(await sendTestEmail(db, owner)).toEqual({ to: owner.email });
    const after = await db.select().from(schema.devOutbox).where(eq(schema.devOutbox.to, owner.email));
    expect(after.length).toBe(before.length + 1);
    expect(after.at(-1)!.subject).toBe("meritNAMA test email");
    const st = await mailStatus(owner);
    expect(JSON.stringify(st)).not.toMatch(/password/i);
    await db.delete(schema.devOutbox).where(eq(schema.devOutbox.to, owner.email));
  });

  it("keeps round-day posts and removes old members' room messages", async () => {
    const me = await ensureUser(db, owner);
    const old = new Date(Date.now() - 800 * 86_400_000);
    await db.insert(schema.roundRoomMessages).values([
      { induction: 977, roundNo: 1, authorId: me.id, kind: "message", body: "old", createdAt: old },
      { induction: 977, roundNo: 1, authorId: null, kind: "system", body: "round day", createdAt: old },
      { induction: 977, roundNo: 1, authorId: me.id, kind: "message", body: "new" },
    ]);
    expect((await retentionPreview(db, owner)).roomMessages).toBeGreaterThanOrEqual(1);
    await applyRetention(db, owner, { reason: "test room retention" });
    const left = await db.select({ body: schema.roundRoomMessages.body }).from(schema.roundRoomMessages).where(eq(schema.roundRoomMessages.induction, 977));
    expect(left.map((r) => r.body).sort()).toEqual(["new", "round day"]);
    await db.delete(schema.roundRoomMessages).where(eq(schema.roundRoomMessages.induction, 977));
  });
});
