import type { ReactNode } from "react";
import { cn } from "./cn";

/** A section of a page: glass surface over the page aurora, hairline border, 20px radius. Do not nest cards. */
export function Card({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return <section id={id} className={cn("min-w-0 scroll-mt-20 mn-card-glass mn-hover rounded-xl border border-line p-5", className)}>{children}</section>;
}

export function CardHeader({ title, action, description }: { title: ReactNode; action?: ReactNode; description?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-x-4">
      <div className="min-w-0 flex-1">
        <h2 className="text-[15px] font-semibold text-heading">{title}</h2>
        {description ? <p className="mt-1 max-w-3xl text-[13px] text-muted">{description}</p> : null}
      </div>
      {action ? <div className="flex flex-none flex-wrap justify-end gap-2">{action}</div> : null}
    </div>
  );
}
