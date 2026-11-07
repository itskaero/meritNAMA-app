import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { assertCan, can, type Session } from "@/lib/auth/roles";
import type { Database } from "@/lib/db/client";
import { meritRounds, simConsentScenarios, simDatasets, simPreferences, simulationRuns, specialities } from "@/lib/db/schema";
import { allocationKey, isConsentStatus, officialStatuses, type ConsentStatus, type ListAllocation } from "@/lib/domain/what-if";
import { UserFacingError } from "@/lib/errors";
import { verifiedApplicant } from "./candidates";
import { getRun, officialReplies, publishedRound, queueRun, runList, toListAllocations, type RunSummary } from "./simulation";
import { ensureUser } from "./users";

/**
 * Simulated consent ("what if"). Each person keeps their own private consent for a list —
 * a published round or a simulated run's list — and can simulate the next round with it.
 * The official consent (sim_consent) is never changed.
 *
 * Staff may change anyone's consent on their own copy; a candidate only their own
 * allocations, and sees only their own allocations and anonymous aggregates.
 */

export type WhatIfBase = { kind: "published"; round: number } | { kind: "run"; runId: string };
export const baseKey = (b: WhatIfBase) => (b.kind === "published" ? `published:${b.round}` : `run:${b.runId}`);

export function parseBase(v: unknown): WhatIfBase | null {
  const s = String(v ?? "");
  const p = /^published:(\d{1,2})$/.exec(s);
  if (p) return { kind: "published", round: Number(p[1]) };
  const r = /^run:([0-9a-f-]{36})$/.exec(s);
  return r ? { kind: "run", runId: r[1]! } : null;
}

type Actor = { userId: string; staff: boolean; applicantId: string | null };

async function actor(db: Database, session: Session | null): Promise<Actor> {
  assertCan(session, "portal");
  const me = await ensureUser(db, session);
  const staff = can(session, "staff");
  const applicantId = await verifiedApplicant(db, me.id);
  if (!staff && !applicantId) throw new UserFacingError("Link your merit record first: what-if simulations use your own allocations.");
  return { userId: me.id, staff, applicantId };
}

/** The list a base names, its round number, and the official status of each allocation. */
async function loadBase(db: Database, session: Session | null, induction: number, base: WhatIfBase) {
  if (base.kind === "published") {
    const list = await publishedRound(db, induction, base.round);
    if (!list) throw new UserFacingError(`Round ${base.round} of induction ${induction} is not imported.`);
    const allocations = toListAllocations(list);
    return { roundNo: base.round, allocations, official: officialStatuses(allocations, await officialReplies(db, induction, base.round)), runId: null };
  }
  const run = await getRun(db, session, base.runId);
  if (!run || run.inductionId !== induction || run.status !== "done") throw new UserFacingError("That simulated list is not available.");
  const roundNo = run.kind === "next_round" ? run.fromRound! + 1 : 1;
  // A simulated round has no official replies yet: everyone is Awaited.
  return { roundNo, allocations: toListAllocations(await runList(db, run.id)), official: new Map<string, ConsentStatus>(), runId: run.id };
}

async function scenario(db: Database, userId: string, induction: number, key: string) {
  const [row] = await db
    .select()
    .from(simConsentScenarios)
    .where(and(eq(simConsentScenarios.userId, userId), eq(simConsentScenarios.inductionId, induction), eq(simConsentScenarios.baseKey, key)))
    .limit(1);
  return (row?.overrides ?? {}) as Record<string, ConsentStatus>;
}

export type WhatIfRow = ListAllocation & { official: ConsentStatus; simulated: ConsentStatus; changed: boolean; mine: boolean };

/**
 * A list with the caller's simulated consent. Staff get every allocation; a candidate only
 * their own, plus counts.
 */
export async function getWhatIf(db: Database, session: Session | null, input: { induction: number; base: WhatIfBase }) {
  const me = await actor(db, session);
  const b = await loadBase(db, session, input.induction, input.base);
  const overrides = await scenario(db, me.userId, input.induction, baseKey(input.base));
  const rows: WhatIfRow[] = b.allocations.map((a) => {
    const k = allocationKey(a.applicantId, a.seatKey);
    const official = b.official.get(k) ?? "Awaited";
    const simulated = overrides[k] ?? official;
    return { ...a, official, simulated, changed: k in overrides && overrides[k] !== official, mine: a.applicantId === me.applicantId };
  });
  const counts = { Accepted: 0, Rejected: 0, Awaited: 0 } as Record<ConsentStatus, number>;
  for (const r of rows) counts[r.simulated]++;
  return {
    roundNo: b.roundNo,
    staff: me.staff,
    applicantId: me.applicantId,
    rows: me.staff ? rows : rows.filter((r) => r.mine),
    total: rows.length,
    counts,
    changes: rows.filter((r) => r.changed).length,
  };
}

