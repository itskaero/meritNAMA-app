import Link from "next/link";
import { AreaPage } from "@/components/area-page";
import { whenDatabaseDown } from "@/components/database-unavailable";
import { Icon } from "@/components/icon";
import { AuroraHeader } from "@/components/ui/aurora-header";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { Pill } from "@/components/ui/segmented";
import { getSession } from "@/lib/auth/session";
import { listJobs, type JobCard, type JobFilter } from "@/lib/data/jobs";
import { getDb } from "@/lib/db/client";
import { FOLDER_LABELS, POST_TYPE_LABELS, todayPk, type Folder, type PostType } from "@/lib/jobs/rules";
import { findSection } from "@/lib/navigation";
import { saveJobAction } from "./actions";

export const metadata = { title: "Jobs" };
export const dynamic = "force-dynamic";

const FOLDERS: Folder[] = ["ppsc", "teaching", "district", "federal", "private"];
const COVERS: Record<Folder, string> = {
  ppsc: "/images/v4/campus.jpg",
  teaching: "/images/v4/night-ward.jpg",
  district: "/images/brand/hospital-aerial.jpg",
  federal: "/images/brand/doctor-corridor.jpg",
  private: "/images/brand/study-desk.jpg",
};
const SOURCE_LABEL: Record<string, string> = { shcme: "SHC&ME", pshd: "P&SHD", ppsc: "PPSC", jobzpk: "jobz.pk", manual: "meritNAMA team" };

type Sp = { folder?: string; state?: string; type?: string; q?: string; saved?: string; job?: string };

