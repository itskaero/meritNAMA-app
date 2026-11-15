"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

const FLUSH_MS = 5_000;
const MAX_MS = 30 * 60_000;
const lastVisit = { path: "", at: 0 };

/**
 * Tells the server which page a candidate opened (Admin → Activity), and, when session replay
 * is on, records the tab with rrweb: every input is masked, nothing typed leaves the browser.
 * Events go up in batches every few seconds and when the tab is hidden; recording stops after
 * 30 minutes or when the server says stop. The recorder is loaded only when replay is on.
 */
export function ActivityBeacon({ replay }: { replay: boolean }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const path = `${pathname}${search?.size ? `?${search}` : ""}`;

  useEffect(() => {
    // Once per page: effects can run twice (development, quick back-and-forth).
    if (lastVisit.path === path && Date.now() - lastVisit.at < 3_000) return;
    lastVisit.path = path; lastVisit.at = Date.now();
    fetch("/api/activity/visit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path }), keepalive: true }).catch(() => {});
  }, [path]);

  const first = useRef(path);
  useEffect(() => {
    if (!replay) return;
    let stop: (() => void) | undefined;
    let buf: unknown[] = [];
    let done = false;
    const id = crypto.randomUUID();
    const started = Date.now();
    const send = (final = false) => {
      if (!buf.length || done) return;
      const events = buf; buf = [];
      const body = JSON.stringify(events);
      const url = `/api/activity/replay?id=${id}&path=${encodeURIComponent(first.current)}&n=${events.length}`;
      fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: final && body.length < 60_000 })
        .then((r) => r.json()).then((r: { stop?: boolean }) => { if (r?.stop) end(); }).catch(() => {});
    };
    const end = () => { done = true; stop?.(); stop = undefined; };
    const timer = window.setInterval(() => { if (Date.now() - started > MAX_MS) { send(true); end(); } else send(); }, FLUSH_MS);
    const hidden = () => { if (document.visibilityState === "hidden") send(true); };
    document.addEventListener("visibilitychange", hidden);
    import("@rrweb/record").then(({ record }) => {
      if (done) return;
      stop = record({
        emit: (e) => { buf.push(e); },
        maskAllInputs: true,
        blockClass: "mn-no-replay",
        maskTextClass: "mn-mask",
        sampling: { mousemove: 100, scroll: 150, input: "last", media: 800 },
        slimDOMOptions: "all",
        inlineStylesheet: true,
        recordCanvas: false,
        collectFonts: false,
      }) ?? undefined;
    }).catch(() => {});
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", hidden); send(true); end(); };
  }, [replay]);

  return null;
}
