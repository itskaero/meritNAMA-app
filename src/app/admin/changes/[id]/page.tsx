import { notFound } from "next/navigation";
import { AreaPage } from "@/components/area-page";
import { ActionBar } from "@/components/ui/action-bar";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Notice } from "@/components/ui/notice";
import { StatusPill } from "@/components/ui/page-header";
import { requireSection } from "@/lib/auth/session";
import { getChange, type ChangeKind } from "@/lib/data/changes";
import { getDb } from "@/lib/db/client";
import { profileStatusLabel } from "@/lib/domain/corrections";
import { formatMarks, formatUtc, isUuid } from "@/lib/format";
import { DecisionForm } from "../forms";
import { STATUS_TONE, statusLabel } from "../status";

export const metadata = { title: "Change" };
export const dynamic = "force-dynamic";

/** A before → after figure; the change is shown in words and sign, not colour alone. */
function FromTo({ label, from, to, format = String }: { label: string; from: number | string | null; to: number | string | null; format?: (v: number) => string }) {
  const f = (v: number | string | null) => (v == null ? "—" : typeof v === "number" ? format(v) : v);
  const diff = typeof from === "number" && typeof to === "number" ? to - from : null;
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-2 font-mono text-lg tabular-nums">
        <span className="text-muted">{f(from)}</span> <span aria-label="becomes">→</span> <span className="font-semibold text-ink">{f(to)}</span>
      </p>
      {diff ? (
        <p className={`mt-1 text-xs ${diff < 0 ? "text-amber" : "text-signal"}`}>{diff > 0 ? "+" : "−"}{format(Math.abs(diff))}</p>
      ) : from === to ? (
        <p className="mt-1 text-xs text-subtle">no change</p>
      ) : (
        <p className="mt-1 text-xs text-signal">changes</p>
      )}
    </div>
  );
}

type SeatPreview = {
  lines: { from: number; to: number }; seats: { from: number; to: number };
  added: { line: string; seats: number }[]; addedCount: number;
  removed: { line: string; seats: number }[]; removedCount: number;
  changed: { line: string; from: number; to: number }[]; changedCount: number;
  renames: { id: number; field: string; from: string; to: string }[];
};
type RoundPreview = { allocations: { from: number; to: number }; accepted: { from: number; to: number }; groupsChanged: number; groupsTotal: number; topChanges: { group: string; from: number | null; to: number | null }[] };
type DeletePreview = { allocations: number; cycle: string; discussions: number };
type PolicyPreview = {
  from?: string | null; to?: string; activeFrom?: string; activeTo?: string;
  total: { from: number | null; to: number }; components: { key: string; label: string; from: string; to: string }[];
  keys?: { key: string; state: "new" | "changed" | "unchanged" }[];
};

type RulesPreview = {
  induction: number; from: string; to: string; policy: string | null;
  settings: { setting: string; from: string; to: string }[];
  before: { topic: string; text: string }[] | null; after: { topic: string; text: string }[] | null;
  problem: string | null;
};

type CorrectionPreview = {
  induction: number; applicants: number; unchanged: number; more: number;
  rows: { applicantId: string; field: string; program: string | null; imported: number | null; from: number | null; to: number }[];
};

const FIELD_LABEL: Record<string, string> = { base_marks: "Base marks", program_marks: "Programme marks", profile_status: "Profile status" };

function RulesWords({ title, lines }: { title: string; lines: { topic: string; text: string }[] | null }) {
  return (
    <Card>
      <CardHeader title={title} />
      {lines ? (
        <dl className="grid gap-2 text-sm">
          {lines.map((l) => <div key={l.topic}><dt className="font-medium">{l.topic}</dt><dd className="text-muted">{l.text}</dd></div>)}
        </dl>
      ) : <p className="text-sm text-muted">Cannot be resolved without a scoring policy.</p>}
    </Card>
  );
}