/** Set (or with null, clear) the caller's simulated consent for one allocation. */
export async function setSimulatedConsent(
  db: Database,
  session: Session | null,
  input: { induction: number; base: WhatIfBase; applicantId: string; seatKey: string; status: ConsentStatus | null },
) {
  const me = await actor(db, session);
  if (!me.staff && input.applicantId !== me.applicantId) throw new UserFacingError("You can change only your own consent.");
  if (input.status !== null && !isConsentStatus(input.status)) throw new UserFacingError("Unknown consent status.");
  const b = await loadBase(db, session, input.induction, input.base);
  if (!b.allocations.some((a) => a.applicantId === input.applicantId && a.seatKey === input.seatKey)) throw new UserFacingError("That allocation is not on this list.");
  const key = baseKey(input.base);
  const overrides = { ...(await scenario(db, me.userId, input.induction, key)) };
  const k = allocationKey(input.applicantId, input.seatKey);
  if (input.status === null || input.status === (b.official.get(k) ?? "Awaited")) delete overrides[k];
  else overrides[k] = input.status;
  await db
    .insert(simConsentScenarios)
    .values({ userId: me.userId, inductionId: input.induction, baseKey: key, overrides })
    .onConflictDoUpdate({ target: [simConsentScenarios.userId, simConsentScenarios.inductionId, simConsentScenarios.baseKey], set: { overrides, updatedAt: new Date() } });
}

/** Back to the official consent (or Awaited, on a simulated list). */
export async function resetSimulatedConsent(db: Database, session: Session | null, input: { induction: number; base: WhatIfBase }) {
  const me = await actor(db, session);
  await db
    .delete(simConsentScenarios)
    .where(and(eq(simConsentScenarios.userId, me.userId), eq(simConsentScenarios.inductionId, input.induction), eq(simConsentScenarios.baseKey, baseKey(input.base))));
}

/** Simulate the next round from a list with the caller's simulated consent. Private to the caller. */
export async function queueWhatIfRun(db: Database, session: Session | null, input: { induction: number; base: WhatIfBase }) {
  const me = await actor(db, session);
  const b = await loadBase(db, session, input.induction, input.base);
  const overrides = await scenario(db, me.userId, input.induction, baseKey(input.base));
  return queueRun(db, session, {
    induction: input.induction,
    kind: "next_round",
    fromRound: b.roundNo,
    ownerUserId: me.userId,
    baseRunId: b.runId,
    consentOverrides: overrides,
  });
}

/** Inductions a person can simulate (imported data), with their published rounds. */
export async function whatIfInductions(db: Database, session: Session | null) {
  assertCan(session, "portal");
  const sets = await db.select({ inductionId: simDatasets.inductionId }).from(simDatasets).orderBy(desc(simDatasets.inductionId));
  const rounds = await db.select({ inductionId: meritRounds.inductionId, roundNo: meritRounds.roundNo }).from(meritRounds);
  return sets.map((s) => ({ induction: s.inductionId, rounds: rounds.filter((r) => r.inductionId === s.inductionId).map((r) => r.roundNo).sort((a, b) => a - b) }));
}

/** The caller's own what-if runs for an induction, newest first. */
export async function myWhatIfRuns(db: Database, session: Session | null, induction: number) {
  const me = await actor(db, session);
  const rows = await db
    .select({ id: simulationRuns.id, fromRound: simulationRuns.fromRound, baseRunId: simulationRuns.baseRunId, status: simulationRuns.status, summary: simulationRuns.summary, createdAt: simulationRuns.createdAt })
    .from(simulationRuns)
    .where(and(eq(simulationRuns.ownerUserId, me.userId), eq(simulationRuns.inductionId, induction)))
    .orderBy(desc(simulationRuns.createdAt))
    .limit(20);
  return rows.map((r) => ({ ...r, summary: r.summary as RunSummary | null }));
}

/**
 * A candidate's view of a simulated round: their own seats in it, and for each of their
 * preferences in those programmes, how many were placed there and the closing mark.
 * No other applicant is identified.
 */
export async function myWhatIfResult(db: Database, session: Session | null, runId: string) {
  const me = await actor(db, session);
  const run = await getRun(db, session, runId);
  if (!run) return null;
  const list = await runList(db, run.id);
  const groups = new Map<string, { placed: number; closing: number }>();
  for (const p of list) {
    const k = `${p.program}|${p.speciality}|${p.hospital}|${p.quota}`;
    const g = groups.get(k) ?? { placed: 0, closing: Infinity };
    g.placed++;
    g.closing = Math.min(g.closing, p.mark);
    groups.set(k, g);
  }
  const mySeats = me.applicantId ? list.filter((p) => p.applicantId === me.applicantId) : [];
  // Their own preferences, in the programmes they hold or were simulated into.
  const names = new Map((await db.select({ id: specialities.id, name: specialities.name }).from(specialities)).map((x) => [x.id, x.name.trim().replace(/\s+/g, " ")]));
  const prefs = me.applicantId
    ? await db.select().from(simPreferences).where(and(eq(simPreferences.inductionId, run.inductionId), eq(simPreferences.applicantId, me.applicantId)))
    : [];
  const nm = (x: string) => x.trim().replace(/\s+/g, " ");
  const preferences = prefs
    .map((p) => {
      const speciality = names.get(p.specialityId) ?? `Speciality ${p.specialityId}`;
      const g = groups.get(`${nm(p.program)}|${speciality}|${nm(p.hospital)}|${nm(p.quota)}`);
      const held = mySeats.some((m) => m.program === nm(p.program) && m.speciality === speciality && m.hospital === nm(p.hospital) && m.quota === nm(p.quota));
      return { program: nm(p.program), preferenceNo: p.preferenceNo, quota: nm(p.quota), speciality, hospital: nm(p.hospital), placed: g?.placed ?? 0, closing: g ? g.closing : null, held };
    })
    .sort((a, b) => a.program.localeCompare(b.program) || a.preferenceNo - b.preferenceNo);
  return { run, roundNo: run.kind === "next_round" ? run.fromRound! + 1 : 1, mySeats, preferences };
}
