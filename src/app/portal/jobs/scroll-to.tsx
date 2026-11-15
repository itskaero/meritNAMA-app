"use client";

import { useEffect } from "react";

/** Brings the opened advert into view (it opens under its card) and moves focus to its heading. */
export function ScrollTo({ id }: { id: string }) {
  useEffect(() => {
    const el = document.getElementById(id);
    if (!el) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
    el.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
  }, [id]);
  return null;
}
