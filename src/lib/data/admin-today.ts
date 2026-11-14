import "server-only";
import { statfs } from "node:fs/promises";
import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { assertCan, can, type Capability, type Session } from "@/lib/auth/roles";
import { checkDatabase, type Database } from "@/lib/db/client";
import {
  accessRequests, appSettings, candidateLinks, dataFiles, discussionReports, inductionSchedule, inductionSeats, inductions,
  joiningStatus, jobSources, meritAllocations, meritRounds, scoringPolicies, simCandidates, simConsent, simDatasets,
  simulationRuns, stagedChanges,
} from "@/lib/db/schema";
import { classifyByPath } from "@/lib/ingest/registry";
import type { SimRole } from "@/lib/ingest/sim-roles";
import { inductionLane, nextStep, type StageState } from "@/lib/ingest/workflow";
import { ago, cycleSteps, nextPhfStep, plural, sortQueue, workerHealth, type CycleStep, type HealthItem, type QueueItem } from "@/lib/admin/today";
import { dataRoot, loadDataSettings } from "./datastore";
import { runRoundNo } from "./simulation";

/**
 * Admin Today and the Data page's induction cards.
 *
 * "Needs you" is a registry: each area adds one source with the capability it needs and a
 * loader that returns a row or nothing. A staff member sees only the rows they can act on,
 * most urgent first. Adding an area = adding one entry to QUEUE_SOURCES.
 */

type QueueSource = { id: string; capability: Capability; load: (db: Database) => Promise<QueueItem | null> };

const n = (rows: { n: number }[]) => Number(rows[0]?.n ?? 0);

/** Latest staff estimate per induction that is built, not published and not overtaken by the official list. */
async function unpublishedEstimates(db: Database) {
  const runs = await db.select({ id: simulationRuns.id, inductionId: simulationRuns.inductionId, kind: simulationRuns.kind, fromRound: simulationRuns.fromRound, publishedAt: simulationRuns.publishedAt, finishedAt: simulationRuns.finishedAt })
    .from(simulationRuns).where(and(isNull(simulationRuns.ownerUserId), eq(simulationRuns.status, "done"))).orderBy(desc(simulationRuns.createdAt)).limit(200);
  const official = new Set((await db.select({ i: meritRounds.inductionId, r: meritRounds.roundNo }).from(meritRounds)).map((x) => `${x.i}:${x.r}`));
  const latest = new Map<number, (typeof runs)[number]>();
  for (const r of runs) if (!latest.has(r.inductionId)) latest.set(r.inductionId, r);
  return [...latest.values()].filter((r) => !r.publishedAt && !official.has(`${r.inductionId}:${runRoundNo(r)}`));
}

