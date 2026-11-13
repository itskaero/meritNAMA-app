import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "./cn";

export type Segment = { href: string; label: ReactNode; active?: boolean; count?: number };

/**
 * Tabs or a segmented filter made of links (works without scripts, keeps the choice
 * in the URL). The active segment uses the glowing outline of the primary button.
 * Scrolls sideways on phones rather than wrapping.
 */
export function Segmented({ items, label, className }: { items: Segment[]; label: string; className?: string }) {
  return (
    <nav aria-label={label} className={cn("-mx-1 overflow-x-auto px-1 py-1", className)}>
      <ul className="inline-flex gap-1 rounded-xl border border-line bg-surface/60 p-1">
        {items.map((s) => (
          <li key={s.href}>
            <Link
              href={s.href}
              aria-current={s.active ? "page" : undefined}
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-medium",
                s.active ? "mn-btn" : "border border-transparent text-muted hover:text-ink",
              )}
            >
              {s.label}
              {s.count != null ? <span className={cn("rounded-full px-1.5 text-[0.7rem] tabular-nums", s.active ? "bg-white/10" : "bg-hover")}>{s.count}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** A small rounded label with an optional coloured dot (data colours only). */
export function Pill({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "success" | "amber" | "danger" | "info" | "violet"; className?: string }) {
  const tones = {
    neutral: "border-line-strong text-muted",
    success: "border-success/35 text-success",
    amber: "border-amber/40 text-amber",
    danger: "border-danger/35 text-danger",
    info: "border-info/35 text-info",
    violet: "border-violet-soft/45 text-violet-pale shadow-[0_0_14px_var(--mn-violet-glow)]",
  } as const;
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium", tones[tone], className)}>{children}</span>;
}
