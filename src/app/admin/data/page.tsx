import Link from "next/link";
import { AreaPage } from "@/components/area-page";
import { InductionCardView } from "@/components/admin/today";
import { Segmented } from "@/components/ui/segmented";
import { StatTiles } from "@/components/charts/stat-tiles";
import { whenDatabaseDown } from "@/components/database-unavailable";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/page-header";
import { getSession, requireSection } from "@/lib/auth/session";
import { dataRoot, dataSettings, estimateReadiness, listDataFiles, type DataFileItem, type DataStatus } from "@/lib/data/datastore";
import { inductionCards } from "@/lib/data/admin-today";
import { getDb } from "@/lib/db/client";
import { FILE_KINDS } from "@/lib/ingest/registry";
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

const TABS = ["inductions", "files", "reference", "estimates"] as const;
type Tab = (typeof TABS)[number];

export default async function AdminDataPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const asked = (await searchParams).tab;
  const tab: Tab = (TABS as readonly string[]).includes(asked ?? "") ? (asked as Tab) : "inductions";
  await requireSection("/admin/data");
  const s = findSection("/admin/data");
  const down = await whenDatabaseDown({ area: "admin", trail: [{ label: s.label }], title: s.label, description: s.description });
  if (down) return down;
  const db = getDb();
  const session = await getSession();
  const [files, settings, readiness, cards] = await Promise.all([listDataFiles(db, session), dataSettings(db, session), estimateReadiness(db, session), inductionCards(db, session)]);

  const shown = files.filter((f) => f.status !== "ignored");
  const skipped = files.filter((f) => f.status === "ignored");
  const count = (st: DataStatus) => files.filter((f) => f.status === st).length;
  const fresh = count("new"), waiting = count("replaces"), problems = count("problem");
  const byInduction = new Map<number | null, DataFileItem[]>();
  for (const f of shown) byInduction.set(f.induction, [...(byInduction.get(f.induction) ?? []), f]);
  const groups = [...byInduction.entries()].sort((a, b) => (b[0] ?? -1) - (a[0] ?? -1));
  const general = shown.filter((f) => f.induction === null);
  const open = cards.filter((c) => !c.closed);
  const closed = cards.filter((c) => c.closed);
  const tabs = [
    { href: "/admin/data", label: "Inductions", active: tab === "inductions", count: cards.length },
    { href: "/admin/data?tab=files", label: "Files", active: tab === "files", count: fresh + waiting + problems || undefined },
    { href: "/admin/data?tab=reference", label: "Reference", active: tab === "reference" },
    { href: "/admin/data?tab=estimates", label: "Estimates", active: tab === "estimates" },
  ];

  return (
    <AreaPage
      area="admin"
      trail={[{ label: s.label }]}
      title={s.label}
      description={s.description}
      status={<StatusPill tone={problems || waiting ? "warning" : "live"}>{problems ? `${problems} with a problem` : waiting ? `${waiting} waiting for a click` : "All up to date"}</StatusPill>}
    >
      <Segmented label="Data" items={tabs} />
      <ol aria-label="What happens to a file" className="flex flex-wrap items-center gap-2 text-xs text-muted">
        {["Folder", "Recognised", "Personal fields stripped", "Live", "Estimate"].map((x, i) => (
          <li key={x} className="flex items-center gap-2">{i ? <span aria-hidden>→</span> : null}<span className="rounded-full border border-line px-2.5 py-1">{x}</span></li>
        ))}
      </ol>

      {tab === "inductions" ? (
        cards.length === 0 ? (
          <EmptyState title="No inductions yet">Drop an induction&apos;s files under the Files tab, or sync a data repository.</EmptyState>
        ) : (
          <div className="grid gap-4">
            {open.map((c) => <InductionCardView key={c.induction} c={c} />)}
            {closed.length ? (
              <details className="rounded-2xl border border-line bg-card p-4">
                <summary className="cursor-pointer text-sm font-medium text-muted">Inductions {closed.at(-1)!.induction}–{closed[0]!.induction} · closed · {closed.length} more</summary>
                <div className="mt-4 grid gap-4">{closed.map((c) => <InductionCardView key={c.induction} c={c} />)}</div>
              </details>
            ) : null}
            <p className="text-xs text-muted">✓ official · ◐ unofficial (replaced as each official file lands) · ◆ estimate · ◷ a file is in, not applied yet · ○ not in yet</p>
          </div>
        )
      ) : null}

      {tab === "files" ? (<>
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
        <CardHeader title="File kinds" description="Each kind is one module: how it is recognised, checked, stripped and applied." />
        <ul className="grid gap-2 sm:grid-cols-2">
          {FILE_KINDS.filter((k) => !k.ignore).map((k) => (
            <li key={k.kind} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-sm">
              <span>{k.label}</span>
              <Badge tone={k.official ? "success" : "calculated"}>{k.official ? "official" : "for estimates"}</Badge>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader title="Settings" />
        <SettingsForm initial={{ autoPublish: settings.autoPublish, repo: settings.repo, branch: settings.branch }} tokenSet={settings.tokenSet} />
      </Card>
      </>) : null}

      {tab === "reference" ? (
        <Card>
          <CardHeader title={`Policy and reference files · ${general.length}`} description="Scoring policy, seat-independent lookups and documents shared by every induction." />
          {general.length ? <ul className="grid gap-2">{general.map((f) => <FileRow key={f.id} f={f} />)}</ul> : <p className="text-sm text-muted">No policy or reference files in the folder.</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/admin/reference-data" className="mn-btn-ghost inline-flex h-9 items-center rounded-lg px-3 text-sm">Seat matrices, lookups and documents</Link>
            <Link href="/admin/inductions" className="mn-btn-ghost inline-flex h-9 items-center rounded-lg px-3 text-sm">Merit lists and names to map</Link>
            <Link href="/admin/policies" className="mn-btn-ghost inline-flex h-9 items-center rounded-lg px-3 text-sm">Scoring policies</Link>
          </div>
        </Card>
      ) : null}

      {tab === "estimates" ? (
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
        <p className="mt-4 text-sm text-muted">Runs, comparisons and publishing are under <Link href="/admin/processing" className="text-signal hover:underline">Processing &amp; simulation</Link>. New official files queue the next estimate by themselves; nothing is published without a person.</p>
      </Card>
      ) : null}
    </AreaPage>
  );
}
