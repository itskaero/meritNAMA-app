"use client";

import { useEffect, useState } from "react";

const KEY = "mn-apply-checklist";

function readDone(): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * "Can you apply?" (Overview22.dc.html): a self-check the member ticks. Kept in this
 * browser only; nothing is sent. The items are general, and PHF's notification decides.
 */
export function ApplyChecklist({ items, pending }: { items: string[]; pending?: string[] }) {
  const [done, setDone] = useState<string[]>([]);
  // localStorage is only there in the browser: read it after the first render.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setDone(readDone()), []);
  const toggle = (item: string) => {
    const next = done.includes(item) ? done.filter((x) => x !== item) : [...done, item];
    setDone(next);
    try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* not saved */ }
  };
  const n = items.filter((i) => done.includes(i)).length;
  return (
    <>
      <div className="flex items-center justify-between"><h2 className="text-[15px] font-semibold">Can you apply?</h2><span className={`mn-pill ${n === items.length ? "g" : n ? "a" : "n"}`}>{n} of {items.length}</span></div>
      <div className="mt-3 flex flex-col gap-1.5">
        {items.map((item) => (
          <label key={item} className="flex cursor-pointer items-start gap-2.5 rounded-[10px] bg-white/[.025] px-2.5 py-[9px] text-[13px] transition-colors hover:bg-[rgba(110,86,255,.08)]">
            <input type="checkbox" checked={done.includes(item)} onChange={() => toggle(item)} className="mt-0.5 accent-[#7B61FF]" />
            <span>{item}{pending?.includes(item) ? <> <span className="mn-pill a">result pending</span></> : null}</span>
          </label>
        ))}
      </div>
    </>
  );
}
