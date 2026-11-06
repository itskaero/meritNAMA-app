import { notFound } from "next/navigation";
import { AreaPage } from "@/components/area-page";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Notice } from "@/components/ui/notice";
import { getSession, requireSection } from "@/lib/auth/session";
import { getRun } from "@/lib/data/simulation";
import { getDb } from "@/lib/db/client";
import { describeRules } from "@/lib/engine/rules";
import { formatMarks, formatUtc, isUuid } from "@/lib/format";
import { RUN_TONE } from "../../status";
import { Refresh } from "./refresh";

export const metadata = { title: "Simulation run" };
export const dynamic = "force-dynamic";

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-2 font-mono text-2xl tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-subtle">{hint}</p> : null}
    </div>
  );
}

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSection("/admin/processing");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const run = await getRun(getDb(), await getSession(), id);
  if (!run) notFound();
  const s = run.summary;
  const c = s?.comparison ?? null;
  const n = (v: number) => v.toLocaleString("en-US");

  return (
    <AreaPage
      area="admin"
      trail={[{ label: "Processing & simulation", href: "/admin/processing" }, { label: `Induction ${run.inductionId} run` }]}
      title={`Induction ${run.inductionId} · round 1 simulation`}
      description={`Started ${formatUtc(run.createdAt)} UTC by ${run.createdBy} · rules ${run.rulesOrigin} · scoring policy ${run.policy ?? "none"} · data imported ${formatUtc(run.datasetImportedAt)} UTC`}
      status={<Badge tone={RUN_TONE[run.status]} className="mx-2">{run.status}</Badge>}
    >
      <Badge tone="simulated">Simulated — not an official result</Badge>
      {run.status === "queued" || run.status === "running" ? <Refresh /> : null}
      {run.status === "failed" ? <Notice tone="warning" title="The run failed">{run.error}</Notice> : null}

      {s ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Figure label="Candidates taking part" value={n(s.eligible)} hint={`of ${n(s.candidates)} imported, by profile status`} />
            <Figure label="Placed" value={n(s.placed)} hint={`${n(s.byProgram.reduce((t, p) => t + p.seats, 0))} seats`} />
            <Figure label="Same as published" value={c ? `${c.agreement}%` : "—"} hint={c ? `${n(c.same)} of ${n(c.published)} published allocations` : "Round 1 is not imported for this induction"} />
            <Figure label="Seat groups identical" value={c ? `${n(c.groupsExact)} / ${n(c.groupsTotal)}` : "—"} />
          </div>
          {s.unnamedPreferences ? <Notice tone="warning" title={`${n(s.unnamedPreferences)} preferences skipped`}>Their speciality id has no name under Reference data → Lookups, so they could not be matched to seats.</Notice> : null}

          <Card>
            <CardHeader title="By programme" />
            <DataTable caption="Results by programme" rows={s.byProgram} rowKey={(r) => r.program} columns={[
              { key: "p", header: "Programme", cell: (r) => r.program },
              { key: "pool", header: "Applied", align: "right", cell: (r) => n(r.pool) },
              { key: "seats", header: "Seats", align: "right", cell: (r) => n(r.seats) },
              { key: "placed", header: "Placed", align: "right", cell: (r) => n(r.placed) },
              { key: "agree", header: "Same as published", align: "right", cell: (r) => { const b = c?.byProgram.find((x) => x.program === r.program); return b ? `${b.agreement}% (${n(b.same)}/${n(b.published)})` : "—"; } },
            ]} />
          </Card>

          {c && c.differing.length ? (
            <Card>
              <CardHeader title="Seat groups that differ" description={`${n(c.groupsTotal - c.groupsExact)} groups differ; the ${c.differing.length} with the largest difference are shown. Closing = lowest mark allocated.`} />
              <DataTable caption="Differing seat groups" rows={c.differing} rowKey={(r) => r.group} columns={[
                { key: "g", header: "Programme · quota · speciality · hospital", cell: (r) => r.group },
                { key: "pub", header: "Published", align: "right", cell: (r) => n(r.published) },
                { key: "sim", header: "Simulated", align: "right", cell: (r) => n(r.simulated) },
                { key: "same", header: "Same people", align: "right", cell: (r) => n(r.same) },
                { key: "pc", header: "Published closing", align: "right", tone: "mono", cell: (r) => (r.publishedClosing == null ? "—" : formatMarks(r.publishedClosing)) },
                { key: "sc", header: "Simulated closing", align: "right", tone: "mono", cell: (r) => (r.simulatedClosing == null ? "—" : formatMarks(r.simulatedClosing)) },
              ]} />
            </Card>
          ) : null}
        </>
      ) : null}

      {s?.resolved ? (
        <Card>
          <CardHeader title="Rules used" description={`Allocation rules ${run.rulesOrigin} under scoring policy ${run.policy ?? "none"}, as the run applied them.`} />
          <dl className="grid gap-2 text-sm">
            {describeRules(s.resolved).map((l) => (
              <div key={l.topic}><dt className="font-medium">{l.topic}</dt><dd className="text-muted">{l.text}</dd></div>
            ))}
          </dl>
        </Card>
      ) : null}
    </AreaPage>
  );
}
