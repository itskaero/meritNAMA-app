import Link from "next/link";
import type { SnippetFigures } from "@/lib/data/snippets";
import type { Snippet } from "@/lib/domain/community";
import { formatMarks } from "@/lib/format";

const pct = (v: number | null) => (v == null ? null : `${v.toFixed(1)}%`);

/**
 * A live merit card: figures come from the imported round, never from the post.
 * Percent of the induction's total first; the published marks are on hover.
 */
export function MeritSnippetCard({ snippet, figures }: { snippet: Snippet; figures: SnippetFigures | undefined }) {
  const roundHref = `/portal/history/${snippet.induction}/rounds/${snippet.round}`;
  if (!figures) {
    return (
      <div className="rounded-2xl border border-dashed border-line-strong p-3 text-sm text-muted">
        Merit card: {snippet.speciality} at {snippet.hospital} (induction {snippet.induction}, round {snippet.round}) is no longer in the imported data.
      </div>
    );
  }
  const f = figures;
  const change = f.prevClosing == null ? null : f.closing - f.prevClosing;
  return (
    <figure className="m-0 grid gap-3 rounded-2xl border border-line-strong bg-canvas p-4">
      <figcaption className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-subtle">
          Merit card · <Link href={roundHref} className="hover:text-ink hover:underline">induction {snippet.induction}, round {snippet.round}</Link> · {snippet.program} {snippet.quota}
        </p>
        <p className="mt-1 font-semibold leading-snug">
          {f.specialityId ? <Link href={`/portal/explore/specialities/${f.specialityId}`} className="hover:underline">{snippet.speciality}</Link> : snippet.speciality}
          <span className="text-muted"> at </span>
          {f.hospitalId ? <Link href={`/portal/explore/hospitals/${f.hospitalId}`} className="hover:underline">{snippet.hospital}</Link> : snippet.hospital}
        </p>
      </figcaption>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <dt className="text-xs text-subtle">Closing</dt>
          <dd className="font-mono text-lg font-semibold tabular-nums" title={`${formatMarks(f.closing)}${f.total ? ` of ${f.total}` : ""}`}>{pct(f.closingPct) ?? formatMarks(f.closing)}</dd>
        </div>
        <div>
          <dt className="text-xs text-subtle">Opening</dt>
          <dd className="font-mono text-lg tabular-nums" title={`${formatMarks(f.opening)}${f.total ? ` of ${f.total}` : ""}`}>{pct(f.openingPct) ?? formatMarks(f.opening)}</dd>
        </div>
        <div>
          <dt className="text-xs text-subtle">Allocated / seats</dt>
          <dd className="font-mono text-lg tabular-nums">{f.allocations} / {f.seats}</dd>
        </div>
        <div>
          <dt className="text-xs text-subtle">Vs round {snippet.round - 1}</dt>
          <dd className={`font-mono text-lg tabular-nums ${change == null ? "text-subtle" : change < 0 ? "text-success" : change > 0 ? "text-amber" : ""}`}>
            {change == null ? "—" : `${change > 0 ? "+" : change < 0 ? "−" : "±"}${Math.abs(change).toFixed(2)}`}
          </dd>
        </div>
      </dl>
      <p className="text-[0.7rem] text-subtle">From the imported merit list{f.total ? `; percent of ${f.total} marks, hover for the published marks` : ""}. Not official.</p>
    </figure>
  );
}
