import "server-only";
import { eq, or, sql, type AnyColumn } from "drizzle-orm";
import { assertCan, isStaff, type Session } from "@/lib/auth/roles";
import type { Database } from "@/lib/db/client";
import { candidatePrivacy } from "@/lib/db/schema";
import { PRIVACY_SWITCHES, type FeatureFlags, type PrivacySwitch } from "@/lib/domain/settings";
import { UserFacingError } from "@/lib/errors";
import { verifiedApplicant } from "./candidates";
import { loadFeatures } from "./settings";
import { writeAudit, type Db } from "./shared";
import { ensureUser } from "./users";

/**
 * What a linked candidate hides from other candidates: their name, their PMDC number, and
 * their record notes (verification remarks and corrections). Preferences, marks and seats
 * stay: the lists and estimates are built from them. Staff, and the candidate, see it all.
 * Each switch only exists while the owner has it on (Admin → Settings → Candidate features);
 * switched off, nothing is hidden by it and candidates do not see it, but their choice is kept.
 */

export type Privacy = { hideName: boolean; hidePmdc: boolean; hideRecord: boolean };
export const OPEN: Privacy = { hideName: false, hidePmdc: false, hideRecord: false };

/** The rules for one viewer: what to hide of each applicant id. */
export type Mask = (applicantId: string) => Privacy;

/** Which privacy switches the owner allows right now. */
async function allowed(db: Db): Promise<Record<PrivacySwitch, boolean>> {
  const f = await loadFeatures(db as Database);
  return { hideName: f.hideName, hidePmdc: f.hidePmdc, hideRecord: f.hideRecord };
}

export async function privacyMask(db: Db, session: Session | null): Promise<Mask> {
  if (!session || isStaff(session)) return () => OPEN;
  const ok = await allowed(db);
  if (!ok.hideName && !ok.hidePmdc && !ok.hideRecord) return () => OPEN;
  const rows = await db.select().from(candidatePrivacy).where(or(candidatePrivacy.hideName, candidatePrivacy.hidePmdc, candidatePrivacy.hideRecord));
  if (!rows.length) return () => OPEN;
  const me = await verifiedApplicant(db, (await ensureUser(db, session)).id);
  const by = new Map(rows.map((r) => [r.applicantId, { hideName: ok.hideName && r.hideName, hidePmdc: ok.hidePmdc && r.hidePmdc, hideRecord: ok.hideRecord && r.hideRecord }]));
  return (id) => (id === me ? OPEN : by.get(id) ?? OPEN);
}

/** Rows with an applicant id and a published name / PMDC number, masked for this viewer. */
export function masked<T extends { applicantId: string; name?: string | null; pmdcNo?: string | null }>(rows: T[], mask: Mask): (T & { nameHidden?: boolean })[] {
  return rows.map((r) => {
    const p = mask(r.applicantId);
    if (!p.hideName && !p.hidePmdc) return r;
    return { ...r, ...(p.hideName && "name" in r ? { name: null, nameHidden: true } : {}), ...(p.hidePmdc && "pmdcNo" in r ? { pmdcNo: null } : {}) };
  });
}

/**
 * SQL: this applicant has not hidden the field (for name and PMDC searches). Staff see
 * everyone; with the switch off nobody is hidden. `flags` are loadFeatures()'s.
 */
export function notHiddenSql(session: Session | null, applicantId: AnyColumn, field: "name" | "pmdc", flags: Pick<FeatureFlags, "hideName" | "hidePmdc">) {
  if (isStaff(session) || !(field === "name" ? flags.hideName : flags.hidePmdc)) return undefined;
  const col = field === "name" ? sql.raw("hide_name") : sql.raw("hide_pmdc");
  return sql`not exists (select 1 from candidate_privacy p where p.applicant_id = ${applicantId}::text and p.${col})`;
}

/**
 * The signed-in candidate's own choices, and which switches they get. Null when not linked.
 */
export async function myPrivacy(db: Db, session: Session | null): Promise<(Privacy & { allowed: PrivacySwitch[] }) | null> {
  assertCan(session, "portal");
  const me = await verifiedApplicant(db, (await ensureUser(db, session)).id);
  if (!me) return null;
  const ok = await allowed(db);
  const [r] = await db.select().from(candidatePrivacy).where(eq(candidatePrivacy.applicantId, me)).limit(1);
  return { ...(r ? { hideName: r.hideName, hidePmdc: r.hidePmdc, hideRecord: r.hideRecord } : OPEN), allowed: PRIVACY_SWITCHES.filter((k) => ok[k]) };
}

/** Save the switches the owner allows; a switched-off one keeps its earlier value. */
export async function setMyPrivacy(db: Db, session: Session | null, next: Partial<Privacy>) {
  assertCan(session, "portal");
  const me = await verifiedApplicant(db, (await ensureUser(db, session)).id);
  if (!me) throw new UserFacingError("Link your merit record first: these switches are about your own record.");
  const ok = await allowed(db);
  const v = Object.fromEntries(PRIVACY_SWITCHES.filter((k) => ok[k] && k in next).map((k) => [k, Boolean(next[k])])) as Partial<Privacy>;
  if (!Object.keys(v).length) throw new UserFacingError("These switches are turned off for now.");
  await db.insert(candidatePrivacy).values({ applicantId: me, ...OPEN, ...v, updatedAt: new Date() })
    .onConflictDoUpdate({ target: candidatePrivacy.applicantId, set: { ...v, updatedAt: new Date() } });
  await writeAudit(db, session.email, { action: "candidate.privacy", entityType: "candidate_privacy", entityId: me, after: v, reason: "Candidate changed what others see" });
}
