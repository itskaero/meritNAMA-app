"use client";

import { useOptimistic, useTransition } from "react";
import { setThemeAction } from "@/app/_actions/ui-mode";
import type { Theme } from "@/lib/ui-mode";
import { Icon } from "./icon";
import { cn } from "./ui/cn";

const OPTIONS: { value: Theme; label: string; icon: "sun" | "moon" | "monitor" }[] = [
  { value: "light", label: "Light", icon: "sun" },
  { value: "dark", label: "Dark", icon: "moon" },
  { value: "system", label: "Device", icon: "monitor" },
];

/**
 * Light, dark or follow the device. The attribute changes at once so the page does
 * not wait for the server; the cookie keeps the choice for the next request.
 */
export function ThemeToggle({ theme }: { theme: Theme }) {
  const [current, setCurrent] = useOptimistic(theme);
  const [, start] = useTransition();
  return (
    <div role="group" aria-label="Colour theme" className="inline-flex rounded-lg border border-line bg-canvas p-0.5">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={current === o.value}
          title={o.label}
          onClick={() => {
            if (current === o.value) return;
            document.documentElement.dataset.theme = o.value;
            start(async () => {
              setCurrent(o.value);
              await setThemeAction(o.value);
            });
          }}
          className={cn("grid h-7 w-8 place-items-center rounded-md transition-colors", current === o.value ? "bg-surface text-ink shadow-[var(--mn-shadow-1)]" : "text-muted hover:text-ink")}
        >
          <Icon name={o.icon} className="h-4 w-4" />
          <span className="sr-only">{o.label}</span>
        </button>
      ))}
    </div>
  );
}
