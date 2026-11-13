import Link from "next/link";
import type { ReactNode } from "react";
import { AuroraHeader } from "./aurora-header";
import { cn } from "./cn";

export type Crumb = { label: string; href?: string };

/**
 * Breadcrumb bar, then the title inside the navy aurora header (v4). Ancestor crumbs
 * with an `href` are links; the last crumb is the current page. `status` renders in
 * the pill on the right of the breadcrumb row: read-only state, never controls that do
 * nothing. `aside` sits on the right of the header (figures, a Follow button).
 */
export function PageHeader({ breadcrumb, title, description, status, aside }: {
  breadcrumb: Crumb[];
  title: string;
  description?: string;
  status?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <header>
      <div className="flex min-h-12 flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-8">
        <nav aria-label="Breadcrumb" className="text-sm">
          <ol className="flex min-w-0 items-center gap-1.5">
            {breadcrumb.map((b, i) => {
              const last = i === breadcrumb.length - 1;
              return (
                <li key={i} className={cn(last ? "min-w-0 max-w-[16rem] truncate font-medium text-ink" : "text-muted", i < breadcrumb.length - 2 && "hidden sm:list-item")}>
                  {i > 0 ? <span aria-hidden className={cn("mr-1.5 text-subtle", i === breadcrumb.length - 2 && "max-sm:hidden")}>/</span> : null}
                  {!last && b.href ? (
                    <Link href={b.href} className="rounded-sm underline-offset-4 hover:text-ink hover:underline">{b.label}</Link>
                  ) : (
                    <span aria-current={last ? "page" : undefined}>{b.label}</span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
        {status ? (
          <div className="flex items-center gap-1 rounded-full bg-surface/70 p-0.5 text-xs ring-1 ring-line backdrop-blur">{status}</div>
        ) : null}
      </div>
      <div className="px-4 pt-3 pb-5 sm:px-8 sm:pt-4">
        <AuroraHeader className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 px-5 py-6 sm:px-7 sm:py-7">
          <div className="min-w-0 max-w-3xl">
            <h1 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.02em] sm:text-[2.15rem]">{title}</h1>
            {description ? <p className="mt-2 text-[0.95rem] text-[#F3EEE5]/75">{description}</p> : null}
          </div>
          {aside ? <div className="flex flex-wrap items-center gap-3">{aside}</div> : null}
        </AuroraHeader>
      </div>
    </header>
  );
}

/** One segment of the PageHeader status pill. */
export function StatusPill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "warning" | "live" }) {
  const styles = {
    neutral: "text-muted",
    warning: "bg-[var(--mn-amber-soft)] text-amber font-semibold",
    live: "bg-[var(--mn-cyan-soft)] text-signal font-semibold",
  } as const;
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 ${styles[tone]}`}>{children}</span>;
}
