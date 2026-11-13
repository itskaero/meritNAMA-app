import "server-only";
import { and, asc, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { assertCan, type Session } from "@/lib/auth/roles";
import type { Database } from "@/lib/db/client";
import { appSettings, hospitals, jobSaves, jobSources, jobs } from "@/lib/db/schema";
import { nameKey } from "@/lib/domain/merit-round";
import { UserFacingError } from "@/lib/errors";
import { isUuid } from "@/lib/format";
import { jobzToRaw, parseJobzDetail, parseJobzList, parsePpsc, parsePshd, parseShcme, shortHash, type JobSource, type RawJob } from "@/lib/jobs/parse";
import { folderOf, isDoctorJob, jobState, mergeJobs, postType, todayPk, type Folder, type JobState, type PostType } from "@/lib/jobs/rules";
import { notifyFollowers } from "./notifications";
import { writeAudit, type Db } from "./shared";
import { ensureUser } from "./users";

/**
 * Jobs for doctors. The worker syncs every 6 hours from jobz.pk (medical category) and
 * the official SHC&ME, P&SHD and PPSC jobs pages; the team can also add an advert by hand.
 * Polite: one request a second, three listing pages, a detail page only for adverts we
 * have not seen, PDFs never fetched (we link to them). One source failing never stops
 * the others; each source's last run is recorded for Admin → Data → Jobs.
 */

export const JOBS_SYNC_EVERY_MS = 6 * 60 * 60 * 1000;
/** Closed adverts stay listed (as closed) this long after their last date. */
const KEEP_CLOSED_DAYS = 60;
const MAX_DETAILS_PER_RUN = 40;
const UA = "Mozilla/5.0 (compatible; meritNAMA-jobs/1.0; +https://meritnama.rekorex.online/contact)";

const JOBZ_PAGES = ["https://www.jobz.pk/medical-employment/", "https://www.jobz.pk/medical-employment-2/", "https://www.jobz.pk/medical-employment-3/"];
const OFFICIAL: { source: Exclude<JobSource, "jobzpk">; url: string; parse: (html: string) => RawJob[] }[] = [
  { source: "shcme", url: "https://health.punjab.gov.pk/Jobs.aspx", parse: (h) => parseShcme(h) },
  { source: "pshd", url: "https://pshealthpunjab.gov.pk/Home/Jobs", parse: (h) => parsePshd(h) },
  { source: "ppsc", url: "https://ppsc.gop.pk/Jobs.aspx", parse: (h) => parsePpsc(h) },
];

type FetchLike = typeof fetch;
export type SyncOptions = { fetch?: FetchLike; delayMs?: number; today?: string };

function politeFetcher(opts: SyncOptions) {
  const doFetch = opts.fetch ?? fetch;
  const gap = opts.delayMs ?? 1000;
  let last = 0;
  return async (url: string): Promise<string> => {
    if (/\.pdf($|\?)/i.test(url)) throw new Error("PDFs are never fetched");
    const wait = last + gap - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    const res = await doFetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(30_000), redirect: "follow" });
    if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
    return res.text();
  };
}

type SourceRun = { source: JobSource; found: number; kept: RawJob[]; seenIds: string[]; error: string | null };

async function runJobz(db: Db, get: (url: string) => Promise<string>): Promise<SourceRun> {
  const items = new Map<string, ReturnType<typeof parseJobzList>[number]>();
  try {
    for (const url of JOBZ_PAGES) for (const it of parseJobzList(await get(url))) items.set(it.id, it);
  } catch (e) {
    if (!items.size) return { source: "jobzpk", found: 0, kept: [], seenIds: [], error: String((e as Error).message ?? e) };
  }
  const ids = [...items.keys()];
  const known = new Set(
    ids.length ? (await db.select({ id: jobs.sourceId }).from(jobs).where(and(eq(jobs.source, "jobzpk"), inArray(jobs.sourceId, ids)))).map((r) => r.id) : [],
  );
  const kept: RawJob[] = [];
  let details = 0;
  for (const it of items.values()) {
    if (known.has(it.id)) continue;
    // Titles on the listing are often just the employer: read the advert itself, a few per run.
    if (details >= MAX_DETAILS_PER_RUN) break;
    details++;
    const d = await get(it.link).then(parseJobzDetail).catch(() => null);
    const raw = jobzToRaw(it, d);
    if (isDoctorJob(raw)) kept.push(raw);
  }
  return { source: "jobzpk", found: items.size, kept, seenIds: [...known], error: null };
}

