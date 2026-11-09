"use client";

import { useEffect, useRef } from "react";

/**
 * A number that counts up once on first view. Renders the final value on the server
 * and without JavaScript, and stays static under prefers-reduced-motion. The
 * animation writes to the visible node directly, so React state stays the final value.
 */
const thousands = (v: number) => v.toLocaleString("en-US");

export function CountUp({ value, format = thousands }: { value: number; format?: (v: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || value === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const start = performance.now(), dur = 900;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      el.textContent = format(Math.round(value * (1 - (1 - p) ** 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      el.textContent = format(value);
    };
  }, [value, format]);
  return (
    <span className="tabular-nums">
      <span ref={ref} aria-hidden>{format(value)}</span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}
