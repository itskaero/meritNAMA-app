import type { ReactNode } from "react";
import { PageHeader, type Crumb } from "./ui/page-header";

export type Area = "admin" | "portal";

const AREA_ROOT: Record<Area, Crumb & { href: string }> = {
  admin: { label: "Admin workspace", href: "/admin" },
  portal: { label: "Candidate portal", href: "/portal" },
};

/**
 * The frame every admin and portal page uses: breadcrumb bar starting at the area
 * root, title, description, optional status pill, then the page body with the
 * standard padding. `trail` is the path below the area root; its last crumb is
 * the current page. On the area's own overview pass `isRoot`, so the root crumb
 * is not a link to the page you are on.
 */
export function AreaPage({ area, trail, isRoot = false, title, description, status, aside, bare = false, children }: {
  area: Area;
  trail: Crumb[];
  isRoot?: boolean;
  title: string;
  description?: string;
  status?: ReactNode;
  /** Right side of the aurora header: key figures or a Follow button. */
  aside?: ReactNode;
  /** The page draws its own hero (with the h1): no standard header, only the frame. */
  bare?: boolean;
  children?: ReactNode;
}) {
  const root = AREA_ROOT[area];
  const breadcrumb = [isRoot ? { label: root.label } : root, ...trail];
  return (
    <>
      {bare ? <div className="h-4 sm:h-6" /> : <PageHeader breadcrumb={breadcrumb} title={title} description={description} status={status} aside={aside} />}
      {/* min-w-0 on every child: wide tables and charts scroll inside their card instead of widening the page */}
      <div className="grid gap-5 px-4 pb-10 sm:px-8 [&>*]:min-w-0">{children}</div>
    </>
  );
}
