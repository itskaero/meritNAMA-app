"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Notice } from "@/lib/domain/notices";
import { cn } from "./ui/cn";

const KEY = "mn_dismissed_notices";

function readDismissed(): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(-50) : [];
  } catch {
    return [];
  }
}

/**
 * The thin bar at the top of every page: one notice at a time, "1 of 2" to step through,
 * and a dismiss button. Dismissed notices stay hidden in this browser (a new notice has a
 * new id, so it shows). Rendered on the server with every notice; hidden ones drop out
 * after the first paint.
 */
export function NoticeBar({ notices }: { notices: Notice[] }) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [at, setAt] = useState(0);
  // localStorage is only there in the browser: read it after the first render.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setDismissed(readDismissed()), []);
  const shown = notices.filter((n) => !dismissed.includes(n.id));
  if (!shown.length) return null;
  const n = shown[Math.min(at, shown.length - 1)]!;
  const dismiss = () => {
    const next = [...dismissed, n.id].slice(-50);
    setDismissed(next);
    setAt(0);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Private window: dismissing lasts until the page reloads.
    }
  };
  const dot = n.tone === "warning" ? "bg-amber shadow-[0_0_10px_var(--mn-amber)]" : n.tone === "highlight" ? "bg-violet-soft shadow-[0_0_10px_var(--mn-violet-soft)]" : "bg-info shadow-[0_0_10px_var(--mn-info)]";
  return (
    <div role="status" data-print-hide className="flex min-h-10 items-center gap-3 border-b border-violet-soft/25 bg-[linear-gradient(90deg,var(--mn-violet-fill),color-mix(in_srgb,#10243A_60%,transparent)_60%,var(--mn-amber-soft))] px-4 py-1.5 text-sm sm:px-8">
      <span aria-hidden className={cn("h-2 w-2 flex-none rounded-full mn-pulse", dot)} />
      <span className="min-w-0 flex-1 truncate text-heading sm:whitespace-normal">
        {n.text}
        {n.href ? (
          <>
            {" "}
            {n.href.startsWith("/") ? (
              <Link href={n.href} className="font-semibold text-signal hover:underline">See more →</Link>
            ) : (
              <a href={n.href} target="_blank" rel="noopener noreferrer" className="font-semibold text-signal hover:underline">Open ↗</a>
            )}
          </>
        ) : null}
      </span>
      {shown.length > 1 ? (
        <button type="button" onClick={() => setAt((at + 1) % shown.length)} className="flex-none rounded-md px-2 py-1 text-xs text-muted hover:text-ink" aria-label="Next notice">
          {Math.min(at, shown.length - 1) + 1} of {shown.length}
        </button>
      ) : null}
      <button type="button" onClick={dismiss} aria-label="Dismiss this notice" className="grid h-8 w-8 flex-none place-items-center rounded-lg border border-line text-muted hover:text-ink">
        <svg aria-hidden viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M6 6l12 12M18 6 6 18" /></svg>
      </button>
    </div>
  );
}
