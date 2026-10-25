import type { ReactNode } from "react";

/**
 * Breadcrumb bar + large title. `status` renders in the dark pill on the right —
 * read-only state (e.g. integration status), never controls that do nothing.
 */
export function PageHeader({ breadcrumb, title, description, status }: {
  breadcrumb: string[];
  title: string;
  description?: string;
  status?: ReactNode;
}) {
  return (
    <header>
      <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-8">
        <nav aria-label="Breadcrumb" className="text-sm">
          <ol className="flex items-center gap-1.5">
            {breadcrumb.map((b, i) => (
              <li key={b} className={i === breadcrumb.length - 1 ? "font-medium text-ink" : "text-subtle"}>
                {i > 0 ? <span aria-hidden className="mr-1.5 text-subtle">/</span> : null}
                <span aria-current={i === breadcrumb.length - 1 ? "page" : undefined}>{b}</span>
              </li>
            ))}
          </ol>
        </nav>
        {status ? (
          <div className="flex items-center gap-1 rounded-full bg-black/60 p-1 text-xs ring-1 ring-line">{status}</div>
        ) : null}
      </div>
      <div className="px-4 pt-8 pb-6 sm:px-8 sm:pt-10">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-muted">{description}</p> : null}
      </div>
    </header>
  );
}

/** One segment of the PageHeader status pill. */
export function StatusPill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "warning" | "live" }) {
  const styles = {
    neutral: "text-muted",
    warning: "bg-ink text-canvas font-semibold",
    live: "bg-signal text-signal-ink font-semibold",
  } as const;
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 ${styles[tone]}`}>{children}</span>;
}
