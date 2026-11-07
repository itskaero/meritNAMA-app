import type { ReactNode } from "react";
import { cn } from "./cn";

/** A section of a page: white surface, hairline border, 10px radius. Do not nest cards. */
export function Card({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return <section id={id} className={cn("min-w-0 scroll-mt-20 rounded-xl border border-line bg-surface p-5 shadow-[var(--mn-shadow-1)] sm:p-6", className)}>{children}</section>;
}

export function CardHeader({ title, action, description }: { title: ReactNode; action?: ReactNode; description?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h2 className="text-[0.98rem] font-semibold text-heading">{title}</h2>
        {description ? <p className="mt-1 max-w-3xl text-sm text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