async function runOfficial(src: (typeof OFFICIAL)[number], get: (url: string) => Promise<string>): Promise<SourceRun> {
  try {
    const all = src.parse(await get(src.url));
    return { source: src.source, found: all.length, kept: all.filter(isDoctorJob), seenIds: [], error: null };
  } catch (e) {
    return { source: src.source, found: 0, kept: [], seenIds: [], error: String((e as Error).message ?? e) };
  }
}

/** Employer → hospital id, when the employer names one of our hospitals. */
async function hospitalMatcher(db: Db) {
  const rows = await db.select({ id: hospitals.id, name: hospitals.name }).from(hospitals);
  const keys = rows.map((r) => ({ id: r.id, key: nameKey(r.name) })).filter((r) => r.key.length >= 8).sort((a, b) => b.key.length - a.key.length);
  return (j: Pick<RawJob, "employer" | "title">) => {
    const hay = ` ${nameKey(`${j.employer ?? ""} ${j.title}`)} `;
    return keys.find((k) => hay.includes(` ${k.key} `))?.id ?? null;
  };
}

function rowValues(j: RawJob, hospitalId: number | null) {
  return {
    source: j.source,
    sourceId: j.sourceId.slice(0, 120),
    title: j.title.slice(0, 300),
    employer: j.employer?.slice(0, 200) ?? null,
    city: j.city?.slice(0, 80) ?? null,
    postedOn: j.postedOn,
    lastDate: j.lastDate,
    link: j.link.slice(0, 1000),
    official: j.official,
    education: j.education.slice(0, 20),
    vacancies: j.vacancies.slice(0, 60),
    applyOnline: j.applyOnline,
    adNo: j.adNo,
    folder: folderOf(j),
    postType: postType(j),
    hospitalId,
  };
}

export type JobsSyncResult = { sources: { source: JobSource; found: number; kept: number; error: string | null }[]; added: number; updated: number; removed: number };

/** One sync across every source. Notifies followers of a hospital when a new advert names it. */
export async function syncJobs(db: Database, opts: SyncOptions = {}): Promise<JobsSyncResult> {
  const get = politeFetcher(opts);
  const runs: SourceRun[] = [await runJobz(db, get)];
  for (const src of OFFICIAL) runs.push(await runOfficial(src, get));
  const merged = mergeJobs(runs.flatMap((r) => r.kept));
  const matchHospital = await hospitalMatcher(db);
  const now = new Date();
  const today = opts.today ?? todayPk(now);
  let added = 0, updated = 0;
  const fresh: { id: string; title: string; hospitalId: number }[] = [];

  for (const j of merged) {
    const v = rowValues(j, matchHospital(j));
    const [r] = await db.insert(jobs).values({ ...v, firstSeen: now, lastSeen: now })
      .onConflictDoUpdate({
        target: [jobs.source, jobs.sourceId],
        set: { title: v.title, employer: v.employer, city: v.city, postedOn: v.postedOn, lastDate: v.lastDate, link: v.link, education: v.education, vacancies: v.vacancies, applyOnline: v.applyOnline, adNo: v.adNo, folder: v.folder, postType: v.postType, hospitalId: sql`coalesce(${jobs.hospitalId}, excluded.hospital_id)`, lastSeen: now },
      })
      .returning({ id: jobs.id, inserted: sql<boolean>`(xmax = 0)` });
    if (r?.inserted) {
      added++;
      if (v.hospitalId && jobState(v.lastDate, today) !== "closed") fresh.push({ id: r.id, title: v.title, hospitalId: v.hospitalId });
    } else updated++;
  }
  // jobz.pk adverts still listed but not re-read: just mark them seen.
  const seen = runs.flatMap((r) => r.seenIds);
  if (seen.length) await db.update(jobs).set({ lastSeen: now }).where(and(eq(jobs.source, "jobzpk"), inArray(jobs.sourceId, seen)));

  for (const n of fresh) {
    await notifyFollowers(db, [{ kind: "hospital", key: String(n.hospitalId) }], { kind: "new_job", title: `New job: ${n.title}`.slice(0, 200), href: `/portal/jobs?job=${n.id}` });
  }

  const cutoff = new Date(Date.parse(`${today}T00:00:00Z`) - KEEP_CLOSED_DAYS * 86_400_000).toISOString().slice(0, 10);
  const gone = await db.delete(jobs).where(and(eq(jobs.pinned, false), or(lt(jobs.lastDate, cutoff), and(isNull(jobs.lastDate), lt(jobs.lastSeen, new Date(now.getTime() - KEEP_CLOSED_DAYS * 86_400_000)))))).returning({ id: jobs.id });

  for (const r of runs) {
    const ok = r.error === null;
    await db.insert(jobSources).values({ source: r.source, lastRun: now, lastOk: ok ? now : null, lastError: r.error?.slice(0, 300) ?? null, found: r.found, kept: r.kept.length })
      .onConflictDoUpdate({ target: jobSources.source, set: { lastRun: now, ...(ok ? { lastOk: now } : {}), lastError: r.error?.slice(0, 300) ?? null, found: r.found, kept: r.kept.length } });
  }
  return { sources: runs.map((r) => ({ source: r.source, found: r.found, kept: r.kept.length, error: r.error })), added, updated, removed: gone.length };
}

