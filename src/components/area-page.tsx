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
    // As in the mockups: 24px around the page, 16px between sections, the header is the first section.
    <div className="grid gap-4 p-4 pb-10 sm:p-6 [&>*]:min-w-0">
      {bare ? null : <PageHeader breadcrumb={breadcrumb} title={title} description={description} status={status} aside={aside} />}
      {children}
    </div>
  );
}
