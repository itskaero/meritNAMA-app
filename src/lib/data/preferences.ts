import "server-only";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { assertCan, type Session } from "@/lib/auth/roles";
import type { Database } from "@/lib/db/client";
import { preferenceItems, preferenceLists } from "@/lib/db/schema";
import { analyseList, LIST_LIMITS, outcomeSummary, type PlannedItem } from "@/lib/domain/preferences";
import { UserFacingError } from "@/lib/errors";
import { isUuid } from "@/lib/format";
import { myMerit } from "./candidates";
import { computeOptions, finderOptions, listShortlist } from "./finder";
import { inductionRunning, predictRound } from "./predictions";
import type { Db } from "./shared";
import { ensureUser } from "./users";

/**
 * Preference lists: private drafts of a member's PHF preferences for one programme
 * and quota. Every read and write is limited to the signed-in member's own lists.
 */

const nameSchema = z.string().trim().min(1, "Give the list a name").max(LIST_LIMITS.name, `At most ${LIST_LIMITS.name} characters`);
const textSchema = z.string().trim().min(1).max(200);

async function ownList(db: Db, session: Session, id: string) {
  if (!isUuid(id)) throw new UserFacingError("That list does not exist.");
  const me = await ensureUser(db, session);
  const [l] = await db.select().from(preferenceLists).where(and(eq(preferenceLists.id, id), eq(preferenceLists.userId, me.id))).limit(1);
  if (!l) throw new UserFacingError("That list does not exist.");
  return l;
}

const touch = (db: Db, id: string) => db.update(preferenceLists).set({ updatedAt: new Date() }).where(eq(preferenceLists.id, id));

async function nameTaken(db: Db, userId: string, name: string, exceptId?: string) {
  const [x] = await db.select({ id: preferenceLists.id }).from(preferenceLists)
    .where(and(eq(preferenceLists.userId, userId), sql`lower(${preferenceLists.name}) = lower(${name})`, exceptId ? sql`${preferenceLists.id} <> ${exceptId}` : undefined)).limit(1);
  return Boolean(x);
}

export async function listMyLists(db: Database, session: Session | null) {
  assertCan(session, "portal");
  const me = await ensureUser(db, session);
  return db.select({
    id: preferenceLists.id, name: preferenceLists.name, program: preferenceLists.program, quota: preferenceLists.quota, updatedAt: preferenceLists.updatedAt,
    items: sql<number>`(select count(*) from ${preferenceItems} i where i.list_id = ${preferenceLists.id})`.mapWith(Number),
  }).from(preferenceLists).where(eq(preferenceLists.userId, me.id)).orderBy(desc(preferenceLists.updatedAt));
}

export async function createList(db: Database, session: Session | null, input: { name: string; program: string; quota: string; fromShortlist?: boolean }) {
  assertCan(session, "portal");
  const name = nameSchema.parse(input.name), program = textSchema.parse(input.program), quota = textSchema.parse(input.quota);
  const shortlist = input.fromShortlist ? (await listShortlist(db, session)).filter((s) => s.program === program && s.quota === quota) : [];
  return db.transaction(async (tx) => {
    const me = await ensureUser(tx, session);
    const [{ n }] = (await tx.select({ n: count() }).from(preferenceLists).where(eq(preferenceLists.userId, me.id))) as [{ n: number }];
    if (n >= LIST_LIMITS.lists) throw new UserFacingError(`You can keep up to ${LIST_LIMITS.lists} lists. Delete one first.`);
    if (await nameTaken(tx, me.id, name)) throw new UserFacingError("You already have a list with that name.");
    const [l] = await tx.insert(preferenceLists).values({ userId: me.id, name, program, quota }).returning({ id: preferenceLists.id });
    if (shortlist.length) {
      await tx.insert(preferenceItems).values(shortlist.slice(0, LIST_LIMITS.items).map((s, i) => ({ listId: l!.id, position: i + 1, speciality: s.speciality, hospital: s.hospital })));
    }
    return { id: l!.id, items: Math.min(shortlist.length, LIST_LIMITS.items) };
  });
}

export async function renameList(db: Database, session: Session | null, input: { id: string; name: string }) {
  assertCan(session, "portal");
  const name = nameSchema.parse(input.name);
  return db.transaction(async (tx) => {
    const l = await ownList(tx, session, input.id);
    if (await nameTaken(tx, l.userId, name, l.id)) throw new UserFacingError("You already have a list with that name.");
    await tx.update(preferenceLists).set({ name, updatedAt: new Date() }).where(eq(preferenceLists.id, l.id));
  });
}