function Preview({ kind, preview }: { kind: ChangeKind; preview: unknown }) {
  if (preview == null) return <Notice title="Details hidden">This change names candidates and their marks. Only staff who handle candidate records can see it.</Notice>;
  switch (kind) {
    case "candidate_correction": {
      const p = preview as CorrectionPreview;
      const v = (field: string, x: number | null) => (x == null ? "—" : field === "profile_status" ? profileStatusLabel(x) : formatMarks(x));
      return (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <FromTo label={`Applicants corrected in induction ${p.induction}`} from={0} to={p.applicants} />
            <FromTo label="Values that change" from={0} to={p.rows.length + p.more} />
          </div>
          {p.unchanged ? <Notice title={`${p.unchanged} value${p.unchanged > 1 ? "s were" : " was"} already as given`}>They are left out.</Notice> : null}
          <Card>
            <CardHeader title="Values" description={`The simulation uses these from its next run. ${p.more ? `First ${p.rows.length} shown.` : ""}`} />
            <DataTable caption="Corrections" rows={p.rows} rowKey={(r) => `${r.applicantId}|${r.field}|${r.program ?? ""}`} columns={[
              { key: "a", header: "Applicant", tone: "mono", cell: (r) => <a href={`/admin/candidates/records/${r.applicantId}?i=${p.induction}`} className="text-signal hover:underline">{r.applicantId}</a> },
              { key: "f", header: "Value", cell: (r) => `${FIELD_LABEL[r.field] ?? r.field}${r.program ? ` · ${r.program}` : ""}` },
              { key: "i", header: "Imported", align: "right", tone: "mono", cell: (r) => v(r.field, r.imported) },
              { key: "n", header: "Now", align: "right", tone: "mono", cell: (r) => v(r.field, r.from) },
              { key: "t", header: "After", align: "right", tone: "mono", cell: (r) => v(r.field, r.to) },
            ]} />
          </Card>
        </>
      );
    }
    case "seat_matrix_replace": {
      const p = preview as SeatPreview;
      const lists: [string, { line: string; detail: string }[], number][] = [
        ["Seat counts change", p.changed.map((c) => ({ line: c.line, detail: `${c.from} → ${c.to}` })), p.changedCount],
        ["New seat lines", p.added.map((c) => ({ line: c.line, detail: `${c.seats} seats` })), p.addedCount],
        ["Seat lines removed", p.removed.map((c) => ({ line: c.line, detail: `${c.seats} seats` })), p.removedCount],
      ];
      return (
        <>
          <div className="grid gap-4 sm:grid-cols-2"><FromTo label="Seat lines" from={p.lines.from} to={p.lines.to} /><FromTo label="Seats" from={p.seats.from} to={p.seats.to} /></div>
          {p.renames.length ? <Notice tone="warning" title="Names change">{p.renames.map((r) => `${r.field} ${r.id}: “${r.from}” → “${r.to}”`).join(" · ")}</Notice> : null}
          {lists.map(([title, rows, count]) => count ? (
            <Card key={title}>
              <CardHeader title={`${title} · ${count}`} description={count > rows.length ? `First ${rows.length} shown.` : undefined} />
              <DataTable caption={title} rows={rows} rowKey={(r) => r.line} columns={[{ key: "l", header: "Programme · quota · speciality · hospital", cell: (r) => r.line }, { key: "d", header: "Change", align: "right", tone: "mono", cell: (r) => r.detail }]} />
            </Card>
          ) : null)}
        </>
      );
    }
    case "merit_round_replace": {
      const p = preview as RoundPreview;
      return (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <FromTo label="Allocations" from={p.allocations.from} to={p.allocations.to} />
            <FromTo label="Accepted" from={p.accepted.from} to={p.accepted.to} />
            <FromTo label="Groups with a different closing merit" from={0} to={p.groupsChanged} />
          </div>
          {p.topChanges.length ? (
            <Card>
              <CardHeader title="Biggest closing-merit changes" description={`${p.groupsChanged} of ${p.groupsTotal} groups change; the largest ${p.topChanges.length} are shown.`} />
              <DataTable caption="Closing merit changes" rows={p.topChanges} rowKey={(r) => r.group} columns={[
                { key: "g", header: "Programme · quota · speciality · hospital", cell: (r) => r.group },
                { key: "f", header: "Now", align: "right", tone: "mono", cell: (r) => (r.from == null ? "not offered" : formatMarks(r.from)) },
                { key: "t", header: "After", align: "right", tone: "mono", cell: (r) => (r.to == null ? "removed" : formatMarks(r.to)) },
              ]} />
            </Card>
          ) : null}
        </>
      );
    }
    case "merit_round_delete": {
      const p = preview as DeletePreview;
      return (
        <Notice tone="warning" title={`Removes ${p.allocations.toLocaleString("en-US")} allocations`}>
          {p.cycle}. Merit pages, the score finder and comparisons stop using this round. {p.discussions ? `${p.discussions} community discussions about this round stay, but their page will be empty.` : ""} A snapshot is kept, so it can be rolled back.
        </Notice>
      );
    }
    case "rules_activate": {
      const p = preview as RulesPreview;
      return (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <FromTo label={`Induction ${p.induction} rules`} from={p.from} to={p.to} />
            <FromTo label="Scoring policy (unchanged)" from={p.policy ?? "none"} to={p.policy ?? "none"} />
          </div>
          {p.problem ? <Notice tone="warning" title="These rules cannot be applied yet">{p.problem}</Notice> : null}
          <Card>
            <CardHeader title="Settings that change" description={p.settings.length ? undefined : "No setting changes (only the label may differ)."} />
            {p.settings.length ? (
              <DataTable caption="Rule changes" rows={p.settings} rowKey={(r) => r.setting} columns={[
                { key: "s", header: "Setting", tone: "mono", cell: (r) => r.setting },
                { key: "f", header: "Now", tone: "mono", cell: (r) => r.from },
                { key: "t", header: "After", tone: "mono", cell: (r) => r.to },
              ]} />
            ) : null}
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <RulesWords title="Now" lines={p.before} />
            <RulesWords title="After publishing" lines={p.after} />
          </div>
        </>
      );
    }
    case "policy_activate":
    case "policy_file_import": {
      const p = preview as PolicyPreview;
      return (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <FromTo label="Active policy" from={p.from ?? p.activeFrom ?? null} to={p.to ?? p.activeTo ?? null} />
            <FromTo label="Total marks" from={p.total.from} to={p.total.to} />
          </div>
          {p.keys ? (
            <Card>
              <CardHeader title="Policies in the file" />
              <ul className="flex flex-wrap gap-2">{p.keys.map((k) => <li key={k.key}><Badge tone={k.state === "unchanged" ? "neutral" : k.state === "new" ? "current" : "warning"}>{k.key} · {k.state}</Badge></li>)}</ul>
            </Card>
          ) : null}
          <Card>
            <CardHeader title="Components of the active policy" description={p.components.length ? "Only the components that differ are listed." : "The components are identical."} />
            {p.components.length ? (
              <DataTable caption="Component changes" rows={p.components} rowKey={(r) => r.key} columns={[
                { key: "l", header: "Component", cell: (r) => r.label },
                { key: "f", header: "Max marks now", align: "right", tone: "mono", cell: (r) => r.from },
                { key: "t", header: "After", align: "right", tone: "mono", cell: (r) => r.to },
              ]} />
            ) : null}
          </Card>
        </>
      );
    }
  }
}

