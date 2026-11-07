import "server-only";
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { assertCan, can, type Capability, type Session } from "@/lib/auth/roles";
import type { Database } from "@/lib/db/client";
import {
  allocationRules,
  discussionThreads,
  inductionSeats,
  meritAllocations,
  meritRounds,
  scoringPolicies,
  scoringPolicyFileMeta,
  stagedChanges,
} from "@/lib/db/schema";
import { meritRoundFileSchema, type MeritRoundFile } from "@/lib/domain/merit-round";
import { seatFileSchema, seatKey, type SeatRow } from "@/lib/domain/reference-data";
import { policySchema, scoringPolicyFileSchema, type Policy, type ScoringPolicyFile } from "@/lib/domain/scoring-policy";
import { UserFacingError } from "@/lib/errors";
import { indexCandidates } from "./candidates";
import { deleteMeritRound, importMeritRound } from "./merit";
import { activatePolicyVersion, importScoringPolicyFile } from "./policies";
import { activateRulesVersion, loadInductionRules, resolveFor, retireActiveRules, rulesBaseline } from "./allocation-rules";
import { allocationRulesSchema, describeRules, rulesDiff } from "@/lib/engine/rules";
import { exportSeatFile, importSeatFile } from "./reference-data";
import { requireReason, writeAudit, type Db } from "./shared";

/**
 * Preview → publish for risky changes. Callers "propose" a change: when it would
 * overwrite or remove existing data it is staged with a computed preview instead of
 * being applied; otherwise it is applied at once (nothing to lose). Publishing
 * re-checks that the data still matches the preview (baseline), applies the change
 * through the normal data functions, and keeps a snapshot for one-step rollback.
 */

export type ChangeKind = (typeof stagedChanges.kind.enumValues)[number];
export const CHANGE_CAPABILITY: Record<ChangeKind, Capability> = {
  policy_activate: "policy.edit",
  policy_file_import: "policy.edit",
  seat_matrix_replace: "data.edit",
  merit_round_replace: "data.edit",
  merit_round_delete: "data.edit",
  rules_activate: "policy.edit",
};

export type Proposal = { applied: true; message: string } | { applied: false; changeId: string; message: string };

const reasonFor = (reason: string) => requireReason(reason, "changes");

// ── Fingerprints of the data a preview was made against ───────────────────────

async function seatsBaseline(db: Db, induction: number) {
  const [r] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number), seats: sql<number>`coalesce(sum(${inductionSeats.seats}), 0)`.mapWith(Number), h: sql<string>`coalesce(md5(string_agg(concat_ws(',', ${inductionSeats.programId}, ${inductionSeats.quotaId}, ${inductionSeats.specialityId}, ${inductionSeats.instituteId}, ${inductionSeats.hospitalId}, ${inductionSeats.seats}), ';' order by ${inductionSeats.position})), '')` })
    .from(inductionSeats)
    .where(eq(inductionSeats.inductionId, induction));
  return `seats:${r?.n}:${r?.seats}:${r?.h}`;
}

async function roundRow(db: Db, induction: number, roundNo: number) {
  const [r] = await db.select().from(meritRounds).where(and(eq(meritRounds.inductionId, induction), eq(meritRounds.roundNo, roundNo))).limit(1);
  return r ?? null;
}
const roundBaseline = (r: { id: number; importedAt: Date } | null) => (r ? `round:${r.id}:${r.importedAt.toISOString()}` : "round:none");

async function policyBaseline(db: Db) {
  const [active] = await db.select({ id: scoringPolicies.id }).from(scoringPolicies).where(eq(scoringPolicies.status, "active")).limit(1);
  const [meta] = await db.select({ id: scoringPolicyFileMeta.id }).from(scoringPolicyFileMeta).orderBy(desc(scoringPolicyFileMeta.id)).limit(1);
  const [latest] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(scoringPolicies);
  return `policy:${active?.id ?? "none"}:${meta?.id ?? "none"}:${latest?.n ?? 0}`;
}

// ── Sanitised merit-round payloads (only the fields this app imports) ─────────

