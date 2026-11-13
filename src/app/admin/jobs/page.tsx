import { AreaPage } from "@/components/area-page";
import { whenDatabaseDown } from "@/components/database-unavailable";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getSession, requireSection } from "@/lib/auth/session";
import { adminJobs, jobSourceHealth } from "@/lib/data/jobs";
import { getDb } from "@/lib/db/client";
import { formatUtc } from "@/lib/format";
import { FOLDER_LABELS, type Folder } from "@/lib/jobs/rules";
import { findSection } from "@/lib/navigation";
import { flagJobAction } from "./actions";
import { AddJobForm, SyncJobsButton } from "./forms";

export const metadata = { title: "Jobs" };
export const dynamic = "force-dynamic";

const NAMES: Record<string, string> = { jobzpk: "jobz.pk (medical)", shcme: "SHC&ME jobs page", pshd: "P&SHD jobs page", ppsc: "PPSC advertisements", manual: "Added by hand" };

function Flag({ id, flag, on, label }: { id: string; flag: "hidden" | "pinned"; on: boolean; label: string }) {
  return (
    <form action={flagJobAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="flag" value={flag} />
      <input type="hidden" name="on" value={on ? "0" : "1"} />
      <button type="submit" className="mn-btn-ghost h-8 rounded-lg px-2.5 text-xs">{label}</button>
    </form>
  );
}

export default async function AdminJobsPage() {
  await requireSection("/admin/jobs");
  const s = findSection("/admin/jobs");
  const down = await whenDatabaseDown({ area: "admin", trail: [{ label: s.label }], title: s.label, description: s.description });
  if (down) return down;
  const db = getDb();
  const session = await getSession();
  const [health, list] = await Promise.all([jobSourceHealth(db, session), adminJobs(db, session)]);
  const count = new Map(health.counts.map((c) => [c.source, c]));

  return (
    <AreaPage area="admin" trail={[{ label: s.label }]} title={s.label} description={s.description}>
      <Card>
        <CardHeader title="Sources" description="Checked every 6 hours by the worker, one request a second. PDFs are never downloaded; members get the link." action={<SyncJobsButton />} />
        <ul className="grid gap-2 md:grid-cols-2">
          {["jobzpk", "shcme", "pshd", "ppsc", "manual"].map((src) => {
            const h = health.sources.find((x) => x.source === src);
            const c = count.get(src);
            return (
              <li key={src} className="rounded-xl border border-line bg-canvas/60 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{NAMES[src]}</span>
                  {src === "manual" ? null : !h ? <Badge>Not run yet</Badge> : h.lastError ? <Badge tone="danger">Failed</Badge> : <Badge tone="success">OK</Badge>}
                </div>
                <p className="mt-1 text-xs text-muted">
                  {c ? `${c.n} listed${c.hidden ? `, ${c.hidden} hidden` : ""}` : "None listed"}
                  {h ? ` · last check ${formatUtc(h.lastRun)} UTC · ${h.found} found, ${h.kept} for doctors` : ""}
                </p>
                {h?.lastError ? <p className="mt-1 text-xs text-danger">{h.lastError}</p> : null}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <CardHeader title="Add an advert by hand" description="For an advert the sources missed (a newspaper ad, a hospital notice board). Members see it at once." />
        <AddJobForm />
      </Card>

      <Card>
        <CardHeader title="Adverts" description="Newest first. Hide one the doctors-only filter let through; pin one to keep it at the top (pinned adverts are never removed)." />
        {list.length === 0 ? <EmptyState title="No adverts yet">Run Sync now, or wait for the worker&rsquo;s next check.</EmptyState> : (
          <ul className="divide-y divide-line">
            {list.map((j) => (
              <li key={j.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <a href={j.link} target="_blank" rel="noopener noreferrer nofollow" className="text-sm font-medium text-ink hover:underline">{j.title}</a>
                  <p className="text-xs text-muted">{NAMES[j.source] ?? j.source} · {FOLDER_LABELS[j.folder as Folder] ?? j.folder}{j.employer ? ` · ${j.employer}` : ""}{j.lastDate ? ` · last date ${j.lastDate}` : ""}</p>
                </div>
                {j.hidden ? <Badge tone="warning">Hidden</Badge> : null}
                {j.pinned ? <Badge tone="current">Pinned</Badge> : null}
                <Flag id={j.id} flag="pinned" on={j.pinned} label={j.pinned ? "Unpin" : "Pin"} />
                <Flag id={j.id} flag="hidden" on={j.hidden} label={j.hidden ? "Show" : "Hide"} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </AreaPage>
  );
}
