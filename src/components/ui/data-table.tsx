import type { ReactNode } from "react";

export type Column<T> = { key: string; header: string; cell: (row: T) => ReactNode; align?: "left" | "right" };

/** Accessible, horizontally scrollable table. Sorting/filtering/pagination arrive with real admin data. */
export function DataTable<T>({ caption, columns, rows, rowKey, empty }: {
  caption: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty?: ReactNode;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;
  return (
    <div className="overflow-x-auto rounded-2xl border border-line">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-elevated text-muted">
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={`px-4 py-3 font-medium ${c.align === "right" ? "text-right" : ""}`}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={rowKey(r)} className="hover:bg-surface">
              {columns.map((c) => (
                <td key={c.key} className={`px-4 py-3 ${c.align === "right" ? "text-right tabular-nums" : ""}`}>{c.cell(r)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