function sanitizeRound(file: MeritRoundFile) {
  const c = file.Table[0]!;
  return {
    Table: [{ inductionId: c.inductionId, name: c.name, displayName: c.displayName, startDate: c.startDate ?? null, endDate: c.endDate ?? null }],
    Table5: file.Table5.map((r) => ({
      rowNo: r.rowNo, type: r.type, quota: r.quota, specialityJobId: r.specialityJobId, speciality: r.speciality, hospital: r.hospital,
      institute: r.institute, seats: r.seats, marks: r.marks, applicantId: r.applicantId, preferenceNo: r.preferenceNo, consent: r.consent,
    })),
  };
}

/** The stored round rebuilt as a (sanitised) round file, for snapshots and diffs. */
async function roundAsFile(db: Db, round: typeof meritRounds.$inferSelect) {
  const rows = await db.select().from(meritAllocations).where(eq(meritAllocations.roundId, round.id)).orderBy(meritAllocations.rowNo);
  return {
    Table: [{ inductionId: round.inductionId, name: round.cycleCode, displayName: round.cycleName, startDate: round.startsOn, endDate: round.endsOn }],
    Table5: rows.map((r) => ({
      rowNo: r.rowNo, type: r.program, quota: r.quota, specialityJobId: r.specialityJobId, speciality: r.speciality, hospital: r.hospital,
      institute: r.institute, seats: r.seats, marks: r.marks, applicantId: r.applicantId, preferenceNo: r.preferenceNo, consent: r.consent,
    })),
  };
}

type RoundFileLike = { Table5: { type: string; quota: string; speciality: string; hospital: string; marks: number; consent: string }[] };

function roundDiff(before: RoundFileLike, after: RoundFileLike) {
  const closing = (f: RoundFileLike) => {
    const m = new Map<string, number>();
    for (const r of f.Table5) {
      const k = `${r.type.trim()} · ${r.quota.trim()} · ${r.speciality.trim()} · ${r.hospital.trim()}`;
      m.set(k, Math.min(m.get(k) ?? Infinity, r.marks));
    }
    return m;
  };
  const a = closing(before), b = closing(after);
  const changed: { group: string; from: number | null; to: number | null }[] = [];
  for (const k of new Set([...a.keys(), ...b.keys()])) {
    const x = a.get(k) ?? null, y = b.get(k) ?? null;
    if (x === null || y === null || Math.abs(x - y) > 1e-9) changed.push({ group: k, from: x, to: y });
  }
  changed.sort((p, q) => Math.abs((q.to ?? 0) - (q.from ?? 0)) - Math.abs((p.to ?? 0) - (p.from ?? 0)));
  const consent = (f: RoundFileLike, s: string) => f.Table5.filter((r) => r.consent.trim() === s).length;
  return {
    allocations: { from: before.Table5.length, to: after.Table5.length },
    accepted: { from: consent(before, "Accepted"), to: consent(after, "Accepted") },
    groupsChanged: changed.length,
    groupsTotal: b.size,
    topChanges: changed.slice(0, 25),
  };
}

function seatDiff(before: SeatRow[], after: SeatRow[]) {
  const label = (r: SeatRow) => `${r.typeName} · ${r.quotaName} · ${r.specialityName} · ${r.hospitalName}`;
  const a = new Map(before.map((r) => [seatKey(r), r])), b = new Map(after.map((r) => [seatKey(r), r]));
  const added = after.filter((r) => !a.has(seatKey(r))).map((r) => ({ line: label(r), seats: r.seats }));
  const removed = before.filter((r) => !b.has(seatKey(r))).map((r) => ({ line: label(r), seats: r.seats }));
  const changed = after.filter((r) => a.has(seatKey(r)) && a.get(seatKey(r))!.seats !== r.seats).map((r) => ({ line: label(r), from: a.get(seatKey(r))!.seats, to: r.seats }));
  const renames: { id: number; field: string; from: string; to: string }[] = [];
  const seen = new Set<string>();
  for (const r of after) {
    const o = before.find((x) => x.hospitalId === r.hospitalId && x.hospitalName !== r.hospitalName);
    if (o && !seen.has(`h${r.hospitalId}`)) { seen.add(`h${r.hospitalId}`); renames.push({ id: r.hospitalId, field: "hospital", from: o.hospitalName, to: r.hospitalName }); }
    const sp = before.find((x) => x.specialityId === r.specialityId && x.specialityName !== r.specialityName);
    if (sp && !seen.has(`s${r.specialityId}`)) { seen.add(`s${r.specialityId}`); renames.push({ id: r.specialityId, field: "speciality", from: sp.specialityName, to: r.specialityName }); }
  }
  const sum = (rows: SeatRow[]) => rows.reduce((s, r) => s + r.seats, 0);
  return {
    lines: { from: before.length, to: after.length },
    seats: { from: sum(before), to: sum(after) },
    added: added.slice(0, 50), addedCount: added.length,
    removed: removed.slice(0, 50), removedCount: removed.length,
    changed: changed.slice(0, 50), changedCount: changed.length,
    renames,
  };
}

