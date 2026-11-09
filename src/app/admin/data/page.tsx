import Link from "next/link";
import { AreaPage } from "@/components/area-page";
import { StatTiles } from "@/components/charts/stat-tiles";
import { whenDatabaseDown } from "@/components/database-unavailable";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/page-header";
import { getSession, requireSection } from "@/lib/auth/session";
import { dataRoot, dataSettings, estimateReadiness, listDataFiles, type DataFileItem, type DataStatus } from "@/lib/data/datastore";
import { getDb } from "@/lib/db/client";
import { formatUtc } from "@/lib/format";
import { findSection } from "@/lib/navigation";
import { BuildEstimateForm, DropZone, FileActions, PublishAllButton, RescanButton, SettingsForm, SyncButton } from "./forms";

export const metadata = { title: "Data" };
export const dynamic = "force-dynamic";

const STATUS: Record<DataStatus, { label: string; tone: BadgeTone }> = {
  new: { label: "New · ready", tone: "success" },
  replaces: { label: "Replaces live data · needs a click", tone: "warning" },
  live: { label: "Live", tone: "success" },
  held: { label: "Kept for estimates", tone: "calculated" },
  problem: { label: "Problem", tone: "danger" },
  ignored: { label: "Skipped", tone: "neutral" },
  missing: { label: "No longer in the folder", tone: "neutral" },
};

const size = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function FileRow({ f }: { f: DataFileItem }) {
  const s = STATUS[f.status];
  const pending = f.status === "replaces" && f.changeId && f.changeStatus === "pending";
  return (
    <li className="grid gap-2 rounded-xl border border-line bg-canvas p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={s.tone}>{s.label}</Badge>
          <span className="text-sm font-medium">{f.summary ?? f.kindLabel}</span>
        </div>
        <p className="mt-1 break-all font-mono text-xs text-muted">{f.path} · {size(f.sizeBytes)}</p>
        {f.message ? <p className={f.status === "problem" ? "mt-1 text-sm text-danger" : "mt-1 text-sm text-muted"}>{f.message}</p> : null}
        {f.appliedAt ? <p className="mt-1 text-xs text-subtle">Applied {formatUtc(f.appliedAt)} UTC{f.appliedBy ? ` by ${f.appliedBy.replace(/@.*/, "")}` : ""}</p> : null}
      </div>
      <FileActions id={f.id} status={f.status} canApply={f.status === "new" || f.status === "replaces"} changeId={pending ? f.changeId : null} />
    </li>
  );
}