export default async function ChangePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSection("/admin/changes");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const c = await getChange(getDb(), session, id);
  if (!c) notFound();

  return (
    <AreaPage
      area="admin"
      trail={[{ label: "Changes to review", href: "/admin/changes" }, { label: c.title }]}
      title={c.title}
      description={`Proposed by ${c.createdBy}, ${formatUtc(c.createdAt)} UTC: “${c.reason}”`}
      status={<StatusPill tone={c.status === "pending" ? "warning" : "neutral"}>{statusLabel(c.status)}</StatusPill>}
    >
      <ActionBar
        actions={[
          ...(c.canDecide && (c.status === "pending" || c.rollbackable)
            ? [{ label: c.status === "pending" ? "Publish or discard" : "Roll back", href: "#decide", icon: "arrow" as const, primary: true }]
            : []),
          { label: "All changes", href: "/admin/changes", icon: "history" as const },
        ]}
      />
      {c.stale ? <Notice tone="warning" title="Out of date">The data changed after this preview was made, so it cannot be published. Discard it and propose the change again.</Notice> : null}
      <Preview kind={c.kind} preview={c.preview} />
      <Card id="decide">
        {c.status === "pending" ? (
          c.canDecide ? (
            <>
              <CardHeader title="Decide" description="Publishing applies the change immediately and keeps a snapshot of the current data for rollback." />
              <DecisionForm id={c.id} mode="pending" stale={c.stale} />
            </>
          ) : <p className="text-sm text-muted">Your role cannot publish this kind of change.</p>
        ) : (
          <>
            <CardHeader title={<span className="inline-flex items-center gap-2">Decision <Badge tone={STATUS_TONE[c.status]}>{statusLabel(c.status)}</Badge></span>} description={c.decidedBy ? `${c.decidedBy}, ${formatUtc(c.decidedAt)} UTC: “${c.decisionReason ?? ""}”` : undefined} />
            {c.rollbackable && c.canDecide ? <DecisionForm id={c.id} mode="rollback" /> : null}
          </>
        )}
      </Card>
    </AreaPage>
  );
}