function policyDiff(before: Policy | null, after: Policy) {
  const comps = (p: Policy | null) => new Map((p?.components ?? []).map((c) => [c.key, c]));
  const a = comps(before), b = comps(after);
  const rows: { key: string; label: string; from: string; to: string }[] = [];
  const show = (c?: Policy["components"][number]) => (c ? `${c.max_marks}${c.included === false ? " (excluded)" : ""}` : "—");
  for (const k of new Set([...a.keys(), ...b.keys()])) {
    const x = a.get(k), y = b.get(k);
    if (show(x) !== show(y) || x?.label !== y?.label) rows.push({ key: k, label: (y ?? x)!.label, from: show(x), to: show(y) });
  }
  return { total: { from: before?.total_marks ?? null, to: after.total_marks }, label: { from: before?.label ?? null, to: after.label }, induction: after.induction, components: rows };
}

// ── Staging ────────────────────────────────────────────────────────────────────

async function stage(db: Db, session: Session, c: { kind: ChangeKind; target: string; title: string; payload: unknown; preview: unknown; baseline: string; reason: string }) {
  // One pending change per target: a newer proposal replaces an older one.
  await db.update(stagedChanges).set({ status: "discarded", decidedBy: session.email, decidedAt: new Date(), decisionReason: "Replaced by a newer proposal" })
    .where(and(eq(stagedChanges.target, c.target), eq(stagedChanges.status, "pending")));
  const [row] = await db.insert(stagedChanges).values({ ...c, createdBy: session.email }).returning({ id: stagedChanges.id });
  await writeAudit(db, session.email, { action: "change.stage", entityType: "staged_change", entityId: row!.id, after: { kind: c.kind, target: c.target }, reason: c.reason });
  return row!.id;
}

/** Import a seat file: applied at once for a new induction, staged when it would replace a matrix. */
export async function proposeSeatFile(db: Database, session: Session | null, input: { induction: number; calendarYear?: number; file: unknown; reason: string }): Promise<Proposal> {
  assertCan(session, "data.edit");
  const rows = seatFileSchema.parse(input.file);
  const reason = reasonFor(input.reason);
  const current = await exportSeatFile(db, session, input.induction);
  if (current.length === 0) {
    const r = await importSeatFile(db, session, { ...input, file: rows, reason });
    return { applied: true, message: `Induction ${input.induction}: ${r.lines} seat lines, ${r.seats} seats imported.` };
  }
  const preview = seatDiff(current, rows);
  const id = await stage(db, session, {
    kind: "seat_matrix_replace", target: `seats:${input.induction}`, title: `Replace the induction ${input.induction} seat matrix`,
    payload: { induction: input.induction, calendarYear: input.calendarYear ?? null, file: rows }, preview, baseline: await seatsBaseline(db, input.induction), reason,
  });
  return { applied: false, changeId: id, message: `This replaces induction ${input.induction}'s seat matrix (${preview.changedCount} changed, ${preview.addedCount} added, ${preview.removedCount} removed lines). Review and publish it.` };
}

