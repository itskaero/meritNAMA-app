"use client";

import "rrweb-player/dist/style.css";
import { useEffect, useRef, useState } from "react";

/** rrweb's player for one recording, fitted to the card. Pages replay as recorded; scripts never run. */
export function ReplayPlayer({ id }: { id: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "empty" | "error">("loading");

  useEffect(() => {
    let player: { $destroy(): void } | null = null;
    let gone = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/replay/${id}`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const events = (await res.json()) as { type: number; timestamp: number }[];
        if (gone || !box.current) return;
        if (events.length < 2 || !events.some((e) => e.type === 2)) { setState("empty"); return; }
        const { default: Player } = await import("rrweb-player");
        if (gone || !box.current) return;
        const width = box.current.clientWidth;
        player = new Player({
          target: box.current,
          props: { events: events as never, width, height: Math.round(width * 0.58), autoPlay: false, skipInactive: true, showController: true },
        }) as unknown as { $destroy(): void };
        setState("ready");
      } catch {
        if (!gone) setState("error");
      }
    })();
    return () => { gone = true; player?.$destroy(); };
  }, [id]);

  return (
    <div className="grid gap-3">
      {state === "loading" ? <p className="text-sm text-muted">Loading the recording…</p> : null}
      {state === "empty" ? <p className="text-sm text-muted">This recording has no full page yet (the tab closed within seconds).</p> : null}
      {state === "error" ? <p className="text-sm text-muted">The recording could not be loaded. It may have passed its retention period.</p> : null}
      <div ref={box} className="w-full overflow-hidden rounded-xl [&_.rr-player]:!bg-canvas [&_.rr-player]:!shadow-none [&_.rr-controller]:!bg-surface [&_.rr-controller]:!text-ink [&_.rr-timeline__time]:!text-muted [&_.rr-controller__btns_button]:!text-ink [&_.rr-controller__btns_button.active]:!bg-signal [&_.rr-controller__btns_button.active]:!text-signal-ink [&_.rr-progress]:!bg-elevated [&_.rr-progress]:!border-surface [&_.rr-progress__step]:!bg-signal/40 [&_.rr-progress__handler]:!bg-signal [&_svg]:fill-current" />
    </div>
  );
}
