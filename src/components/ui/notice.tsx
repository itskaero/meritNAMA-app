import type { ReactNode } from "react";
import { cn } from "./cn";

export function Notice({ tone = "info", title, children }: { tone?: "info" | "warning"; title: string; children?: ReactNode }) {
  return (
    <div
      role="note"
      className={cn(
        "rounded-xl border border-l-[3px] p-4 text-sm",
        tone === "warning" ? "border-amber/30 border-l-amber bg-[var(--mn-amber-soft)]" : "border-teal/30 border-l-teal bg-tint",
      )}
    >
      <p className={cn("font-semibold", tone === "warning" ? "text-amber" : "text-heading")}>{title}</p>
      {children ? <div className="mt-1 text-muted">{children}</div> : null}
    </div>
  );
}
