"use client";

import { useEffect } from "react";

/**
 * Brings an element into view when `id` changes, on narrow screens only (below `below` px),
 * where a side panel sits above a long list and would otherwise open out of sight.
 */
export function ScrollIntoView({ target, id, below = 1280 }: { target: string; id: string; below?: number }) {
  useEffect(() => {
    if (window.innerWidth >= below) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(target)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, [target, id, below]);
  return null;
}