export const QUEUE_SOURCES: QueueSource[] = [
  {
    id: "estimates", capability: "data.edit",
    load: async (db) => {
      const waiting = await unpublishedEstimates(db);
      if (!waiting.length) return null;
      const r = waiting[0]!;
      const round = runRoundNo(r);
      return {
        id: "estimates", tag: "Estimate", tone: "amber", urgency: 95, primary: true,
        title: waiting.length === 1 ? `Estimated round ${round} is ready` : `${waiting.length} estimates are ready`,
        detail: `Induction ${r.inductionId}, ${r.kind === "next_round" ? `built from round ${r.fromRound} and its consent replies` : "round 1 from preferences"}. Compare it, then publish.`,
        cta: "Review & publish", href: `/admin/processing/runs/${r.id}`,
      };
    },
  },
  {
    id: "files", capability: "data.edit",
    load: async (db) => {
      const rows = await db.select({ status: dataFiles.status, path: dataFiles.path }).from(dataFiles).where(inArray(dataFiles.status, ["new", "replaces", "problem"])).limit(500);
      if (!rows.length) return null;
      const by = (s: string) => rows.filter((r) => r.status === s);
      const parts = [by("replaces").length && `${by("replaces").length} would replace live data`, by("new").length && `${by("new").length} new`, by("problem").length && `${by("problem").length} with a problem`].filter(Boolean);
      const example = (by("replaces")[0] ?? by("new")[0] ?? by("problem")[0])!.path.split("/").pop();
      return {
        id: "files", tag: "Data", tone: "violet", urgency: by("replaces").length || by("new").length ? 90 : 60, primary: true,
        title: `${plural(rows.length, "file")} in the data folder`, detail: `${parts.join(" · ")}. e.g. ${example}`,
        cta: by("problem").length === rows.length ? "See why" : "Apply", href: "/admin/data?tab=files",
      };
    },
  },
  {
    id: "access", capability: "candidates.verify",
    load: async (db) => {
      const [r] = await db.select({ n: count(), near: sql<number>`count(*) filter (where ${accessRequests.autoResult} in ('amount_short', 'tid_reused', 'duplicate_tid', 'stale'))`.mapWith(Number) }).from(accessRequests).where(eq(accessRequests.status, "pending"));
      const c = Number(r?.n ?? 0);
      if (!c) return null;
      const near = r?.near ?? 0;
      return { id: "access", tag: "People", tone: near ? "amber" : "neutral", urgency: near ? 75 : 70, title: `${plural(c, "access request")}`, detail: near ? `${near} near miss${near === 1 ? "" : "es"} (amount short, ID reused…). The rest: import the latest Easypaisa/JazzCash statement and they match by themselves.` : "Import the latest Easypaisa/JazzCash statement under Payments: matching requests approve by themselves.", cta: "Check", href: "/admin/access" };
    },
  },
  {
    id: "links", capability: "candidates.verify",
    load: async (db) => {
      const c = n(await db.select({ n: count() }).from(candidateLinks).where(eq(candidateLinks.status, "pending")));
      return c ? { id: "links", tag: "People", tone: "neutral", urgency: 50, title: `${plural(c, "link request")}`, detail: "Candidates asking to link their account to a merit record.", cta: "Verify", href: "/admin/candidates" } : null;
    },
  },
  {
    id: "changes", capability: "staff",
    load: async (db) => {
      const c = n(await db.select({ n: count() }).from(stagedChanges).where(eq(stagedChanges.status, "pending")));
      return c ? { id: "changes", tag: "Changes", tone: "amber", urgency: 80, title: `${plural(c, "change")} to review`, detail: "Staged changes wait for a decision before they go live.", cta: "Review", href: "/admin/changes" } : null;
    },
  },
  {
    id: "names", capability: "data.edit",
    load: async (db) => {
      const [s] = await db.select({ n: sql<number>`count(distinct ${meritAllocations.speciality}) filter (where ${meritAllocations.specialityId} is null)`.mapWith(Number), h: sql<number>`count(distinct ${meritAllocations.hospital}) filter (where ${meritAllocations.hospitalId} is null)`.mapWith(Number) }).from(meritAllocations);
      const c = (s?.n ?? 0) + (s?.h ?? 0);
      return c ? { id: "names", tag: "Names", tone: "cyan", urgency: 40, title: `${plural(c, "name")} to map`, detail: "Published hospital and speciality names with no match yet.", cta: "Map names", href: "/admin/inductions" } : null;
    },
  },
  {
    id: "jobs", capability: "data.edit",
    load: async (db) => {
      const failing = await db.select({ source: jobSources.source, error: jobSources.lastError }).from(jobSources)
        .where(sql`${jobSources.lastError} is not null and (${jobSources.lastOk} is null or ${jobSources.lastOk} < ${jobSources.lastRun})`);
      if (!failing.length) return null;
      return { id: "jobs", tag: "Jobs", tone: "coral", urgency: 30, title: failing.length === 1 ? `Job source ${failing[0]!.source} is failing` : `${failing.length} job sources are failing`, detail: (failing[0]!.error ?? "").slice(0, 140), cta: "Open Jobs", href: "/admin/jobs" };
    },
  },
  {
    id: "reports", capability: "community.moderate",
    load: async (db) => {
      const c = n(await db.select({ n: count() }).from(discussionReports).where(eq(discussionReports.status, "open")));
      return c ? { id: "reports", tag: "Community", tone: "neutral", urgency: 45, title: `${plural(c, "community report")}`, detail: "Posts members reported for review.", cta: "Moderate", href: "/admin/community" } : null;
    },
  },
  {
    id: "runs_failed", capability: "data.edit",
    load: async (db) => {
      const [r] = await db.select({ inductionId: simulationRuns.inductionId, status: simulationRuns.status, error: simulationRuns.error }).from(simulationRuns).where(isNull(simulationRuns.ownerUserId)).orderBy(desc(simulationRuns.createdAt)).limit(1);
      return r?.status === "failed" ? { id: "runs_failed", tag: "Estimate", tone: "coral", urgency: 85, title: `The latest estimate for induction ${r.inductionId} failed`, detail: (r.error ?? "No message.").slice(0, 140), cta: "Open", href: "/admin/processing" } : null;
    },
  },
  {
    id: "seats", capability: "data.edit",
    load: async (db) => n(await db.select({ n: count() }).from(inductionSeats)) ? null
      : { id: "seats", tag: "Data", tone: "violet", urgency: 20, title: "No seat matrix yet", detail: "Drop induction<n>_seats.json into Data.", cta: "Add files", href: "/admin/data?tab=files" },
  },
  {
    id: "policy", capability: "policy.edit",
    load: async (db) => n(await db.select({ n: count() }).from(scoringPolicies).where(eq(scoringPolicies.status, "active"))) ? null
      : { id: "policy", tag: "Policy", tone: "violet", urgency: 20, title: "No active scoring policy", detail: "Import scoring_policy.json so merit shows out of each total.", cta: "Import", href: "/admin/policies" },
  },
];