/** Import a merit round: applied at once when new, staged when it would replace a round. */
export async function proposeMeritRound(db: Database, session: Session | null, input: { roundNo: number; file: unknown; reason: string }): Promise<Proposal> {
  assertCan(session, "data.edit");
  const file = meritRoundFileSchema.parse(input.file);
  const reason = reasonFor(input.reason);
  const induction = file.Table[0]!.inductionId;
  // The raw file is only in hand here: index the applicants' email/PMDC HMACs now
  // (identities are facts about applicants, not part of the round, so a staged
  // replacement does not wait for them). The staged payload stays stripped.
  await indexCandidates(db, file);
  const existing = await roundRow(db, induction, input.roundNo);
  if (!existing) {
    const r = await importMeritRound(db, session, { roundNo: input.roundNo, file: input.file, reason });
    const unmatched = r.unmatched.specialities.length + r.unmatched.hospitals.length;
    return { applied: true, message: `induction ${r.inductionId} round ${r.roundNo}, ${r.allocations} allocations${unmatched ? `, ${unmatched} names to map` : ""}` };
  }
  const payload = sanitizeRound(file);
  const preview = roundDiff(await roundAsFile(db, existing), payload);
  const id = await stage(db, session, {
    kind: "merit_round_replace", target: `induction:${induction}:round:${input.roundNo}`, title: `Replace induction ${induction} round ${input.roundNo}`,
    payload: { roundNo: input.roundNo, file: payload }, preview, baseline: roundBaseline(existing), reason,
  });
  return { applied: false, changeId: id, message: `round ${input.roundNo} of induction ${induction} already exists: staged for review (${preview.groupsChanged} groups change)` };
}

/** Deleting a round is always staged. */
export async function proposeDeleteRound(db: Database, session: Session | null, input: { roundId: number; reason: string }): Promise<Proposal> {
  assertCan(session, "data.edit");
  const reason = reasonFor(input.reason);
  const [round] = await db.select().from(meritRounds).where(eq(meritRounds.id, input.roundId)).limit(1);
  if (!round) throw new UserFacingError("That round does not exist");
  const [threads] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(discussionThreads)
    .where(and(eq(discussionThreads.topicKind, "round"), eq(discussionThreads.topicKey, `${round.inductionId}:${round.roundNo}`)));
  const id = await stage(db, session, {
    kind: "merit_round_delete", target: `induction:${round.inductionId}:round:${round.roundNo}`, title: `Remove induction ${round.inductionId} round ${round.roundNo}`,
    payload: { inductionId: round.inductionId, roundNo: round.roundNo },
    preview: { allocations: round.allocations, cycle: `${round.cycleName} (${round.cycleCode})`, discussions: threads?.n ?? 0 },
    baseline: roundBaseline(round), reason,
  });
  return { applied: false, changeId: id, message: "Removal staged. Review and publish it." };
}

/** Activating a policy version is always staged. */
export async function proposeActivation(db: Database, session: Session | null, input: { id: string; reason: string }): Promise<Proposal> {
  assertCan(session, "policy.edit");
  const reason = reasonFor(input.reason);
  const [target] = await db.select().from(scoringPolicies).where(eq(scoringPolicies.id, input.id)).limit(1);
  if (!target) throw new UserFacingError("Policy version not found");
  if (target.status === "active") return { applied: true, message: "This version is already active." };
  const [active] = await db.select().from(scoringPolicies).where(eq(scoringPolicies.status, "active")).limit(1);
  const after = policySchema.parse(target.definition);
  const before = active ? policySchema.parse(active.definition) : null;
  const id = await stage(db, session, {
    kind: "policy_activate", target: "policy:active", title: `Activate scoring policy ${target.policyKey} v${target.version}`,
    payload: { id: target.id },
    preview: { from: active ? `${active.policyKey} v${active.version}` : null, to: `${target.policyKey} v${target.version}`, ...policyDiff(before, after) },
    baseline: await policyBaseline(db), reason,
  });
  return { applied: false, changeId: id, message: "Activation staged. Review the differences and publish." };
}

