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
  // Long tables scroll inside their frame so the header row stays in view.
  const height = maxHeight ?? (rows.length > 30 ? "70vh" : undefined);
  return (
    // Focusable and named, so keyboard users can scroll a wide or long table.
    <div tabIndex={0} role="region" aria-label={caption} className={cn("relative overflow-x-auto rounded-lg border border-line bg-surface focus-visible:outline-2 focus-visible:outline-signal", height && "overflow-y-auto")} style={height ? { maxHeight: height } : undefined}>
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className={cn("bg-elevated text-muted", height && "sticky top-0 z-[1] shadow-[0_1px_0_var(--mn-border)]")}>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cn("px-3.5 py-2.5 text-xs font-semibold tracking-wide text-muted", c.align === "right" && "text-right")}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={rowKey(r)} className="hover:bg-hover/60">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn("px-3.5 py-2.5", c.align === "right" && "text-right tabular-nums", c.tone === "mono" && "font-mono tabular-nums", c.tone === "muted" && "text-muted")}
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