const fmtDate = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : null);
const daysLeft = (iso: string | null) => (iso ? Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${todayPk()}T00:00:00Z`)) / 86_400_000) : null);
const ago = (iso: string | null) => {
  if (!iso) return "not yet";
  const h = Math.round((Date.now() - Date.parse(iso)) / 3_600_000);
  return h < 1 ? "under an hour ago" : h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
};

function href(sp: Sp, change: Partial<Sp>) {
  const next = { ...sp, ...change };
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(next)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `/portal/jobs?${s}` : "/portal/jobs";
}

export default async function JobsPage({ searchParams }: { searchParams: Promise<Sp> }) {
  const s = findSection("/portal/jobs");
  const title = "Jobs for doctors";
  const down = await whenDatabaseDown({ area: "portal", trail: [{ label: s.label }], title, description: s.description });
  if (down) return down;
  const sp = await searchParams;
  const filter: JobFilter = {
    folder: FOLDERS.includes(sp.folder as Folder) ? (sp.folder as Folder) : undefined,
    state: sp.state === "closing" || sp.state === "closed" ? sp.state : undefined,
    postType: sp.type && sp.type in POST_TYPE_LABELS ? (sp.type as PostType) : undefined,
    q: sp.q?.trim().slice(0, 60) || undefined,
    saved: sp.saved === "1" || undefined,
  };
  const data = await listJobs(getDb(), await getSession(), filter);
  const open = sp.job ? data.jobs.find((j) => j.id === sp.job) ?? null : null;
  const state = filter.state ?? "open";

  return (
    <AreaPage area="portal" trail={[{ label: s.label }]} title={title} bare>
      <AuroraHeader as="section" className="grid items-end gap-5 px-5 py-[22px] sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[13px] text-[#F3EEE5]/[.68]"><span className="mn-live h-2 w-2 rounded-full bg-[#3DDC97] shadow-[0_0_10px_#3DDC97]" />Updated {ago(data.lastSync)} · checked every 6 hours · official pages and jobz.pk</p>
          <h1 className="mt-2 text-[2rem] font-bold tracking-[-0.03em]">{data.open.toLocaleString("en-US")} open jobs for doctors</h1>
          <p className="mt-1.5 max-w-[640px] text-[#F3EEE5]/[.68]">Medical officer, demonstrator, registrar and specialist posts from PPSC, the Punjab health departments and newspaper adverts. We link to the original advert; always apply there.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form action="/portal/jobs" role="search" className="flex h-11 w-full items-center gap-2 rounded-xl border border-[#F3EEE5]/[.18] bg-[rgba(16,36,58,.55)] px-3.5 text-[#F3EEE5]/60 sm:w-[300px]">
            <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            {filter.folder ? <input type="hidden" name="folder" value={filter.folder} /> : null}
            {filter.state ? <input type="hidden" name="state" value={filter.state} /> : null}
            <input name="q" defaultValue={filter.q ?? ""} aria-label="Search jobs" placeholder="Post, hospital or city" className="min-w-0 flex-1 bg-transparent text-sm text-[#F3EEE5] outline-none placeholder:text-[#F3EEE5]/60" />
          </form>
          <Link href="/portal/explore" title="Follow a hospital: new jobs there reach your inbox" className="mn-btn inline-flex h-11 items-center rounded-xl px-[18px] text-[13px] font-semibold">Alert me</Link>
        </div>
      </AuroraHeader>

      {/* Folders: glass fronts over a photo cover. */}
      <nav aria-label="Job folders" className="-mx-1 overflow-x-auto px-1 pb-1">
        <ul className="grid min-w-[52rem] grid-cols-7 gap-3">
          {FOLDERS.map((f) => (
            <li key={f}>
              <FolderTile href={href(sp, { folder: filter.folder === f ? undefined : f, job: undefined })} label={FOLDER_LABELS[f]} count={data.folders[f]} cover={COVERS[f]} active={filter.folder === f} />
            </li>
          ))}
          <li><FolderTile href={href(sp, { state: state === "closing" ? undefined : "closing", job: undefined })} label="Closing this week" count={data.closingSoon} tone="amber" active={state === "closing"} /></li>
          <li><FolderTile href={href(sp, { saved: sp.saved === "1" ? undefined : "1", job: undefined })} label="Saved" count={data.savedCount} tone="violet" active={sp.saved === "1"} /></li>
        </ul>
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Job state" className="mn-seg">
          <Link href={href(sp, { state: undefined, job: undefined })} aria-current={state === "open" ? "page" : undefined}>Open {data.open}</Link>
          <Link href={href(sp, { state: "closing", job: undefined })} aria-current={state === "closing" ? "page" : undefined}>Closing this week {data.closingSoon}</Link>
          <Link href={href(sp, { state: "closed", job: undefined })} aria-current={state === "closed" ? "page" : undefined}>Closed</Link>
        </nav>
        <form action="/portal/jobs" className="flex flex-wrap items-center gap-2">
          {filter.folder ? <input type="hidden" name="folder" value={filter.folder} /> : null}
          {filter.state ? <input type="hidden" name="state" value={filter.state} /> : null}
          {filter.saved ? <input type="hidden" name="saved" value="1" /> : null}
          {filter.q ? <input type="hidden" name="q" value={filter.q} /> : null}
          <select name="type" defaultValue={filter.postType ?? ""} aria-label="Post type" className="mn-sel w-48">
            <option value="">All posts</option>
            {Object.entries(POST_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button type="submit" className="mn-ob h-9">Show</button>
        </form>
      </div>

      {open ? <JobDetail job={open} closeHref={href(sp, { job: undefined })} /> : null}

      {data.jobs.length === 0 ? (
        <EmptyState title={data.open ? "No jobs match" : "No jobs yet"}>
          {data.open ? "Try another folder or clear the search." : "The first check runs within 6 hours of the site starting. New adverts appear here, newest first."}
        </EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.jobs.map((j, i) => (
            <li key={j.id} className="mn-rise" style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}>
              <JobTile job={j} href={href(sp, { job: j.id })} />
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-subtle">meritNAMA is not affiliated with any employer. Each card links to the original advert; check the advert before applying.</p>
    </AreaPage>
  );
}

function FolderTile({ href, label, count, cover, tone, active }: { href: string; label: string; count: number; cover?: string; tone?: "amber" | "violet"; active: boolean }) {
  return (
    <Link href={href} aria-current={active ? "true" : undefined} className={cn("group mn-lift relative block h-32 overflow-hidden rounded-2xl border", active ? "border-violet-soft shadow-[0_0_24px_var(--mn-violet-glow)]" : "border-line")}>
      <span
        aria-hidden
        className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
        style={{ backgroundImage: cover ? `url(${cover})` : tone === "amber" ? "linear-gradient(135deg,#5a3a12,#E5A04B)" : "linear-gradient(135deg,#2a1f6b,#7B61FF)" }}
      />
      {/* The folder front: a glass panel with a tab, over the cover. */}
      <span className="absolute inset-x-0 bottom-0 h-[62%] rounded-t-xl border-t border-white/15 bg-[rgba(12,12,14,.62)] px-3 pt-2.5 backdrop-blur-md before:absolute before:-top-3 before:left-0 before:h-3 before:w-14 before:rounded-t-lg before:border-t before:border-white/15 before:bg-[rgba(12,12,14,.62)]">
        <span className="block truncate text-[0.8rem] font-semibold text-white">{label}</span>
        <span className={cn("mt-0.5 block text-xl font-semibold tabular-nums", tone === "amber" ? "text-[#E5A04B]" : "text-[#D6CCFF]")}>{count}</span>
      </span>
    </Link>
  );
}

function ApplyBy({ job }: { job: JobCard }) {
  const d = daysLeft(job.lastDate);
  if (job.state === "closed") return <Pill tone="neutral">Closed {fmtDate(job.lastDate)}</Pill>;
  if (job.lastDate == null) return <Pill tone="neutral">Last date in the advert</Pill>;
  return (
    <Pill tone={job.state === "closing" ? "amber" : "violet"}>
      {job.state === "closing" ? <span className="mn-live !bg-[var(--mn-amber)]" /> : null}
      Apply by {fmtDate(job.lastDate)}{d != null && d <= 7 ? ` · ${d === 0 ? "today" : `${d} day${d === 1 ? "" : "s"}`}` : ""}
    </Pill>
  );
}

function JobTile({ job, href }: { job: JobCard; href: string }) {
  const posts = job.vacancies.length;
  return (
    <article className="mn-lift mn-card-glass relative flex h-full flex-col overflow-hidden rounded-xl border border-line">
      <div aria-hidden className="h-20 bg-cover bg-center" style={{ backgroundImage: `linear-gradient(180deg, transparent, var(--mn-card)), url(${COVERS[job.folder]})` }} />
      <div className="flex flex-1 flex-col gap-3 p-5 pt-1">
        <div className="flex items-center gap-2">
          {job.official ? <Pill tone="success"><Icon name="check" className="h-3.5 w-3.5" />Official · {SOURCE_LABEL[job.source] ?? job.source}</Pill> : <Pill>via {SOURCE_LABEL[job.source] ?? job.source}</Pill>}
          {job.pinned ? <Pill tone="violet">Pinned</Pill> : null}
          <form action={saveJobAction} className="ml-auto">
            <input type="hidden" name="id" value={job.id} />
            <input type="hidden" name="on" value={job.saved ? "0" : "1"} />
            <button type="submit" aria-pressed={job.saved} aria-label={job.saved ? "Remove from saved" : "Save this job"} className={cn("grid h-9 w-9 place-items-center rounded-lg border transition-colors", job.saved ? "border-amber/60 text-amber shadow-[0_0_14px_var(--mn-glow-warm)]" : "border-line text-decor hover:text-ink")}>
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill={job.saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" /></svg>
            </button>
          </form>
        </div>
        <Link href={href} scroll={false} className="group">
          <h2 className="line-clamp-3 text-[1.15rem] font-semibold leading-snug text-heading group-hover:text-violet-pale">{job.title}</h2>
          {job.employer && job.employer !== job.title ? <p className="mt-1 line-clamp-1 text-sm text-muted">{job.employer}</p> : null}
        </Link>
        <div><ApplyBy job={job} /></div>
        <p className="mt-auto flex flex-wrap items-center gap-x-2 border-t border-line pt-3 text-xs text-muted">
          <span>{job.city ?? FOLDER_LABELS[job.folder]}</span>
          <span aria-hidden className="text-violet-soft">✦</span>
          <span>{POST_TYPE_LABELS[job.postType]}</span>
          {posts ? <><span aria-hidden className="text-violet-soft">✦</span><span>{posts} post{posts === 1 ? "" : "s"}</span></> : null}
        </p>
      </div>
    </article>
  );
}

function JobDetail({ job, closeHref }: { job: JobCard; closeHref: string }) {
  const rows: [string, React.ReactNode][] = [
    ["Employer", job.employer ?? "See the advert"],
    ["City", job.city ?? "See the advert"],
    ["Last date", job.lastDate ? `${fmtDate(job.lastDate)} ${job.lastDate.slice(0, 4)}` : "See the advert"],
    ["Posted", job.postedOn ? fmtDate(job.postedOn) : "Not given"],
    ["Who can apply", job.education.length ? job.education.join(", ") : "See the advert"],
    ["Apply online", job.applyOnline == null ? "See the advert" : job.applyOnline ? "Yes" : "No, by post or in person"],
  ];
  if (job.adNo) rows.push(["Advert no.", job.adNo]);
  return (
    <section aria-labelledby="job-detail" className="mn-card-glass rounded-xl border border-violet-soft/40 p-5 shadow-[0_0_30px_var(--mn-violet-glow)] sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            {job.official ? <Pill tone="success">Official · {SOURCE_LABEL[job.source]}</Pill> : <Pill>via {SOURCE_LABEL[job.source] ?? job.source}</Pill>}
            <Pill>{FOLDER_LABELS[job.folder]}</Pill>
            <ApplyBy job={job} />
          </div>
          <h2 id="job-detail" className="mt-3 text-xl font-semibold text-heading">{job.title}</h2>
        </div>
        <Link href={closeHref} scroll={false} aria-label="Close" className="mn-btn-ghost grid h-10 w-10 flex-none place-items-center rounded-lg"><Icon name="close" className="h-4 w-4" /></Link>
      </div>
      <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(([k, v]) => (
          <div key={k}><dt className="text-xs text-subtle">{k}</dt><dd className="text-sm text-ink">{v}</dd></div>
        ))}
      </dl>
      {job.vacancies.length ? (
        <div className="mt-4">
          <p className="text-xs text-subtle">Posts</p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">{job.vacancies.map((v) => <li key={v}><Pill>{v}</Pill></li>)}</ul>
        </div>
      ) : null}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <a href={job.link} target="_blank" rel="noopener noreferrer nofollow" className="mn-btn inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold">Open advert <span aria-hidden>↗</span></a>
        {job.hospitalId ? <Link href={`/portal/explore/hospitals/${job.hospitalId}`} className="mn-btn-ghost inline-flex h-10 items-center rounded-lg px-4 text-sm">Hospital page</Link> : null}
        <span className="text-xs text-subtle">From {SOURCE_LABEL[job.source] ?? job.source}. meritNAMA shows a summary; the advert is the official word.</span>
      </div>
    </section>
  );
}
