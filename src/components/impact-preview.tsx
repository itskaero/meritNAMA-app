import { Card, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Notice } from "@/components/ui/notice";
import type { RulesImpact } from "@/lib/data/simulation";
import { formatMarks } from "@/lib/format";

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl bg-elevated/60 p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 font-mono text-xl tabular-nums">{value}</p>
      {note ? <p className="mt-0.5 text-xs text-subtle">{note}</p> : null}
    </div>
  );
}

const n = (v: number) => v.toLocaleString("en-US");
const fromTo = (x: { from: number; to: number }) => (x.from === x.to ? n(x.to) : `${n(x.from)} → ${n(x.to)}`);

/** What a change of rules or scoring policy would do to an induction's simulated round 1. */
export function ImpactPreview({ impact, title }: { impact: RulesImpact; title?: string }) {
  const heading = title ?? `Effect on induction ${impact.induction}, round 1`;
  if (impact.status !== "computed") {
    return (
      <Notice title={impact.status === "same" ? `${heading}: no change` : heading}>
        {impact.reason}
      </Notice>
    );
  }
  const changed = impact.moved + impact.gained + impact.lost;
  return (
    <Card>
      <CardHeader
        title={heading}
        description={`The simulation ran twice over the same imported data (${n(impact.candidates)} candidates), under the rules in force and under this change, in ${(impact.ms / 1000).toFixed(1)} s. ${changed ? `${n(changed)} candidate${changed === 1 ? "" : "s"} would end up somewhere else.` : "Every candidate keeps the same seat."}`}
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Figure label="Placed" value={fromTo(impact.placed)} note={`eligible ${fromTo(impact.eligible)}`} />
        <Figure label="Same seat" value={n(impact.sameSeat)} />
        <Figure label="Different seat" value={n(impact.moved)} />
        <Figure label="Gain a seat / lose it" value={`${n(impact.gained)} / ${n(impact.lost)}`} />
      </div>
      {impact.topChanges.length ? (
        <div className="mt-4">
          <DataTable
            caption="Closing merit changes"
            rows={impact.topChanges}
            rowKey={(r) => r.group}
            maxHeight="24rem"
            columns={[
              { key: "g", header: `Closing merit changes · ${n(impact.groupsChanged)} of ${n(impact.groupsTotal)} seat groups`, cell: (r) => r.group },
              { key: "f", header: "Now", align: "right", tone: "mono", cell: (r) => (r.from == null ? "unfilled" : formatMarks(r.from)) },
              { key: "t", header: "After", align: "right", tone: "mono", cell: (r) => (r.to == null ? "unfilled" : formatMarks(r.to)) },
            ]}
          />
        </div>
      ) : null}
    </Card>
  );
}
