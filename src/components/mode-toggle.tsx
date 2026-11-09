"use client";

import { useOptimistic, useTransition } from "react";
import { setUiModeAction } from "@/app/_actions/ui-mode";
import type { UiMode } from "@/lib/ui-mode";
import { cn } from "./ui/cn";

const LABELS: Record<UiMode, { label: string; hint: string }> = {
  simple: { label: "Simple", hint: "Labelled menu and larger text" },
  pro: { label: "Pro", hint: "Icon menu, Ctrl K search, compact tables" },
};

/** Two-state switch for the interface mode; the server re-renders the shell. */
export function ModeToggle({ mode, compact = false }: { mode: UiMode; compact?: boolean }) {
  const [current, setCurrent] = useOptimistic(mode);
  const [pending, start] = useTransition();
  const choose = (m: UiMode) =>
    start(async () => {
      setCurrent(m);
      await setUiModeAction(m);
    });

  return (
    <div
      role="group"
      aria-label="Interface mode"
      className={cn("inline-flex rounded-full border border-line bg-canvas p-1", compact && "flex-col", pending && "opacity-80")}
    >
      {(Object.keys(LABELS) as UiMode[]).map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={current === m}
          title={LABELS[m].hint}
          onClick={() => current !== m && choose(m)}
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
            current === m ? "bg-ink text-canvas" : "text-muted hover:text-ink",
          )}
        >
          {compact ? LABELS[m].label.slice(0, 1) : LABELS[m].label}
          {compact ? <span className="sr-only">{LABELS[m].label.slice(1)} mode</span> : null}
        </button>
      ))}
    </div>
  );
}