const SYNC_KEY = "jobs_sync";

/** The worker's job: sync when the last run is 6 hours old (or never ran). */
export async function jobsSyncIfDue(db: Database, opts: SyncOptions = {}): Promise<boolean> {
  const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, SYNC_KEY)).limit(1);
  const last = (row?.value as { lastRun?: string } | undefined)?.lastRun;
  if (last && Date.now() - Date.parse(last) < JOBS_SYNC_EVERY_MS) return false;
  // Claim the run first, so a slow sync is not started twice by the next tick.
  const value = { lastRun: new Date().toISOString() };
  await db.insert(appSettings).values({ key: SYNC_KEY, value, updatedBy: "worker" }).onConflictDoUpdate({ target: appSettings.key, set: { value, updatedBy: "worker", updatedAt: new Date() } });
  await syncJobs(db, opts).catch((e) => console.error("jobs sync", e));
  return true;
}

/** Admin → Data → Jobs: Sync now. */
export async function syncJobsNow(db: Database, session: Session | null, opts: SyncOptions = {}): Promise<JobsSyncResult> {
  assertCan(session, "data.edit");
  const r = await syncJobs(db, opts);
  const value = { lastRun: new Date().toISOString() };
  await db.insert(appSettings).values({ key: SYNC_KEY, value, updatedBy: session.email }).onConflictDoUpdate({ target: appSettings.key, set: { value, updatedBy: session.email, updatedAt: new Date() } });
  await writeAudit(db, session.email, { action: "jobs.sync", entityType: "jobs", entityId: "all", after: r, reason: "Sync now" });
  return r;
}

// ── Reading ────────────────────────────────────────────────────────────────────

export type JobCard = {
  id: string; source: string; title: string; employer: string | null; city: string | null;
  postedOn: string | null; lastDate: string | null; link: string; official: boolean;
  education: string[]; vacancies: string[]; applyOnline: boolean | null; adNo: string | null;
  folder: Folder; postType: PostType; hospitalId: number | null; pinned: boolean; firstSeen: Date;
  state: JobState; saved: boolean;
};

export const jobFilterSchema = z.object({
  folder: z.enum(["ppsc", "teaching", "district", "federal", "private"]).optional(),
  state: z.enum(["open", "closing", "closed"]).optional(),
  postType: z.enum(["mo", "demonstrator", "registrar", "specialist", "faculty", "trainee", "other"]).optional(),
  q: z.string().trim().max(60).optional(),
  saved: z.boolean().optional(),
  hospitalId: z.number().int().positive().optional(),
});
export type JobFilter = z.infer<typeof jobFilterSchema>;

