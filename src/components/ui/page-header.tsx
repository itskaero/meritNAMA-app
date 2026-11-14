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
    <AuroraHeader as="header" className="grid gap-4 px-5 py-[22px] sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 max-w-3xl">
          <nav aria-label="Breadcrumb" className="text-[13px] text-[#F3EEE5]/70">
            <ol className="flex min-w-0 flex-wrap items-center gap-1">
              {breadcrumb.map((b, i) => {
                const last = i === breadcrumb.length - 1;
                return (
                  <li key={i} className={cn("min-w-0", last && "max-w-[18rem] truncate")}>
                    {i > 0 ? <span aria-hidden className="mr-1">/</span> : null}
                    {!last && b.href ? <Link href={b.href} className="hover:text-[#F3EEE5] hover:underline">{b.label}</Link> : <span aria-current={last ? "page" : undefined}>{b.label}</span>}
                  </li>
                );
              })}
            </ol>
          </nav>
          <h1 className="mt-1.5 text-[1.75rem] font-bold leading-tight tracking-[-0.03em] sm:text-[32px]">{title}</h1>
          {description ? <p className="mt-1.5 text-sm text-[#F3EEE5]/68">{description}</p> : null}
        </div>
        {aside || status ? (
          <div className="flex flex-wrap items-center gap-3">
            {status ? <div className="flex items-center gap-1 rounded-full bg-black/20 p-0.5 text-xs ring-1 ring-white/15">{status}</div> : null}
            {aside}
          </div>
        ) : null}
      </div>
    </AuroraHeader>
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
