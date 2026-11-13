import Link from "next/link";
import { cn } from "./ui/cn";

type Chip = { key: string | number; label: string; href: string; hint?: string; current?: boolean };

/**
 * A row of links that scrolls sideways (one tap to any round), instead of stacking down the
 * page on a phone. The current item is filled and scrolls into the first snap position.
 */
export function RoundChips({ items, label }: { items: Chip[]; label: string }) {
  return (
    <nav aria-label={label}>
      <ul className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]">
        {items.map((c) => (
          <li key={c.key} className="shrink-0 snap-start">
            <Link
              href={c.href}
              aria-current={c.current ? "page" : undefined}
              className={cn(
                "grid h-11 min-w-14 content-center rounded-xl border px-3.5 text-center text-sm font-semibold transition-colors",
                c.current ? "mn-btn" : "mn-btn-ghost bg-surface",
              )}
            >
              {c.label}
              {c.hint ? <span className={cn("block text-[0.65rem] font-normal leading-none", c.current ? "opacity-80" : "text-subtle")}>{c.hint}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