/** "Needs you": every queue the caller may act on that has something in it, most urgent first. */
export async function needsYou(db: Database, session: Session | null): Promise<QueueItem[]> {
  assertCan(session, "staff");
  const mine = QUEUE_SOURCES.filter((q) => can(session, q.capability));
  const rows = await Promise.all(mine.map((q) => q.load(db).catch((e) => { console.error(`queue ${q.id}`, e); return null; })));
  return sortQueue(rows);
}

// ── Induction cards (workflow lane) ──────────────────────────────────────────

export type InductionCard = {
  induction: number;
  label: string | null;
  lane: StageState[];
  next: { label: string; href: string } | null;
  rounds: number[];
  roundsWaiting: number[];
  consent: number[];
  estimate: { id: string; roundNo: number; published: boolean } | null;
  joining: { joined: number; total: number } | null;
  hasSchedule: boolean;
  /** Live, but nothing changes any more: last round in, no files waiting. */
  closed: boolean;
};

const STAGE_HREF: Record<string, string> = { estimate: "/admin/processing", rounds: "/admin/data?tab=files" };

/** Per induction, newest first: what is in, official or not, and the one next step. */
export async function inductionCards(db: Database, session: Session | null): Promise<InductionCard[]> {
  assertCan(session, "staff");
  const [ind, datasets, verif, files, rounds, consent, runs, joining, schedule] = await Promise.all([
    db.select({ id: inductions.id, label: inductions.label, status: inductions.status }).from(inductions),
    db.select({ id: simDatasets.inductionId, sources: simDatasets.sources }).from(simDatasets),
    db.select({
      id: simCandidates.inductionId,
      verified: sql<number>`count(*) filter (where ${simCandidates.verification}::jsonb @> '[{"type":131}]')`.mapWith(Number),
      amended: sql<number>`count(*) filter (where ${simCandidates.verification}::jsonb @> '[{"type":132}]')`.mapWith(Number),
    }).from(simCandidates).groupBy(simCandidates.inductionId),
    db.select({ induction: dataFiles.induction, kind: dataFiles.kind, path: dataFiles.path, round: dataFiles.round }).from(dataFiles).where(inArray(dataFiles.status, ["new", "replaces"])),
    db.select({ id: meritRounds.inductionId, roundNo: meritRounds.roundNo }).from(meritRounds),
    db.selectDistinct({ id: simConsent.inductionId, roundNo: simConsent.roundNo }).from(simConsent),
    db.select({ id: simulationRuns.id, inductionId: simulationRuns.inductionId, kind: simulationRuns.kind, fromRound: simulationRuns.fromRound, publishedAt: simulationRuns.publishedAt })
      .from(simulationRuns).where(and(isNull(simulationRuns.ownerUserId), eq(simulationRuns.status, "done"))).orderBy(desc(simulationRuns.createdAt)).limit(300),
    db.select({ id: joiningStatus.inductionId, total: count(), joined: sql<number>`count(*) filter (where ${joiningStatus.status} = 'joined')`.mapWith(Number) }).from(joiningStatus).groupBy(joiningStatus.inductionId),
    db.selectDistinct({ id: inductionSchedule.inductionId }).from(inductionSchedule),
  ]);

  const ids = new Set<number>([...ind.map((x) => x.id), ...datasets.map((x) => x.id), ...rounds.map((x) => x.id), ...files.flatMap((f) => (f.induction != null ? [f.induction] : [])), ...schedule.map((s) => s.id)]);
  const cards: InductionCard[] = [];
  for (const id of ids) {
    const ds = datasets.find((d) => d.id === id);
    const datasetRoles = ((ds?.sources ?? []) as { role: SimRole }[]).map((s) => s.role);
    const mine = files.filter((f) => f.induction === id);
    const waitingRoles = mine.filter((f) => f.kind === "sim_input").flatMap((f) => { const r = classifyByPath(f.path)?.role; return r ? [r as SimRole] : []; });
    const roundsWaiting = [...new Set(mine.filter((f) => f.kind === "merit" && f.round != null).map((f) => f.round!))].sort((a, b) => a - b);
    const myRounds = rounds.filter((r) => r.id === id).map((r) => r.roundNo).sort((a, b) => a - b);
    const run = runs.find((r) => r.inductionId === id);
    const estimate = run ? { id: run.id, roundNo: runRoundNo(run), published: Boolean(run.publishedAt) } : null;
    const j = joining.find((x) => x.id === id);
    const v = verif.find((x) => x.id === id);
    const lane = inductionLane({
      datasetRoles, waitingRoles, verified: v?.verified ?? 0, amended: v?.amended ?? 0, rounds: myRounds, roundWaiting: roundsWaiting.length > 0,
      estimate: estimate ? { ...estimate, official: myRounds.includes(estimate.roundNo) } : null,
      joining: j ? "official" : mine.some((f) => f.kind === "joining") ? "waiting" : "none",
    });
    const step = nextStep(lane);
    const next = step ? {
      label: step.label,
      href: lane.some((s) => s.state === "waiting") ? "/admin/data?tab=files"
        : step.label.startsWith("Review") && estimate ? `/admin/processing/runs/${estimate.id}`
        : STAGE_HREF[step.stage] ?? "/admin/data?tab=files",
    } : null;
    cards.push({
      induction: id, label: ind.find((x) => x.id === id)?.label ?? null, lane, next,
      rounds: myRounds, roundsWaiting, consent: consent.filter((c) => c.id === id).map((c) => c.roundNo).sort((a, b) => a - b),
      estimate, joining: j ? { joined: j.joined, total: Number(j.total) } : null, hasSchedule: schedule.some((s) => s.id === id),
      closed: Boolean(j) && !mine.length && ind.find((x) => x.id === id)?.status !== "active",
    });
  }
  return cards.sort((a, b) => b.induction - a.induction);
}

