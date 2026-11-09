import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "./cn";

export type Crumb = { label: string; href?: string };

/**
 * Breadcrumb bar + large title. Ancestor crumbs with an `href` are links; the last
 * crumb is the current page. `status` renders in the dark pill on the right —
 * read-only state (e.g. integration status), never controls that do nothing.
 */
export function PageHeader({ breadcrumb, title, description, status }: {
  breadcrumb: Crumb[];
  title: string;
  description?: string;
  status?: ReactNode;
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
          <div className="flex items-center gap-1 rounded-full bg-surface p-0.5 text-xs ring-1 ring-line">{status}</div>
        ) : null}
      </div>
      <div className="px-4 pt-3 pb-6 sm:px-8 sm:pt-5">
        <h1 className="font-serif text-[1.9rem] font-semibold leading-tight tracking-[-0.01em] text-heading sm:text-[2.35rem]">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-[0.95rem] text-muted">{description}</p> : null}
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
