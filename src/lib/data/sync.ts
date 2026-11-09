import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { assertCan, type Session } from "@/lib/auth/roles";
import type { Database } from "@/lib/db/client";
import { gitBlobSha, selectSyncFiles, type TreeEntry } from "@/lib/domain/data-files";
import { env } from "@/lib/env";
import { UserFacingError } from "@/lib/errors";
import { autoImportDataFolder, DATA_FILE_MAX_BYTES, dataRoot, loadDataSettings, recordSync, SYSTEM_SESSION, writeDataFile } from "./datastore";
import { writeAudit } from "./shared";

/**
 * Pull a data repository (owner/name, a branch, an optional token for a private one)
 * into the data folder. Only the GitHub API host is contacted, and only paths that
 * look like datasets are fetched. Files already identical locally (by Git's blob hash)
 * are not downloaded again. The files then follow the same path as any others: they
 * appear in the checklist and, when auto-publish is on, new ones go live.
 */

const API = "https://api.github.com";
const MAX_FILES = 400;
const MAX_TOTAL_BYTES = 500 * 1024 * 1024;
const SYNC_EVERY_MS = 60 * 60 * 1000;

type FetchLike = typeof fetch;

function headers(raw: boolean): HeadersInit {
  const h: Record<string, string> = {
    Accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "meritnama-app",
  };
  const token = env().GITHUB_TOKEN;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

function explain(res: Response, what: string): UserFacingError {
  if (res.status === 401) return new UserFacingError("GitHub refused the token (GITHUB_TOKEN). Check that it is valid and has read access to the repository.");
  if (res.status === 403 || res.status === 429) return new UserFacingError("GitHub is limiting requests right now. Try again in a few minutes (a token raises the limit).");
  if (res.status === 404) return new UserFacingError("The repository or branch was not found. For a private repository, set GITHUB_TOKEN on the server.");
  return new UserFacingError(`GitHub answered ${res.status} while ${what}.`);
}

export type SyncResult = { repo: string; branch: string; downloaded: number; unchanged: number; skipped: number; truncated: boolean; message: string };

async function pull(db: Database, session: Session, opts: { root?: string; fetch?: FetchLike } = {}): Promise<SyncResult> {
  const settings = await loadDataSettings(db);
  if (!settings.repo) throw new UserFacingError("Set the repository to sync from first (owner/name).");
  const doFetch = opts.fetch ?? fetch;
  const { repo, branch } = settings;

  const treeRes = await doFetch(`${API}/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`, { headers: headers(false), signal: AbortSignal.timeout(60_000) });
  if (!treeRes.ok) throw explain(treeRes, "listing the repository");
  const tree = (await treeRes.json()) as { tree?: TreeEntry[]; truncated?: boolean };
  const { take, skipped, tooMany } = selectSyncFiles(tree.tree ?? [], DATA_FILE_MAX_BYTES, MAX_FILES);

  let downloaded = 0, unchanged = 0, total = 0;
  const root = dataRoot(opts.root);
  for (const e of take) {
    const local = await readFile(path.join(/* turbopackIgnore: true */ root, ...e.rel.split("/"))).catch(() => null);
    if (local && gitBlobSha(local) === e.sha) { unchanged++; continue; }
    total += e.size ?? 0;
    if (total > MAX_TOTAL_BYTES) throw new UserFacingError("The repository's data files are larger than 500 MB together. Sync a smaller repository or copy the files in directly.");
    const res = await doFetch(`${API}/repos/${repo}/git/blobs/${e.sha}`, { headers: headers(true), signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw explain(res, `downloading ${e.rel}`);
    await writeDataFile(session, e.rel, new Uint8Array(await res.arrayBuffer()), opts);
    downloaded++;
  }
  const truncated = Boolean(tree.truncated) || tooMany;
  const message = `${downloaded} downloaded, ${unchanged} already up to date${skipped ? `, ${skipped} other JSON files skipped` : ""}${truncated ? ". The repository is large: only the first files were looked at" : ""}.`;
  return { repo, branch, downloaded, unchanged, skipped, truncated, message };
}

/** The Sync now button. */
export async function syncDataFromRepo(db: Database, session: Session | null, opts: { root?: string; fetch?: FetchLike } = {}): Promise<SyncResult> {
  assertCan(session, "data.edit");
  try {
    const r = await pull(db, session, opts);
    await recordSync(db, `${r.repo}@${r.branch}: ${r.message}`);
    await writeAudit(db, session.email, { action: "data.sync", entityType: "data_folder", entityId: `${r.repo}@${r.branch}`, after: r, reason: "Sync from repository" });
    await autoImportDataFolder(db, opts);
    return r;
  } catch (e) {
    await recordSync(db, `Failed: ${e instanceof UserFacingError ? e.message : "see the server log"}`).catch(() => {});
    throw e;
  }
}

/** The worker's hourly job: sync when a repository is set and the last sync is old enough. */
export async function syncIfDue(db: Database, opts: { root?: string; fetch?: FetchLike } = {}): Promise<boolean> {
  const s = await loadDataSettings(db);
  if (!s.repo) return false;
  if (s.lastSyncAt && Date.now() - Date.parse(s.lastSyncAt) < SYNC_EVERY_MS) return false;
  try {
    const r = await pull(db, SYSTEM_SESSION, opts);
    await recordSync(db, `${r.repo}@${r.branch}: ${r.message}`);
  } catch (e) {
    await recordSync(db, `Failed: ${e instanceof UserFacingError ? e.message : "see the server log"}`);
    if (!(e instanceof UserFacingError)) console.error("data sync", e);
  }
  return true;
}