/** Import scoring_policy.json: applied at once when no policy is active yet, otherwise staged. */
export async function proposePolicyFile(db: Database, session: Session | null, input: { file: unknown; reason: string }): Promise<Proposal> {
  assertCan(session, "policy.edit");
  scoringPolicyFileSchema.parse(input.file);
  const file = input.file as ScoringPolicyFile;
  const reason = reasonFor(input.reason);
  const [active] = await db.select().from(scoringPolicies).where(eq(scoringPolicies.status, "active")).limit(1);
  if (!active) {
    const r = await importScoringPolicyFile(db, session, { file, reason });
    return { applied: true, message: `Imported ${r.created.length} policies; "${r.activePolicy}" is now active.` };
  }
  const latest = await db.select().from(scoringPolicies).orderBy(scoringPolicies.policyKey, desc(scoringPolicies.version));
  const newest = new Map<string, unknown>();
  for (const r of latest) if (!newest.has(r.policyKey)) newest.set(r.policyKey, r.definition);
  const keys = Object.keys(file.policies).map((k) => ({
    key: k,
    state: !newest.has(k) ? "new" : JSON.stringify(newest.get(k)) === JSON.stringify(file.policies[k]) ? "unchanged" : "changed",
  }));
  const id = await stage(db, session, {
    kind: "policy_file_import", target: "policy:active", title: "Import scoring_policy.json",
    payload: { file },
    preview: { activeFrom: active.policyKey, activeTo: file.active_policy, keys, ...policyDiff(policySchema.parse(active.definition), file.policies[file.active_policy]!) },
    baseline: await policyBaseline(db), reason,
  });
  return { applied: false, changeId: id, message: "A policy is already active, so this import is staged. Review and publish it." };
}

/** Activating an induction's allocation rules is always staged, with the settings that change. */
export async function proposeRulesActivation(db: Database, session: Session | null, input: { id: string; reason: string }): Promise<Proposal> {
  assertCan(session, "policy.edit");
  const reason = reasonFor(input.reason);
  const [target] = await db.select().from(allocationRules).where(eq(allocationRules.id, input.id)).limit(1);
  if (!target) throw new UserFacingError("Rules version not found");
  if (target.status === "active") return { applied: true, message: "This version is already active." };
  const after = allocationRulesSchema.parse(target.definition);
  const current = await loadInductionRules(db, target.inductionId);
  const policy = current.policy?.definition ?? null;
  const next = resolveFor(after, policy);
  const id = await stage(db, session, {
    kind: "rules_activate", target: `rules:${target.inductionId}`, title: `Activate induction ${target.inductionId} allocation rules v${target.version}`,
    payload: { id: target.id, induction: target.inductionId },
    preview: {
      induction: target.inductionId,
      from: current.origin.kind === "stored" ? `v${current.origin.version}` : "default rules",
      to: `v${target.version}`,
      policy: current.policy ? `${current.policy.policyKey} v${current.policy.version}` : null,
      settings: rulesDiff(current.rules, after),
      before: current.resolved ? describeRules(current.resolved) : null,
      after: next.resolved ? describeRules(next.resolved) : null,
      problem: next.problem,
    },
    baseline: await rulesBaseline(db, target.inductionId), reason,
  });
  return { applied: false, changeId: id, message: "Activation staged. Review the differences and publish." };
}

// ── Reading ────────────────────────────────────────────────────────────────────

export async function listChanges(db: Database, session: Session | null) {
  assertCan(session, "staff");
  const rows = await db
    .select({ id: stagedChanges.id, kind: stagedChanges.kind, target: stagedChanges.target, title: stagedChanges.title, status: stagedChanges.status, reason: stagedChanges.reason, createdBy: stagedChanges.createdBy, createdAt: stagedChanges.createdAt, decidedBy: stagedChanges.decidedBy, decidedAt: stagedChanges.decidedAt })
    .from(stagedChanges)
    .orderBy(desc(stagedChanges.createdAt))
    .limit(100);
  return rows.map((r) => ({ ...r, canDecide: can(session, CHANGE_CAPABILITY[r.kind]) }));
}

export async function getChange(db: Database, session: Session | null, id: string) {
  assertCan(session, "staff");
  const [c] = await db.select().from(stagedChanges).where(eq(stagedChanges.id, id)).limit(1);
  if (!c) return null;
  // The payload and snapshot (which can hold applicant ids) never leave this module.
  return {
    id: c.id, kind: c.kind, target: c.target, title: c.title, status: c.status, preview: c.preview, reason: c.reason,
    createdBy: c.createdBy, createdAt: c.createdAt, decidedBy: c.decidedBy, decidedAt: c.decidedAt, decisionReason: c.decisionReason,
    canDecide: can(session, CHANGE_CAPABILITY[c.kind]),
    stale: c.status === "pending" && (await currentBaseline(db, c)) !== c.baseline,
    rollbackable: c.status === "published" && c.snapshot != null && !(await laterPublished(db, c)),
  };
}