// ── Cycle strip ──────────────────────────────────────────────────────────────

export type CycleStrip = { induction: number; steps: CycleStep[]; next: CycleStep | null; latestRound: number | null } | null;

/** The running induction's PHF schedule as a strip (the newest induction that has one). */
export async function cycleStrip(db: Database, session: Session | null, now = new Date()): Promise<CycleStrip> {
  assertCan(session, "staff");
  const [ind] = await db.select({ id: inductionSchedule.inductionId }).from(inductionSchedule).orderBy(desc(inductionSchedule.inductionId)).limit(1);
  if (!ind) return null;
  const [rows, [r]] = await Promise.all([
    db.select({ title: inductionSchedule.title, sortOrder: inductionSchedule.sortOrder, startsAt: inductionSchedule.startsAt, endsAt: inductionSchedule.endsAt }).from(inductionSchedule).where(eq(inductionSchedule.inductionId, ind.id)),
    db.select({ roundNo: meritRounds.roundNo }).from(meritRounds).where(eq(meritRounds.inductionId, ind.id)).orderBy(desc(meritRounds.roundNo)).limit(1),
  ]);
  const steps = cycleSteps(rows, now);
  return { induction: ind.id, steps, next: nextPhfStep(steps), latestRound: r?.roundNo ?? null };
}

