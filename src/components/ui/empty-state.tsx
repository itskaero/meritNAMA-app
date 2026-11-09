import type { ReactNode } from "react";
import { ART } from "../brand-assets";

/**
 * Nothing to show yet: a quiet sprig of line art (in the theme's teal), a serif title,
 * a line of guidance and, where there is one, the next step.
 */
export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-line-strong bg-surface/60 px-6 py-10 text-center">
      <span aria-hidden className="mn-mask mb-3 h-14 w-11 text-teal opacity-55" style={{ ["--mn-mask" as string]: `url(${ART.botanical})` }} />
      <p className="font-serif text-lg font-semibold text-heading">{title}</p>
      {children ? <div className="mt-1.5 max-w-md text-sm text-muted">{children}</div> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
