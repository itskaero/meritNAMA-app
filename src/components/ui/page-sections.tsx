"use client";

import { useEffect, useState } from "react";
import { cn } from "./cn";

export type SectionLink = { id: string; label: string };

/**
 * "On this page": a sticky row of links to the sections of a long page, acting as
 * tabs. The section in view is marked (aria-current), and the row scrolls sideways on
 * phones. Links are plain anchors, so it works without JavaScript.
 */
export function PageSections({ items, label = "On this page" }: { items: SectionLink[]; label?: string }) {
  const [active, setActive] = useState<string | null>(items[0]?.id ?? null);
  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => Boolean(e));
    if (!els.length || !("IntersectionObserver" in window)) return;
    const seen = new Map<string, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting ? e.boundingClientRect.top : Infinity);
        // The topmost section that is in view.
        let best: string | null = null, top = Infinity;
        for (const [id, t] of seen) if (t < top) { top = t; best = id; }
        if (best) setActive(best);
      },
      { rootMargin: "-80px 0px -55% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [items]);
  if (items.length < 2) return null;
  return (
    <nav aria-label={label} className="sticky top-0 z-20 -mx-4 border-b border-line bg-canvas/90 px-4 backdrop-blur supports-[backdrop-filter]:bg-canvas/75 sm:-mx-8 sm:px-8">
      <ul className="flex gap-1 overflow-x-auto py-2 [scrollbar-width:none]">
        {items.map((i) => (
          <li key={i.id} className="flex-none">
            <a
              href={`#${i.id}`}
              aria-current={active === i.id ? "location" : undefined}
              onClick={() => setActive(i.id)}
              className={cn("block rounded-lg px-3 py-1.5 text-sm font-medium transition-colors", active === i.id ? "bg-[var(--mn-cyan-soft)] text-signal-strong" : "text-muted hover:bg-hover hover:text-ink")}
            >
              {i.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
