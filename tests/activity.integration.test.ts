import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, inArray, like } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "@/lib/auth/roles";
import * as schema from "@/lib/db/schema";

const { activityOverview, appendReplay, pruneReplays, readReplay, recordVisit, traceWatermark, userActivity, watermarkCode } = await import("@/lib/data/activity-log");
const { ensureUser } = await import("@/lib/data/users");

/**
 * The owner's activity log, replays and watermark, against a DISPOSABLE database
 * (TEST_DATABASE_URL). Uses *-activity@test.local users.
 */
const url = process.env.TEST_DATABASE_URL;
const owner: Session = { userId: "s-owner", email: "owner-activity@test.local", role: "owner", isStub: false };
const cand: Session = { userId: "s-cand", email: "cand-activity@test.local", role: "candidate", isStub: false };
const other: Session = { userId: "s-other", email: "other-activity@test.local", role: "candidate", isStub: false };
const editor: Session = { userId: "s-ed", email: "editor-activity@test.local", role: "data_editor", isStub: false };
const PHONE = "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36";
const LAPTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

describe.skipIf(!url)("activity log (integration)", () => {
  const sql = postgres(url ?? "postgres://unused", { max: 2, onnotice: () => {} });
  const db = drizzle(sql, { schema });
  let root = "";
  const wipe = () => db.delete(schema.users).where(like(schema.users.email, "%-activity@test.local"));

  beforeAll(async () => { await wipe(); root = await mkdtemp(path.join(os.tmpdir(), "mn-replays-")); });
  afterAll(async () => { await wipe(); await rm(root, { recursive: true, force: true }); await sql.end(); });

  it("logs candidates' pages with a device and hashed network, never team members", async () => {
    await recordVisit(db, cand, { path: "/portal/finder", sessionHash: "s1", userAgent: PHONE, ip: "39.45.12.200" });
    await recordVisit(db, cand, { path: "//evil.example", sessionHash: "s1", userAgent: PHONE, ip: "39.45.12.200" });
    await recordVisit(db, editor, { path: "/portal", sessionHash: "s9", userAgent: LAPTOP, ip: "1.1.1.1" });
    const me = await ensureUser(db, cand);
    const rows = await db.select().from(schema.pageVisits).where(eq(schema.pageVisits.userId, me.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ path: "/portal/finder", device: "Phone · Android · Chrome" });
    expect(JSON.stringify(rows)).not.toContain("39.45");
    const ed = await ensureUser(db, editor);
    expect(await db.select().from(schema.pageVisits).where(eq(schema.pageVisits.userId, ed.id))).toHaveLength(0);
  });

  it("flags two devices on two networks at once, and shows it only to the owner", async () => {
    await recordVisit(db, cand, { path: "/portal/candidates", sessionHash: "s2", userAgent: LAPTOP, ip: "182.180.4.9" });
    await expect(activityOverview(db, editor)).rejects.toThrow();
    const o = await activityOverview(db, owner);
    const me = await ensureUser(db, cand);
    expect(o.online.some((u) => u.userId === me.id)).toBe(true);
    expect(o.flagged.find((f) => f.userId === me.id)?.signals[0]?.level).toBe("strong");
    const a = (await userActivity(db, owner, me.id))!;
    expect(a.devices.map((d) => d.device).sort()).toEqual(["Computer · Windows · Chrome", "Phone · Android · Chrome"]);
    expect(a.visits[0]!.net).toMatch(/^Network \d$/);
  });

  it("stores replays as gzip batches that only the owner reads back, in order", async () => {
    const id = crypto.randomUUID();
    const batch = (n: number) => JSON.stringify([{ type: n === 0 ? 4 : 3, timestamp: 1000 + n, data: { n } }, { type: 2, timestamp: 1001 + n, data: {} }]);
    expect(await appendReplay(db, cand, { id, path: "/portal", count: 2, events: batch(0), sessionHash: "s1", userAgent: PHONE, ip: null }, { root })).toEqual({ stop: false });
    await appendReplay(db, cand, { id, path: "/portal", count: 2, events: batch(10), sessionHash: "s1", userAgent: PHONE, ip: null }, { root });
    await expect(appendReplay(db, other, { id, path: "/x", count: 1, events: "[]", sessionHash: null, userAgent: null, ip: null }, { root })).rejects.toThrow("forbidden");
    expect((await appendReplay(db, editor, { id: crypto.randomUUID(), path: "/x", count: 1, events: "[]", sessionHash: null, userAgent: null, ip: null }, { root })).stop).toBe(true);
    await expect(readReplay(db, editor, id, { root })).rejects.toThrow();
    const r = (await readReplay(db, owner, id, { root }))!;
    expect(r.events.map((e) => (e as { timestamp: number }).timestamp)).toEqual([1000, 1001, 1010, 1011]);
    expect(r.meta.events).toBe(4);

    // Retention removes the row and its file.
    expect(await pruneReplays(db, new Date(Date.now() + 60_000), { root })).toBeGreaterThanOrEqual(1);
    const left = (await readdir(root, { recursive: true })).filter((f) => f.endsWith(".gz"));
    expect(left).toHaveLength(0);
  });

  it("traces a watermark code back to its account", async () => {
    const me = await ensureUser(db, cand);
    const code = watermarkCode(me.id);
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect((await traceWatermark(db, owner, code.toLowerCase()))?.id).toBe(me.id);
    await expect(traceWatermark(db, editor, code)).rejects.toThrow();
    await expect(traceWatermark(db, owner, "abc")).rejects.toThrow("6-character");
  });

  it("cascades with the account", async () => {
    const me = await ensureUser(db, cand);
    await db.delete(schema.users).where(inArray(schema.users.id, [me.id]));
    expect(await db.select().from(schema.pageVisits).where(eq(schema.pageVisits.userId, me.id))).toHaveLength(0);
  });
});