export async function pendingChangeCount(db: Database, session: Session | null) {
  assertCan(session, "staff");
  const [r] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(stagedChanges).where(eq(stagedChanges.status, "pending"));
  return r?.n ?? 0;
}

async function currentBaseline(db: Db, c: typeof stagedChanges.$inferSelect) {
  switch (c.kind) {
    case "seat_matrix_replace": return seatsBaseline(db, (c.payload as { induction: number }).induction);
    case "merit_round_replace": {
      const p = c.payload as { roundNo: number; file: { Table: { inductionId: number }[] } };
      return roundBaseline(await roundRow(db, p.file.Table[0]!.inductionId, p.roundNo));
    }
    case "merit_round_delete": {
      const p = c.payload as { inductionId: number; roundNo: number };
      return roundBaseline(await roundRow(db, p.inductionId, p.roundNo));
    }
    case "policy_activate":
    case "policy_file_import": return policyBaseline(db);
    case "rules_activate": return rulesBaseline(db, (c.payload as { induction: number }).induction);
  }
}

async function laterPublished(db: Db, c: typeof stagedChanges.$inferSelect) {
  const [r] = await db.select({ id: stagedChanges.id }).from(stagedChanges)
    .where(and(eq(stagedChanges.target, c.target), inArray(stagedChanges.status, ["published"]), gt(stagedChanges.decidedAt, c.decidedAt ?? new Date(0))))
    .limit(1);
  return Boolean(r);
}

// ── Deciding ───────────────────────────────────────────────────────────────────

async function loadForDecision(db: Db, session: Session | null, id: string) {
  assertCan(session, "staff");
  const [c] = await db.select().from(stagedChanges).where(eq(stagedChanges.id, id)).limit(1);
  if (!c) throw new UserFacingError("That change no longer exists.");
  assertCan(session, CHANGE_CAPABILITY[c.kind]);
  return { c, session };
}

/** Apply a pending change. Refused when the data changed since the preview was made. */
export async function publishChange(db: Database, sessionIn: Session | null, input: { id: string; reason: string }) {
  assertCan(sessionIn, "staff"); // the change's own capability is checked once it is loaded
  const reason = reasonFor(input.reason);
  const { c, session } = await loadForDecision(db, sessionIn, input.id);
  if (c.status !== "pending") throw new UserFacingError(`This change is already ${c.status.replace("_", " ")}.`);
  if ((await currentBaseline(db, c)) !== c.baseline) {
    throw new UserFacingError("The data changed since this preview was made. Discard it and propose the change again to see an up-to-date preview.");
  }

  // Snapshot what is about to be replaced, then apply through the normal functions.
  let snapshot: unknown = null;
  const why = `${reason} (change ${c.id.slice(0, 8)})`;
  switch (c.kind) {
    case "seat_matrix_replace": {
      const p = c.payload as { induction: number; calendarYear: number | null; file: SeatRow[] };
      snapshot = { induction: p.induction, file: await exportSeatFile(db, session, p.induction) };
      await importSeatFile(db, session, { induction: p.induction, calendarYear: p.calendarYear ?? undefined, file: p.file, reason: why });
      break;
    }
    case "merit_round_replace": {
      const p = c.payload as { roundNo: number; file: { Table: { inductionId: number }[] } };
      const existing = await roundRow(db, p.file.Table[0]!.inductionId, p.roundNo);
      snapshot = existing ? { roundNo: p.roundNo, file: await roundAsFile(db, existing) } : null;
      await importMeritRound(db, session, { roundNo: p.roundNo, file: p.file, reason: why });
      break;
    }
    case "merit_round_delete": {
      const p = c.payload as { inductionId: number; roundNo: number };
      const existing = await roundRow(db, p.inductionId, p.roundNo);
      if (!existing) throw new UserFacingError("That round no longer exists.");
      snapshot = { roundNo: p.roundNo, file: await roundAsFile(db, existing) };
      await deleteMeritRound(db, session, { roundId: existing.id, reason: why });
      break;
    }
    case "policy_activate":
    case "policy_file_import": {
      const [active] = await db.select({ id: scoringPolicies.id }).from(scoringPolicies).where(eq(scoringPolicies.status, "active")).limit(1);
      snapshot = { activeId: active?.id ?? null };
      if (c.kind === "policy_activate") await activatePolicyVersion(db, session, { id: (c.payload as { id: string }).id, reason: why });
      else await importScoringPolicyFile(db, session, { file: (c.payload as { file: unknown }).file, reason: why });
      break;
    }
    case "rules_activate": {
      const p = c.payload as { id: string; induction: number };
      const current = await loadInductionRules(db, p.induction);
      snapshot = { induction: p.induction, activeId: current.origin.kind === "stored" ? current.origin.id : null };
      await activateRulesVersion(db, session, { id: p.id, reason: why });
      break;
    }
  }
  await db.update(stagedChanges).set({ status: "published", snapshot, decidedBy: session.email, decidedAt: new Date(), decisionReason: reason }).where(eq(stagedChanges.id, c.id));
  await writeAudit(db, session.email, { action: "change.publish", entityType: "staged_change", entityId: c.id, after: { kind: c.kind, target: c.target }, reason });
}