const cardColumns = {
  id: jobs.id, source: jobs.source, title: jobs.title, employer: jobs.employer, city: jobs.city, postedOn: jobs.postedOn,
  lastDate: jobs.lastDate, link: jobs.link, official: jobs.official, education: jobs.education, vacancies: jobs.vacancies,
  applyOnline: jobs.applyOnline, adNo: jobs.adNo, folder: jobs.folder, postType: jobs.postType, hospitalId: jobs.hospitalId,
  pinned: jobs.pinned, firstSeen: jobs.firstSeen,
};

/** The jobs page: every visible advert with its state, folder counts, and when we last looked. */
export async function listJobs(db: Database, session: Session | null, raw: JobFilter = {}) {
  assertCan(session, "portal");
  const f = jobFilterSchema.parse(raw);
  const me = await ensureUser(db, session);
  const today = todayPk();
  const [rows, saves, sync] = await Promise.all([
    db.select(cardColumns).from(jobs).where(eq(jobs.hidden, false)).orderBy(desc(jobs.pinned), asc(jobs.lastDate), desc(jobs.firstSeen)),
    db.select({ jobId: jobSaves.jobId }).from(jobSaves).where(eq(jobSaves.userId, me.id)),
    db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, SYNC_KEY)).limit(1),
  ]);
  const saved = new Set(saves.map((s) => s.jobId));
  const all: JobCard[] = rows.map((r) => ({
    ...r, folder: r.folder as Folder, postType: r.postType as PostType,
    education: (r.education as string[]) ?? [], vacancies: (r.vacancies as string[]) ?? [],
    state: jobState(r.lastDate, today), saved: saved.has(r.id),
  }));
  const live = all.filter((j) => j.state !== "closed");
  const folders = Object.fromEntries((["ppsc", "teaching", "district", "federal", "private"] as Folder[]).map((k) => [k, live.filter((j) => j.folder === k).length])) as Record<Folder, number>;
  const q = f.q?.toLowerCase();
  const shown = all.filter((j) =>
    (!f.folder || j.folder === f.folder) &&
    (f.state ? j.state === f.state || (f.state === "open" && j.state === "unknown") : j.state !== "closed") &&
    (!f.postType || j.postType === f.postType) &&
    (!f.saved || j.saved) &&
    (!f.hospitalId || j.hospitalId === f.hospitalId) &&
    (!q || `${j.title} ${j.employer ?? ""} ${j.city ?? ""} ${j.vacancies.join(" ")}`.toLowerCase().includes(q)),
  );
  return {
    jobs: shown,
    folders,
    open: live.length,
    closingSoon: live.filter((j) => j.state === "closing").length,
    savedCount: saved.size,
    lastSync: (sync[0]?.value as { lastRun?: string } | undefined)?.lastRun ?? null,
  };
}

/** Public landing teaser: the three newest open adverts, summary fields only. */
export async function jobTeaser(db: Database, limit = 3) {
  const today = todayPk();
  const rows = await db.select({ title: jobs.title, employer: jobs.employer, city: jobs.city, lastDate: jobs.lastDate, official: jobs.official })
    .from(jobs).where(and(eq(jobs.hidden, false), or(isNull(jobs.lastDate), sql`${jobs.lastDate} >= ${today}`))).orderBy(desc(jobs.firstSeen)).limit(Math.min(limit, 6));
  const [c] = await db.select({ n: sql<number>`count(*)::int` }).from(jobs).where(and(eq(jobs.hidden, false), or(isNull(jobs.lastDate), sql`${jobs.lastDate} >= ${today}`)));
  return { open: c?.n ?? 0, latest: rows };
}

// ── Members ────────────────────────────────────────────────────────────────────

export async function setJobSaved(db: Database, session: Session | null, jobId: unknown, on: boolean) {
  assertCan(session, "portal");
  if (!isUuid(jobId)) throw new UserFacingError("That job is no longer listed.");
  const me = await ensureUser(db, session);
  if (on) {
    const [j] = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.id, jobId)).limit(1);
    if (!j) throw new UserFacingError("That job is no longer listed.");
    await db.insert(jobSaves).values({ userId: me.id, jobId }).onConflictDoNothing();
  } else await db.delete(jobSaves).where(and(eq(jobSaves.userId, me.id), eq(jobSaves.jobId, jobId)));
  return on;
}

