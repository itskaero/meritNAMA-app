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
export function AreaPage({ area, trail, isRoot = false, title, description, status, children }: {
  area: Area;
  trail: Crumb[];
  isRoot?: boolean;
  title: string;
  description?: string;
  status?: ReactNode;
  children?: ReactNode;
}) {
  const root = AREA_ROOT[area];
  const breadcrumb = [isRoot ? { label: root.label } : root, ...trail];
  return (
    <>
      <PageHeader breadcrumb={breadcrumb} title={title} description={description} status={status} />
      <div className="grid gap-5 px-4 pb-10 sm:px-8">{children}</div>
    </>
  );
}
