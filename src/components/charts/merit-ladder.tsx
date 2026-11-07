"use client";

import Link from "next/link";
import { useState } from "react";
import type { LadderRow } from "@/lib/data/insights";
import { LADDER_SEGMENTS, ladderScale, segmentsFor } from "@/lib/domain/ladder";
import { formatMarks } from "@/lib/format";
import { cn } from "../ui/cn";

const pctOf = (m: number, total: number | null) => (total ? (m / total) * 100 : m);

/**
 * Glowing segmented bars: each row's lowest closing merit in the chosen round, one
 * segment per step of percent. Ember segments show ground lost since the first
 * round (merit fell, so the seat got easier). Round tabs step through the cycle.
 */
export function MeritLadder({ rows, rounds, total, caption, linkRows = true, initialRows = 12 }: { rows: LadderRow[]; rounds: number[]; total: number | null; caption: string; linkRows?: boolean; initialRows?: number }) {
  const [r, setR] = useState(rounds.length - 1);
  const [all, setAll] = useState(false);
  if (rows.length === 0 || rounds.length === 0) return null;
  const shown = all ? rows : rows.slice(0, initialRows);
  // Scale to the rows on screen, so small moves among the top rows stay visible.
  const scale = ladderScale(shown.flatMap((row) => row.marks.map((m) => pctOf(m!, total))));
  const val = (row: LadderRow, i: number) => pctOf(row.marks[i]!, total);
  const unit = total ? "%" : "";
  const drops = rows.map((row) => ({ row, d: row.marks[r]! - row.marks[0]! }));
  const biggest = drops.reduce((a, b) => (b.d < a.d ? b : a));
  const unchanged = drops.filter((x) => Math.abs(x.d) < 0.005).length;
  const top = rows.reduce((a, b) => (val(b, r) > val(a, r) ? b : a));

  return (
    <figure className="m-0 grid min-w-0 gap-5">
      <figcaption className="sr-only">{caption}. Values in round {rounds[r]}: {rows.map((row) => `${row.label} ${formatMarks(row.marks[r])}`).join(", ")}.</figcaption>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <dl className="grid min-w-0 flex-1 grid-cols-3 gap-4">
          <div><dt className="text-xs text-subtle">Highest · {top.label}</dt><dd className="font-mono text-2xl font-semibold tabular-nums">{val(top, r).toFixed(1)}{unit}</dd></div>
          <div><dt className="text-xs text-subtle">Biggest fall since R{rounds[0]} · {biggest.row.label}</dt><dd className={cn("font-mono text-2xl font-semibold tabular-nums", biggest.d < 0 && "text-success")}>{biggest.d ? biggest.d.toFixed(2) : "0.00"}</dd></div>
          <div><dt className="text-xs text-subtle">Unchanged since R{rounds[0]}</dt><dd className="font-mono text-2xl font-semibold tabular-nums">{unchanged} of {rows.length}</dd></div>
        </dl>
        {rounds.length > 1 ? (
          <div role="group" aria-label="Round" className="inline-flex flex-wrap rounded-full border border-line bg-canvas p-1">
            {rounds.map((n, i) => (
              <button key={n} type="button" aria-pressed={i === r} onClick={() => setR(i)} className={cn("rounded-full px-3 py-1.5 font-mono text-xs font-semibold", i === r ? "bg-ink text-canvas" : "text-muted hover:text-ink")}>R{n}</button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="grid gap-2.5">
        {shown.map((row) => {
          const now = segmentsFor(val(row, r), scale), first = segmentsFor(val(row, 0), scale);
          const name = linkRows && row.specialityId ? <Link href={`/portal/explore/specialities/${row.specialityId}`} className="hover:text-ink hover:underline">{row.label}</Link> : row.label;
          return (
            <div key={row.key} className="grid grid-cols-[minmax(0,6rem)_minmax(0,1fr)_3.5rem] items-center gap-2 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_4rem] sm:gap-3" title={`${row.label}: ${formatMarks(row.marks[r])}${total ? ` of ${total}` : ""} in round ${rounds[r]} (round ${rounds[0]}: ${formatMarks(row.marks[0])})`}>
              <span className="truncate text-sm text-muted">{name}</span>
              <span className="grid gap-[3px] sm:gap-1" style={{ gridTemplateColumns: `repeat(${LADDER_SEGMENTS}, minmax(0, 1fr))` }} aria-hidden>
                {Array.from({ length: LADDER_SEGMENTS }, (_, k) => (
                  <i
                    key={k}
                    className={cn(
                      "h-2.5 rounded-full transition-[background-color,box-shadow] duration-300",
                      k < Math.round(now) ? "bg-signal"
                      : k < Math.round(first) ? "bg-[color-mix(in_srgb,var(--mn-ember)_55%,var(--mn-border))]"
                      : "bg-line",
                    )}
                  />
                ))}
              </span>
              <span className="text-right font-mono text-sm tabular-nums">{val(row, r).toFixed(1)}{unit}</span>
            </div>
          );
        })}
        {rows.length > initialRows ? (
          <button type="button" onClick={() => setAll(!all)} className="justify-self-start text-sm font-semibold text-signal hover:underline">
            {all ? `Show the top ${initialRows}` : `Show all ${rows.length}`}
          </button>
        ) : null}
        <div className="grid grid-cols-[minmax(0,6rem)_minmax(0,1fr)_3.5rem] gap-2 font-mono text-[0.68rem] text-subtle sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_4rem] sm:gap-3" aria-hidden>
          <span />
          <span className="flex justify-between">{[0, 5, 10, 15, 20].map((k) => <span key={k}>{scale.lo + k * scale.step}{unit}</span>)}</span>
          <span />
        </div>
      </div>
      <div tabIndex={0} role="region" aria-label="Merit ladder" className="relative overflow-x-auto rounded-2xl border border-line">
        <table className="w-full min-w-[480px] text-right text-sm">
          <caption className="sr-only">Lowest closing marks by round</caption>
          <thead className="bg-elevated text-xs text-muted"><tr><th scope="col" className="px-3 py-2.5 text-left font-medium">{linkRows ? "Speciality" : "Programme · quota"}</th>{rounds.map((n) => <th key={n} scope="col" className="px-3 py-2.5 font-medium">R{n}</th>)}</tr></thead>
          <tbody className="divide-y divide-line font-mono tabular-nums">
            {shown.map((row) => (
              <tr key={row.key}>
                <th scope="row" className="px-3 py-2 text-left font-sans font-normal text-muted">{row.label}</th>
                {row.marks.map((m, i) => <td key={i} className={cn("px-3 py-2", i === r && "font-semibold text-signal")}>{formatMarks(m)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-subtle">Lowest allocated marks in each round{total ? `, as percent of ${total}` : ""}. Teal: this round. Ember: ground lost since round {rounds[0]} (closing merit fell).</p>
    </figure>
  );
}
