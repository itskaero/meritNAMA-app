import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

/**
 * GitHub-style split button: icon and label on the left, a count on the right
 * (Follow 128, Shortlist 41). When on, Follow pulses with a neon violet edge;
 * Shortlist (tone "amber") glows amber. Use inside a form or with onClick.
 */
export function SplitButton({ icon, label, count, on = false, tone = "violet", className, ...props }: {
  icon?: ReactNode;
  label: ReactNode;
  count?: number | null;
  on?: boolean;
  tone?: "violet" | "amber";
} & Omit<ComponentProps<"button">, "children">) {
  return (
    <button
      type="button"
      aria-pressed={on}
      className={cn("mn-split", on && "is-on", tone === "amber" && "tone-amber", className)}
      {...props}
    >
      <span>{icon}{label}</span>
      {count != null ? <span aria-label={`${count} in total`}>{count.toLocaleString("en-PK")}</span> : null}
    </button>
  );
}