/** For the account export. */
export async function mySavedJobs(db: Db, userId: string) {
  return db.select({ title: jobs.title, employer: jobs.employer, link: jobs.link, savedAt: jobSaves.createdAt })
    .from(jobSaves).innerJoin(jobs, eq(jobs.id, jobSaves.jobId)).where(eq(jobSaves.userId, userId));
}

// ── Team ───────────────────────────────────────────────────────────────────────

export async function jobSourceHealth(db: Database, session: Session | null) {
  assertCan(session, "staff");
  const [sources, counts] = await Promise.all([
    db.select().from(jobSources).orderBy(asc(jobSources.source)),
    db.select({ source: jobs.source, n: sql<number>`count(*)::int`, hidden: sql<number>`count(*) filter (where ${jobs.hidden})::int` }).from(jobs).groupBy(jobs.source),
  ]);
  return { sources, counts };
}

/** Admin list: newest adverts first, hidden ones included. */
export async function adminJobs(db: Database, session: Session | null, limit = 200) {
  assertCan(session, "data.edit");
  return db.select({ id: jobs.id, source: jobs.source, title: jobs.title, employer: jobs.employer, lastDate: jobs.lastDate, link: jobs.link, folder: jobs.folder, hidden: jobs.hidden, pinned: jobs.pinned, firstSeen: jobs.firstSeen })
    .from(jobs).orderBy(desc(jobs.firstSeen)).limit(Math.min(limit, 500));
}

/** Hide (wrongly kept) or pin (important) an advert. */
export async function setJobFlags(db: Database, session: Session | null, jobId: unknown, flags: { hidden?: boolean; pinned?: boolean }) {
  assertCan(session, "data.edit");
  if (!isUuid(jobId)) throw new UserFacingError("That job is no longer listed.");
  return db.transaction(async (tx) => {
    const [before] = await tx.select({ hidden: jobs.hidden, pinned: jobs.pinned, title: jobs.title }).from(jobs).where(eq(jobs.id, jobId)).limit(1);
    if (!before) throw new UserFacingError("That job is no longer listed.");
    const set = { ...(flags.hidden !== undefined ? { hidden: flags.hidden } : {}), ...(flags.pinned !== undefined ? { pinned: flags.pinned } : {}) };
    if (!Object.keys(set).length) return before;
    await tx.update(jobs).set(set).where(eq(jobs.id, jobId));
    await writeAudit(tx, session.email, { action: "jobs.flag", entityType: "job", entityId: jobId, before, after: set, reason: before.title });
    return { ...before, ...set };
  });
}

export const manualJobSchema = z.object({
  title: z.string().trim().min(4).max(300),
  employer: z.string().trim().min(2).max(200),
  city: z.string().trim().max(80).optional().transform((v) => v || null),
  lastDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the date picker for the last date.").optional().or(z.literal("")).transform((v) => v || null),
  link: z.string().trim().url("Give the link to the advert.").max(1000).refine((u) => /^https?:\/\//.test(u), "The link must start with http."),
  official: z.boolean().default(true),
});

/** An advert the sync missed, added by the team (e.g. from a newspaper). */
export async function addManualJob(db: Database, session: Session | null, input: z.input<typeof manualJobSchema>) {
  assertCan(session, "data.edit");
  const v = manualJobSchema.parse(input);
  const raw: RawJob = { source: "jobzpk", sourceId: "", title: v.title, employer: v.employer, city: v.city, postedOn: todayPk(), lastDate: v.lastDate, link: v.link, official: v.official, education: [], vacancies: [], applyOnline: null, adNo: null };
  const matchHospital = await hospitalMatcher(db);
  return db.transaction(async (tx) => {
    const values = { ...rowValues(raw, matchHospital(raw)), source: "manual", sourceId: shortHash(v.link + v.title) };
    const [r] = await tx.insert(jobs).values(values).onConflictDoNothing().returning({ id: jobs.id });
    if (!r) throw new UserFacingError("That advert is already listed.");
    await writeAudit(tx, session.email, { action: "jobs.add", entityType: "job", entityId: r.id, after: values, reason: "Added by hand" });
    return r.id;
  });
}