export default async function AdminDataPage() {
  await requireSection("/admin/data");
  const s = findSection("/admin/data");
  const down = await whenDatabaseDown({ area: "admin", trail: [{ label: s.label }], title: s.label, description: s.description });
  if (down) return down;
  const db = getDb();
  const session = await getSession();
  const [files, settings, readiness] = await Promise.all([listDataFiles(db, session), dataSettings(db, session), estimateReadiness(db, session)]);

  const shown = files.filter((f) => f.status !== "ignored");
  const skipped = files.filter((f) => f.status === "ignored");
  const count = (st: DataStatus) => files.filter((f) => f.status === st).length;
  const fresh = count("new"), waiting = count("replaces"), problems = count("problem");
  const byInduction = new Map<number | null, DataFileItem[]>();
  for (const f of shown) byInduction.set(f.induction, [...(byInduction.get(f.induction) ?? []), f]);
  const groups = [...byInduction.entries()].sort((a, b) => (b[0] ?? -1) - (a[0] ?? -1));

  return (
    <AreaPage
      area="admin"
      trail={[{ label: s.label }]}
      title={s.label}
      description={s.description}
      status={<StatusPill tone={problems || waiting ? "warning" : "live"}>{problems ? `${problems} with a problem` : waiting ? `${waiting} waiting for a click` : "All up to date"}</StatusPill>}
    >
      <StatTiles
        stats={[
          { label: "Files", value: shown.length },
          { label: "New", value: fresh, hint: settings.autoPublish ? "Published automatically" : "Press Publish" },
          { label: "Waiting for a click", value: waiting, hint: "Would replace live data" },
          { label: "Problems", value: problems, hint: "Nothing from these is applied" },
        ]}
      />

      <Card>
        <CardHeader title="Add data" description="Every way ends in the same folder and the same list below." />
        <div className="grid gap-5">
          <DropZone autoPublish={settings.autoPublish} />
          <div className="grid gap-3 text-sm text-muted sm:grid-cols-2">
            <p><span className="font-semibold text-ink">On the NAS:</span> copy files into <code className="font-mono text-xs">{dataRoot()}</code> (File Station or a network share), then press Rescan. The worker also looks every minute.</p>
            <p>
              <span className="font-semibold text-ink">From GitHub:</span>{" "}
              {settings.repo ? (
                <>pulls <code className="font-mono text-xs">{settings.repo}@{settings.branch}</code>{settings.lastSyncAt ? <>. Last sync {formatUtc(new Date(settings.lastSyncAt))} UTC: {settings.lastSyncMessage}</> : ". Not synced yet."}</>
              ) : "set a repository under Settings below, then press Sync now."}
            </p>
          </div>
          <div className="flex flex-wrap items-start gap-4">
            <RescanButton />
            <SyncButton ready={Boolean(settings.repo)} />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title={`Files · ${shown.length}`} description="What the app made of each file. Names, PMDC numbers, emails and phones are dropped as a file is read; only applicant IDs, marks, preferences, consent and seats are kept." />
        {fresh && !settings.autoPublish ? <div className="mb-4"><PublishAllButton count={fresh} /></div> : null}
        {groups.length === 0 ? (
          <EmptyState title="The folder is empty">Drop the JSON files of an induction above, or sync a data repository.</EmptyState>
        ) : (
          <div className="grid gap-6">
            {groups.map(([induction, list]) => (
              <section key={induction ?? "general"} aria-label={induction ? `Induction ${induction}` : "General files"} className="grid gap-2">
                <h3 className="text-sm font-semibold">
                  {induction ? <>Induction {induction} <Link href={`/portal/history/${induction}`} className="ml-2 text-xs font-normal text-signal hover:underline">open the lists</Link></> : "General · policy and reference files"}
                </h3>
                <ul className="grid gap-2">{list.map((f) => <FileRow key={f.id} f={f} />)}</ul>
              </section>
            ))}
          </div>
        )}
        {skipped.length ? (
          <details className="mt-6 text-sm">
            <summary className="cursor-pointer font-medium text-muted">{skipped.length} skipped file{skipped.length === 1 ? "" : "s"}</summary>
            <ul className="mt-2 grid gap-1">
              {skipped.map((f) => (
                <li key={f.id} className="rounded-lg bg-canvas px-3 py-2">
                  <span className="break-all font-mono text-xs">{f.path}</span>
                  <span className="block text-xs text-muted">{f.message}</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </Card>

      <Card>
        <CardHeader title="Estimates" description="Estimated merit lists need the gazette, the candidates (or marks and preferences) and, optionally, certificates and components for the induction." />
        {readiness.length === 0 ? (
          <p className="text-sm text-muted">No estimate inputs in the folder yet. Put a gazette and the candidates&apos; preferences in <code className="font-mono text-xs">inductions/&lt;n&gt;/</code>.</p>
        ) : (
          <ul className="grid gap-3">
            {readiness.map((r) => (
              <li key={r.induction} className="grid gap-2 rounded-xl border border-line bg-canvas p-3">
                <p className="text-sm"><span className="font-semibold">Induction {r.induction}</span> <span className="text-muted">· has {r.roles.map((x) => (x === "profileStatus" ? "profile status" : x)).join(", ")}</span></p>
                {r.problem ? <p className="text-sm text-muted">{r.problem}</p> : <BuildEstimateForm induction={r.induction} />}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Settings" />
        <SettingsForm initial={{ autoPublish: settings.autoPublish, repo: settings.repo, branch: settings.branch }} tokenSet={settings.tokenSet} />
      </Card>
    </AreaPage>
  );
}