// ── Health ───────────────────────────────────────────────────────────────────

const TICK_KEY = "worker_tick";

/** Called by the worker's tick (no session: internal route, token checked there). */
export async function recordWorkerTick(db: Database, now = new Date()) {
  const value = { at: now.toISOString() };
  await db.insert(appSettings).values({ key: TICK_KEY, value, updatedBy: "worker" }).onConflictDoUpdate({ target: appSettings.key, set: { value, updatedBy: "worker", updatedAt: now } });
}

/** Database, worker, data sync, jobs and disk, one line each. */
export async function systemHealth(db: Database, session: Session | null, now = new Date()): Promise<HealthItem[]> {
  assertCan(session, "staff");
  const t0 = Date.now();
  const dbOk = (await checkDatabase()) === "ok";
  const ms = Date.now() - t0;
  const out: HealthItem[] = [{ label: "Database", text: dbOk ? `Online · ${ms} ms` : "Unreachable", tone: dbOk ? "ok" : "bad" }];
  if (!dbOk) return out;

  const [[tick], settings, sources] = await Promise.all([
    db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, TICK_KEY)).limit(1),
    loadDataSettings(db),
    db.select({ ok: sql<boolean>`${jobSources.lastError} is null`, source: jobSources.source }).from(jobSources),
  ]);
  const at = (tick?.value as { at?: string } | undefined)?.at;
  out.push(workerHealth(at ? new Date(at) : null, now));

  if (settings.repo) {
    const last = settings.lastSyncAt ? new Date(settings.lastSyncAt) : null;
    out.push({ label: "Data sync", text: last ? `GitHub · ${ago(last, now)}` : "GitHub · not synced yet", tone: !last ? "warn" : now.getTime() - last.getTime() > 26 * 3_600_000 ? "warn" : "ok" });
  } else {
    out.push({ label: "Data sync", text: "Folder only (no repository)", tone: "off" });
  }

  if (sources.length) {
    const ok = sources.filter((s) => s.ok).length;
    out.push({ label: "Jobs sync", text: `${ok} of ${sources.length} sources OK`, tone: ok === sources.length ? "ok" : ok ? "warn" : "bad" });
  } else {
    out.push({ label: "Jobs sync", text: "Not run yet", tone: "off" });
  }

  try {
    const s = await statfs(dataRoot());
    const used = 1 - Number(s.bavail) / Number(s.blocks);
    out.push({ label: "Disk", text: `${Math.round(used * 100)}% used where the data folder is`, tone: used > 0.9 ? "bad" : used > 0.8 ? "warn" : "ok" });
  } catch {
    out.push({ label: "Disk", text: "Data folder not found", tone: "warn" });
  }
  return out;
}
