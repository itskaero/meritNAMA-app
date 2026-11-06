import Link from "next/link";
import { AreaPage } from "@/components/area-page";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { StatusPill } from "@/components/ui/page-header";
import { getSession, requireSection } from "@/lib/auth/session";
import { failInterruptedRuns, listDatasets, listRuns, listSimulationFolders } from "@/lib/data/simulation";
import { checkDatabase, getDb } from "@/lib/db/client";
import { formatUtc } from "@/lib/format";
import { findSection } from "@/lib/navigation";
import { ImportDatasetForm, StartRunForm } from "./forms";
import { RUN_TONE } from "./status";

export const metadata = { title: "Processing & simulation" };
export const dynamic = "force-dynamic";

const ROLE_LABEL = { candidates: "Candidates", components: "Corrected marks", certificates: "Certificates", profileStatus: "Profile status" } as const;
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

export default async function ProcessingPage() {
  await requireSection("/admin/processing");
  const s = findSection("/admin/processing");
  const session = await getSession();
  const dbStatus = await checkDatabase();
  const db = dbStatus === "ok" ? getDb() : null;
  if (db) await failInterruptedRuns(db);
  const folders = await listSimulationFolders(session);
  const datasets = db ? await listDatasets(db, session) : [];
  const runs = db ? await listRuns(db, session) : [];
  const inductions = [...new Set([...folders.map((f) => f.induction), ...datasets.map((d) => d.inductionId)])].sort((a, b) => b - a);

  return (
    <AreaPage
      area="admin"
      trail={[{ label: s.label }]}
      title={s.label}
      description="Import an induction's restricted simulation data from the server's storage volume, simulate round 1 under its allocation rules, and compare the result with the round PHF published."
      status={db ? <StatusPill tone="live">Live data</StatusPill> : <StatusPill tone="warning">Database unavailable</StatusPill>}
    >
      <Notice title="Restricted data stays on the server">
        Put the files in <code>simulation/induction&lt;n&gt;/</code> on the storage volume (in Docker: <code>$MERITNAMA_DATA_DIR/storage/simulation/induction21/</code>):
        <code> candidates.json</code>, and optionally <code>components.json</code>, <code>certificates.json</code> and <code>profile_status.json</code> (the legacy
        <code> induction21_candidates.json</code> and <code>ProfileStatus.json</code> names work too). Importing keeps only marks, preferences, certificate marks and
        profile status: names, PMDC numbers, emails, phone numbers and CNICs are never stored.
      </Notice>

      {inductions.length === 0 ? (
        <EmptyState title="No simulation data yet">Create the induction folder on the storage volume and put its files there, then reload this page.</EmptyState>
      ) : (
        inductions.map((n) => {
          const folder = folders.find((f) => f.induction === n);
          const ds = datasets.find((d) => d.inductionId === n);
          return (
            <Card key={n}>
              <CardHeader
                title={`Induction ${n}`}
                description={ds ? `Imported ${formatUtc(ds.importedAt)} UTC by ${ds.importedBy}` : "Not imported yet"}
                action={ds ? <Badge tone="current">ready to simulate</Badge> : undefined}
              />
              <div className="grid gap-5 lg:grid-cols-2">
                <div className="grid content-start gap-3">
                  <h3 className="text-sm font-semibold">Files on the volume</h3>
                  {folder?.files.length ? (
                    <ul className="grid gap-1 text-sm">
                      {folder.files.map((f) => (
                        <li key={f.name} className="flex justify-between gap-3"><span>{ROLE_LABEL[f.role]} <span className="font-mono text-xs text-subtle">{f.name}</span></span><span className="tabular-nums text-muted">{mb(f.size)}</span></li>
                      ))}
                    </ul>
                  ) : <p className="text-sm text-muted">No files found.</p>}
                  {folder?.ignored.length ? <p className="text-xs text-amber">Not used: {folder.ignored.join(", ")}</p> : null}
                  {folder && !folder.files.some((f) => f.role === "profileStatus") ? <p className="text-xs text-amber">No profile status file: everyone takes part, so rejected profiles may take seats.</p> : null}
                  {folder?.files.some((f) => f.role === "candidates") ? <ImportDatasetForm induction={n} replaces={Boolean(ds)} /> : null}
                </div>
                <div className="grid content-start gap-3">
                  <h3 className="text-sm font-semibold">Stored data</h3>
                  {ds ? (
                    <>
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                        <dt className="text-muted">Candidates</dt><dd className="tabular-nums">{ds.summary.candidates.toLocaleString("en-US")}</dd>
                        <dt className="text-muted">Preferences</dt><dd className="tabular-nums">{ds.summary.preferences.toLocaleString("en-US")}</dd>
                        <dt className="text-muted">Accepted profiles</dt><dd className="tabular-nums">{ds.summary.eligible.toLocaleString("en-US")} of {ds.summary.withStatus.toLocaleString("en-US")} with a status</dd>
                        <dt className="text-muted">With certificates</dt><dd className="tabular-nums">{ds.summary.withCertificates.toLocaleString("en-US")}</dd>
                        <dt className="text-muted">Corrected marks</dt><dd className="tabular-nums">{ds.summary.correctedMarks.toLocaleString("en-US")}</dd>
                      </dl>
                      <StartRunForm induction={n} />
                    </>
                  ) : <p className="text-sm text-muted">Import the files to simulate this induction.</p>}
                </div>
              </div>
            </Card>
          );
        })
      )}

      <Card>
        <CardHeader title="Runs" description="Each run records the allocation rules and scoring policy it used. Agreement is the share of PHF's published round-1 allocations the simulation reproduced exactly." />
        <DataTable
          caption="Simulation runs"
          rows={runs}
          rowKey={(r) => r.id}
          empty={<EmptyState title="No runs yet">Import an induction&apos;s data, then simulate round 1.</EmptyState>}
          columns={[
            { key: "when", header: "Started (UTC)", cell: (r) => <Link href={`/admin/processing/runs/${r.id}`} className="font-medium text-signal underline-offset-4 hover:underline">{formatUtc(r.createdAt)}</Link> },
            { key: "n", header: "Induction", cell: (r) => r.inductionId },
            { key: "status", header: "Status", cell: (r) => <Badge tone={RUN_TONE[r.status]}>{r.status}</Badge> },
            { key: "rules", header: "Rules · policy", cell: (r) => `${r.rulesOrigin} · ${r.policy ?? "no policy"}` },
            { key: "placed", header: "Placed", align: "right", cell: (r) => r.summary?.placed.toLocaleString("en-US") ?? "—" },
            { key: "agree", header: "Agreement", align: "right", cell: (r) => (r.summary?.comparison ? `${r.summary.comparison.agreement}%` : "—") },
          ]}
        />
      </Card>
    </AreaPage>
  );
}
