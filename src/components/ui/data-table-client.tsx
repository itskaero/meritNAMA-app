"use client";

import { useMemo, useState, type ReactNode } from "react";
import { cn } from "./cn";

export type ClientColumn = { key: string; header: ReactNode; align?: "left" | "right"; tone?: "mono" | "muted"; sortable: boolean };
export type ClientRow = { key: string; cells: ReactNode[]; sort: (string | number | null)[] };

/**
 * The rendering half of DataTable: the server prepares cells and sort values; this
 * sorts in the browser when a sortable header is pressed (ascending, descending, back
 * to the original order). Empty values always sort last.
 */
export function DataTableClient({ caption, columns, rows, height }: { caption: string; columns: ClientColumn[]; rows: ClientRow[]; height?: string }) {
  const [sort, setSort] = useState<{ col: number; dir: 1 | -1 } | null>(null);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const { col, dir } = sort;
    return [...rows].sort((a, b) => {
      const x = a.sort[col], y = b.sort[col];
      if (x === y) return 0;
      if (x === null || x === "") return 1;
      if (y === null || y === "") return -1;
      if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
      return String(x).localeCompare(String(y), "en", { numeric: true, sensitivity: "base" }) * dir;
    });
  }, [rows, sort]);
  const press = (i: number) =>
    setSort((s) => (!s || s.col !== i ? { col: i, dir: columns[i]!.align === "right" ? -1 : 1 } : s.dir === (columns[i]!.align === "right" ? -1 : 1) ? { col: i, dir: s.dir === 1 ? -1 : 1 } : null));

  return (
    // Focusable and named, so keyboard users can scroll a wide or long table.
    <div tabIndex={0} role="region" aria-label={caption} className={cn("relative overflow-x-auto rounded-lg border border-line bg-surface focus-visible:outline-2 focus-visible:outline-signal", height && "overflow-y-auto")} style={height ? { maxHeight: height } : undefined}>
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className={cn("bg-elevated text-muted", height && "sticky top-0 z-[1] shadow-[0_1px_0_var(--mn-border)]")}>
          <tr>
            {columns.map((c, i) => {
              const active = sort?.col === i;
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={active ? (sort!.dir === 1 ? "ascending" : "descending") : c.sortable ? "none" : undefined}
                  className={cn("px-3.5 py-2.5 text-xs font-semibold tracking-wide text-muted", c.align === "right" && "text-right")}
                >
                  {c.sortable ? (
                    <button type="button" onClick={() => press(i)} className={cn("inline-flex items-center gap-1 rounded hover:text-ink", c.align === "right" && "flex-row-reverse", active && "text-ink")}>
                      {c.header}
                      <span aria-hidden className={cn("text-[0.65rem]", !active && "opacity-40")}>{active ? (sort!.dir === 1 ? "▲" : "▼") : "↕"}</span>
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {sorted.map((r) => (
            <tr key={r.key} className="hover:bg-hover/60">
              {r.cells.map((cell, i) => {
                const c = columns[i]!;
                return (
                  <td key={c.key} className={cn("px-3.5 py-2.5", c.align === "right" && "text-right tabular-nums", c.tone === "mono" && "font-mono tabular-nums", c.tone === "muted" && "text-muted")}>
                    {cell}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