export async function duplicateList(db: Database, session: Session | null, id: string) {
  assertCan(session, "portal");
  return db.transaction(async (tx) => {
    const l = await ownList(tx, session, id);
    const [{ n }] = (await tx.select({ n: count() }).from(preferenceLists).where(eq(preferenceLists.userId, l.userId))) as [{ n: number }];
    if (n >= LIST_LIMITS.lists) throw new UserFacingError(`You can keep up to ${LIST_LIMITS.lists} lists. Delete one first.`);
    let name = `Copy of ${l.name}`.slice(0, LIST_LIMITS.name);
    for (let i = 2; await nameTaken(tx, l.userId, name); i++) name = `Copy ${i} of ${l.name}`.slice(0, LIST_LIMITS.name);
    const [copy] = await tx.insert(preferenceLists).values({ userId: l.userId, name, program: l.program, quota: l.quota, marks: l.marks, total: l.total }).returning({ id: preferenceLists.id });
    const items = await tx.select().from(preferenceItems).where(eq(preferenceItems.listId, l.id));
    if (items.length) await tx.insert(preferenceItems).values(items.map((i) => ({ ...i, listId: copy!.id })));
    return { id: copy!.id, name };
  });
}

export async function deleteList(db: Database, session: Session | null, id: string) {
  assertCan(session, "portal");
  return db.transaction(async (tx) => {
    const l = await ownList(tx, session, id);
    await tx.delete(preferenceLists).where(eq(preferenceLists.id, l.id));
  });
}

export async function setListMarks(db: Database, session: Session | null, input: { id: string; marks: number | null; total: number | null }) {
  assertCan(session, "portal");
  if (input.marks !== null && (!(input.marks >= 0) || !(input.total && input.total > 0) || input.marks > input.total)) {
    throw new UserFacingError("Enter your marks and the total they are out of (marks cannot be more than the total).");
  }
  return db.transaction(async (tx) => {
    const l = await ownList(tx, session, input.id);
    await tx.update(preferenceLists).set({ marks: input.marks, total: input.marks === null ? null : input.total, updatedAt: new Date() }).where(eq(preferenceLists.id, l.id));
  });
}

export async function addItem(db: Database, session: Session | null, input: { id: string; speciality: string; hospital: string }) {
  assertCan(session, "portal");
  const speciality = textSchema.parse(input.speciality), hospital = textSchema.parse(input.hospital);
  return db.transaction(async (tx) => {
    const l = await ownList(tx, session, input.id);
    const items = await tx.select({ s: preferenceItems.speciality, h: preferenceItems.hospital, p: preferenceItems.position }).from(preferenceItems).where(eq(preferenceItems.listId, l.id));
    if (items.some((i) => i.s === speciality && i.h === hospital)) throw new UserFacingError("That option is already on this list.");
    if (items.length >= LIST_LIMITS.items) throw new UserFacingError(`A list can hold up to ${LIST_LIMITS.items} options.`);
    const position = Math.max(0, ...items.map((i) => i.p)) + 1;
    await tx.insert(preferenceItems).values({ listId: l.id, position, speciality, hospital });
    await touch(tx, l.id);
    return { position };
  });
}

/** Write a new order: `order` must name exactly the list's current options. */
async function writeOrder(tx: Db, listId: string, order: [string, string][]) {
  const current = await tx.select().from(preferenceItems).where(eq(preferenceItems.listId, listId));
  const key = (s: string, h: string) => `${s}\u0000${h}`;
  const byKey = new Map(current.map((i) => [key(i.speciality, i.hospital), i]));
  const wanted = order.map(([s, h]) => key(s, h));
  if (wanted.length !== current.length || new Set(wanted).size !== wanted.length || wanted.some((k) => !byKey.has(k))) {
    throw new UserFacingError("The list changed in another tab. Reload and try again.");
  }
  await tx.delete(preferenceItems).where(eq(preferenceItems.listId, listId));
  if (order.length) await tx.insert(preferenceItems).values(wanted.map((k, i) => ({ ...byKey.get(k)!, position: i + 1 })));
  await touch(tx, listId);
}

export async function reorderList(db: Database, session: Session | null, input: { id: string; order: [string, string][] }) {
  assertCan(session, "portal");
  return db.transaction(async (tx) => {
    const l = await ownList(tx, session, input.id);
    await writeOrder(tx, l.id, input.order);
  });
}

export async function removeItem(db: Database, session: Session | null, input: { id: string; speciality: string; hospital: string }) {
  assertCan(session, "portal");
  return db.transaction(async (tx) => {
    const l = await ownList(tx, session, input.id);
    const rest = (await tx.select().from(preferenceItems).where(eq(preferenceItems.listId, l.id)).orderBy(asc(preferenceItems.position)))
      .filter((i) => !(i.speciality === input.speciality && i.hospital === input.hospital));
    await tx.delete(preferenceItems).where(eq(preferenceItems.listId, l.id));
    if (rest.length) await tx.insert(preferenceItems).values(rest.map((i, n) => ({ ...i, position: n + 1 })));
    await touch(tx, l.id);
  });
}

/** The latest induction that has this programme · quota and a known total. */
async function latestFor(db: Database, session: Session, program: string, quota: string) {
  const opts = await finderOptions(db, session);
  return opts.inductions.find((i) => i.tracks.some((t) => t.program === program && t.quota === quota)) ?? null;
}

