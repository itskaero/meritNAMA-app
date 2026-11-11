import { Fragment, type ReactNode } from "react";
import { DataTableClient } from "./data-table-client";

export type Column<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: "left" | "right";
  /** "mono" for marks and codes; "muted" for secondary text. */
  tone?: "mono" | "muted";
  /** The value to sort by. When set, the column header sorts the table (in the browser). */
  sort?: (row: T) => string | number | null | undefined;
};

/**
 * Accessible table that scrolls inside its own frame. `maxHeight` turns on vertical
 * scrolling with a sticky header, for long lists; tables over 30 rows do it anyway.
 * Columns with a `sort` accessor get sortable headers.
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
    <DataTableClient
      caption={caption}
      height={height}
      columns={columns.map((c) => ({ key: c.key, header: c.header, align: c.align, tone: c.tone, sortable: Boolean(c.sort) }))}
      rows={rows.map((r) => ({
        key: rowKey(r),
        // Keyed, since the cells travel to the client component as an array.
        cells: columns.map((c) => <Fragment key={c.key}>{c.cell(r)}</Fragment>),
        sort: columns.map((c) => {
          const v = c.sort?.(r);
          return v === undefined || (typeof v === "number" && !Number.isFinite(v)) ? null : v;
        }),
      }))}
    />
  );
}
