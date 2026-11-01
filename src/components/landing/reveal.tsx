"use client";

import { useEffect } from "react";

/**
 * Adds `is-visible` to every `.mn-reveal` element as it scrolls into view.
 * Elements are only hidden when the root has the `js` class (set by an inline
 * script in the layout), so the page is fully readable without JavaScript.
 */
export function RevealOnScroll() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(".mn-reveal"));
    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("is-visible"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          // Also reveal anything already scrolled past (e.g. after jumping to an anchor).
          if (e.isIntersecting || e.boundingClientRect.top < 0) {
            e.target.classList.add("is-visible");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.12 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return null;
}