/** Every speciality × hospital offered for this programme · quota in its latest induction, for the "add" search. */
export async function optionsForTrack(db: Database, session: Session | null, input: { program: string; quota: string }) {
  assertCan(session, "portal");
  const ind = await latestFor(db, session, input.program, input.quota);
  if (!ind) return { induction: null, options: [] };
  const r = await computeOptions(db, { induction: ind.id, program: input.program, quota: input.quota, marks: 0, total: ind.total });
  return { induction: ind.id, options: r.options.map((o) => ({ speciality: o.speciality, hospital: o.hospital })).sort((a, b) => a.speciality.localeCompare(b.speciality) || a.hospital.localeCompare(b.hospital)) };
}

/**
 * A list with every option checked against the latest induction: status for the
 * marks (the list's own, else the verified record's), closing merit, and the
 * predicted next-round range while that induction runs. Plus the analysis.
 */
export async function getList(db: Database, session: Session | null, id: string) {
  assertCan(session, "portal");
  const l = await ownList(db, session, id);
  const items = await db.select().from(preferenceItems).where(eq(preferenceItems.listId, l.id)).orderBy(asc(preferenceItems.position));
  const ind = await latestFor(db, session, l.program, l.quota);

  let marks = l.marks, total = l.total, marksFrom: "list" | "record" | null = marks !== null ? "list" : null;
  if (marks === null) {
    const own = (await myMerit(db, session).catch(() => null))?.rows[0];
    const opts = own ? await finderOptions(db, session) : null;
    const ownTotal = own ? opts?.inductions.find((i) => i.id === own.induction)?.total : undefined;
    if (own && ownTotal) [marks, total, marksFrom] = [own.marks, ownTotal, "record"];
  }
  const hasMarks = marks !== null && total !== null;
  const computed = ind ? await computeOptions(db, { induction: ind.id, program: l.program, quota: l.quota, marks: hasMarks ? marks! : 0, total: hasMarks ? total! : ind.total }) : null;
  const byKey = new Map((computed?.options ?? []).map((o) => [`${o.speciality}|${o.hospital}`, o]));
  const ahead = ind && (await inductionRunning(db, ind.id))
    ? await predictRound(db, session, { induction: ind.id, fromRound: Math.max(...(computed?.options ?? []).map((o) => o.lastRound), 1), track: `${l.program}|${l.quota}` })
    : null;

  const rows = items.map((i) => {
    const o = byKey.get(`${i.speciality}|${i.hospital}`);
    const band = ahead?.hospitals.get(`${l.program}|${l.quota}|${i.speciality}|${i.hospital}`) ?? null;
    return {
      position: i.position, speciality: i.speciality, hospital: i.hospital, note: i.note,
      offered: Boolean(o), status: o && hasMarks ? o.status : null,
      firstPct: o?.firstPct ?? null, lastPct: o?.lastPct ?? null, lastClosing: o?.lastClosing ?? null, firstRound: o?.firstRound ?? null, lastRound: o?.lastRound ?? null,
      predicted: band && ind ? { low: band.low, high: band.high, confidence: band.confidence, n: band.n, fallback: band.fallback } : null,
    };
  });
  const planned: PlannedItem[] = rows.map((r) => ({ position: r.position, speciality: r.speciality, hospital: r.hospital, status: r.status, offered: r.offered }));
  const analysis = analyseList(planned, { hasMarks, induction: ind?.id ?? null });
  const onList = new Set(items.map((i) => `${i.speciality}|${i.hospital}`));
  const shortlisted = new Set((await listShortlist(db, session)).filter((x) => x.program === l.program && x.quota === l.quota).map((x) => `${x.speciality}|${x.hospital}`));
  const options = (computed?.options ?? []).map((o) => ({
    speciality: o.speciality, hospital: o.hospital, status: hasMarks ? o.status : null, lastPct: o.lastPct,
    shortlisted: shortlisted.has(`${o.speciality}|${o.hospital}`), onList: onList.has(`${o.speciality}|${o.hospital}`),
  })).sort((a, b) => a.speciality.localeCompare(b.speciality) || a.hospital.localeCompare(b.hospital));
  return {
    options,
    list: { id: l.id, name: l.name, program: l.program, quota: l.quota, updatedAt: l.updatedAt },
    marks: hasMarks ? { marks: marks!, total: total!, from: marksFrom!, pct: computed?.mePct ?? null } : null,
    induction: ind ? { id: ind.id, total: ind.total } : null,
    rows,
    analysis,
    summary: outcomeSummary(analysis, planned),
  };
}

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  // Quote, and defuse spreadsheet formulas.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export async function exportListCsv(db: Database, session: Session | null, id: string) {
  const v = await getList(db, session, id);
  const head = ["position", "speciality", "hospital", "status", "last closing %", "likely next round"];
  const lines = v.rows.map((r) => [r.position, r.speciality, r.hospital, r.status ?? "", r.lastPct == null ? "" : r.lastPct.toFixed(1), r.predicted ? `${r.predicted.low.toFixed(2)}-${r.predicted.high.toFixed(2)}` : ""].map(csvCell).join(","));
  return { name: v.list.name, csv: [head.join(","), ...lines].join("\n") + "\n" };
}
