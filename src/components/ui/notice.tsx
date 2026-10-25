import type { ReactNode } from "react";
import { cn } from "./cn";

export function Notice({ tone = "info", title, children }: { tone?: "info" | "warning"; title: string; children?: ReactNode }) {
  return (
    <div
      role="note"
      className={cn(
        "rounded-lg border p-4 text-sm",
        tone === "warning" ? "border-amber/40 bg-amber/10" : "border-signal/30 bg-signal/5",
      )}
    >
      <p className={cn("font-semibold", tone === "warning" ? "text-amber" : "text-signal")}>{title}</p>
      {children ? <div className="mt-1 text-muted">{children}</div> : null}
    </div>
  );
}