export async function discardChange(db: Database, sessionIn: Session | null, input: { id: string; reason: string }) {
  assertCan(sessionIn, "staff"); // the change's own capability is checked once it is loaded
  const reason = reasonFor(input.reason);
  const { c, session } = await loadForDecision(db, sessionIn, input.id);
  if (c.status !== "pending") throw new UserFacingError(`This change is already ${c.status.replace("_", " ")}.`);
  await db.update(stagedChanges).set({ status: "discarded", decidedBy: session.email, decidedAt: new Date(), decisionReason: reason }).where(eq(stagedChanges.id, c.id));
  await writeAudit(db, session.email, { action: "change.discard", entityType: "staged_change", entityId: c.id, reason });
}

/** Undo a published change from its snapshot. Only the latest published change of a target can be undone. */
export async function rollbackChange(db: Database, sessionIn: Session | null, input: { id: string; reason: string }) {
  assertCan(sessionIn, "staff"); // the change's own capability is checked once it is loaded
  const reason = reasonFor(input.reason);
  const { c, session } = await loadForDecision(db, sessionIn, input.id);
  if (c.status !== "published" || c.snapshot == null) throw new UserFacingError("Only a published change with a snapshot can be rolled back.");
  if (await laterPublished(db, c)) throw new UserFacingError("A later change to the same data was published. Roll that back first.");
  const why = `Rollback of change ${c.id.slice(0, 8)}: ${reason}`;
  switch (c.kind) {
    case "seat_matrix_replace": {
      const s = c.snapshot as { induction: number; file: SeatRow[] };
      await importSeatFile(db, session, { induction: s.induction, file: s.file, reason: why });
      break;
    }
    case "merit_round_replace":
    case "merit_round_delete": {
      const s = c.snapshot as { roundNo: number; file: unknown };
      await importMeritRound(db, session, { roundNo: s.roundNo, file: s.file, reason: why });
      break;
    }
    case "policy_activate":
    case "policy_file_import": {
      const s = c.snapshot as { activeId: string | null };
      if (!s.activeId) throw new UserFacingError("No policy was active before this change, so there is nothing to return to.");
      await activatePolicyVersion(db, session, { id: s.activeId, reason: why });
      break;
    }
    case "rules_activate": {
      // Back to the version that was active before, or to the default rules.
      const s = c.snapshot as { induction: number; activeId: string | null };
      if (s.activeId) await activateRulesVersion(db, session, { id: s.activeId, reason: why });
      else await retireActiveRules(db, session, { induction: s.induction, reason: why });
      break;
    }
  }
  await db.update(stagedChanges).set({ status: "rolled_back", decisionReason: `${c.decisionReason ?? ""} · rolled back by ${session.email}: ${reason}` }).where(eq(stagedChanges.id, c.id));
  await writeAudit(db, session.email, { action: "change.rollback", entityType: "staged_change", entityId: c.id, reason });
}

