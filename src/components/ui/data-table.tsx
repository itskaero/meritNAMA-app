import type { ReactNode } from "react";
import { cn } from "./cn";

export type Column<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: "left" | "right";
  /** "mono" for marks and codes; "muted" for secondary text. */
  tone?: "mono" | "muted";
};

/**
 * Accessible table that scrolls inside its own frame. `maxHeight` turns on vertical
 * scrolling with a sticky header, for long lists.
 */
export function DataTable<T>({ caption, columns, rows, rowKey, empty, maxHeight }: {
  caption: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty?: ReactNode;
  maxHeight?: string;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;
  return (
    <div className={cn("relative overflow-x-auto rounded-2xl border border-line", maxHeight && "overflow-y-auto")} style={maxHeight ? { maxHeight } : undefined}>
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className={cn("bg-elevated text-muted", maxHeight && "sticky top-0 z-[1]")}>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cn("px-4 py-3 font-medium", c.align === "right" && "text-right")}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={rowKey(r)} className="hover:bg-surface">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn("px-4 py-3", c.align === "right" && "text-right tabular-nums", c.tone === "mono" && "font-mono tabular-nums", c.tone === "muted" && "text-muted")}
                >
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
