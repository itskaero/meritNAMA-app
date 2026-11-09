import "server-only";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { assertCan, type Session } from "@/lib/auth/roles";
import type { Database } from "@/lib/db/client";
import { follows, hospitals, savedViews, specialities } from "@/lib/db/schema";
import { UserFacingError } from "@/lib/errors";
import { ensureUser } from "./users";

/** A member's own workspace: saved views and the hospitals and specialities they follow. */

export const SAVED_VIEWS_MAX = 50;

const viewSchema = z.object({
  label: z.string().trim().min(1, "Give the view a name").max(80),
  // Only pages of the portal, with their query: never another site, never the admin workspace.
  href: z.string().trim().max(500).regex(/^\/portal\/[A-Za-z0-9/_\-]*(\?[^#\s<>"]*)?$/, "Only portal pages can be saved"),
});

export async function listSavedViews(db: Database, session: Session | null) {
  assertCan(session, "portal");
  const me = await ensureUser(db, session);
  return db.select({ id: savedViews.id, label: savedViews.label, href: savedViews.href, createdAt: savedViews.createdAt })
    .from(savedViews).where(eq(savedViews.userId, me.id)).orderBy(desc(savedViews.createdAt));
}

/** Save a page (or rename it, when already saved). */
export async function saveView(db: Database, session: Session | null, input: { label: string; href: string }) {
  assertCan(session, "portal");
  const v = viewSchema.parse(input);
  const me = await ensureUser(db, session);
  const [n] = await db.select({ n: count() }).from(savedViews).where(eq(savedViews.userId, me.id));
  const [existing] = await db.select({ id: savedViews.id }).from(savedViews).where(and(eq(savedViews.userId, me.id), eq(savedViews.href, v.href))).limit(1);
  if (!existing && (n?.n ?? 0) >= SAVED_VIEWS_MAX) throw new UserFacingError(`You can keep ${SAVED_VIEWS_MAX} saved views. Remove one first.`);
  await db.insert(savedViews).values({ userId: me.id, label: v.label, href: v.href })
    .onConflictDoUpdate({ target: [savedViews.userId, savedViews.href], set: { label: v.label } });
}

export async function deleteView(db: Database, session: Session | null, id: string) {
  assertCan(session, "portal");
  const me = await ensureUser(db, session);
  await db.delete(savedViews).where(and(eq(savedViews.id, id), eq(savedViews.userId, me.id)));
}

/** Hospitals and specialities the member follows, by name. */
export async function followedPlaces(db: Database, session: Session | null) {
  assertCan(session, "portal");
  const me = await ensureUser(db, session);
  const rows = await db.select({ kind: follows.kind, key: follows.key }).from(follows)
    .where(and(eq(follows.userId, me.id), inArray(follows.kind, ["hospital", "speciality"])));
  const ids = (k: string) => rows.filter((r) => r.kind === k).map((r) => Number(r.key)).filter(Number.isInteger);
  const [h, s] = await Promise.all([
    ids("hospital").length ? db.select({ id: hospitals.id, name: hospitals.name }).from(hospitals).where(inArray(hospitals.id, ids("hospital"))) : [],
    ids("speciality").length ? db.select({ id: specialities.id, name: specialities.name }).from(specialities).where(inArray(specialities.id, ids("speciality"))) : [],
  ]);
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  return { hospitals: [...h].sort(byName), specialities: [...s].sort(byName) };
}
