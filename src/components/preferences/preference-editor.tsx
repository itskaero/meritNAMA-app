"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { removeItemAction, reorderAction } from "@/app/portal/preferences/actions";
import { PredictionBadge } from "@/components/charts/prediction-badge";
import { StatusPill } from "@/components/finder/status";
import { cn } from "@/components/ui/cn";
import type { FinderStatus } from "@/lib/domain/finder";
import type { Confidence } from "@/lib/domain/prediction";

export type EditorRow = {
  position: number;
  speciality: string;
  hospital: string;
  offered: boolean;
  status: FinderStatus | null;
  lastPct: number | null;
  lastClosing: number | null;
  lastRound: number | null;
  predicted: { low: number; high: number; confidence: Confidence; n: number; fallback: boolean } | null;
};

const key = (r: { speciality: string; hospital: string }) => `${r.speciality}\u0000${r.hospital}`;

/**
 * The ordered list. Reorder by dragging (mouse), by the ↑/↓ buttons, or with
 * Alt+↑/↓ on a focused row; changes save after a short pause. If saving fails the
 * previous order comes back and the reason is shown. The page gives it a `key`
 * from the server's order, so a fresh render (after add/remove) starts it anew.
 */
export function PreferenceEditor({ listId, rows, likely, unreached, total }: { listId: string; rows: EditorRow[]; likely: number | null; unreached: number[]; total: number | null }) {
  const router = useRouter();
  const [order, setOrder] = useState(rows);
  const [saved, setSaved] = useState(rows);
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());

  const save = (next: EditorRow[]) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      start(async () => {
        const res = await reorderAction(listId, next.map((r) => [r.speciality, r.hospital]));
        if (res.status === "error") {
          setOrder(saved);
          setMessage({ tone: "error", text: res.message ?? "Could not save the order." });
        } else {
          setSaved(next);
          setMessage({ tone: "ok", text: "Order saved." });
          router.refresh();
        }
      });
    }, 600);
  };

  const move = (from: number, to: number, focus = false) => {
    if (to < 0 || to >= order.length || from === to) return;
    const next = [...order];
    const [r] = next.splice(from, 1);
    next.splice(to, 0, r!);
    setOrder(next);
    setMessage(null);
    save(next);
    if (focus) requestAnimationFrame(() => rowRefs.current.get(key(r!))?.focus());
  };

  const remove = (r: EditorRow) =>
    start(async () => {
      const res = await removeItemAction(listId, r.speciality, r.hospital);
      if (res.status === "error") setMessage({ tone: "error", text: res.message ?? "Could not remove it." });
      router.refresh();
    });

  // Positions in the saved analysis refer to the saved order; map them by option.
  const savedPos = new Map(saved.map((r, i) => [key(r), i + 1]));
  const isUnreached = (r: EditorRow) => unreached.includes(savedPos.get(key(r)) ?? -1);
  const isLikely = (r: EditorRow) => likely !== null && savedPos.get(key(r)) === likely;

  if (order.length === 0) return null;
  return (
    <div className="@container grid gap-2">
      <ol className="grid gap-2" aria-label="Your preferences, in order">
        {order.map((r, i) => (
          <li
            key={key(r)}
            ref={(el) => {
              if (el) rowRefs.current.set(key(r), el);
            }}
            tabIndex={0}
            draggable
            onDragStart={(e) => {
              setDragging(key(r));
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragEnd={() => setDragging(null)}
            onDragOver={(e) => {
              e.preventDefault();
              const from = order.findIndex((x) => key(x) === dragging);
              if (from >= 0 && from !== i) move(from, i);
            }}
            onKeyDown={(e) => {
              if (e.altKey && e.key === "ArrowUp") { e.preventDefault(); move(i, i - 1, true); }
              if (e.altKey && e.key === "ArrowDown") { e.preventDefault(); move(i, i + 1, true); }
            }}
            aria-label={`${i + 1}. ${r.speciality} at ${r.hospital}. Alt and arrow keys move it.`}
            className={cn(
              "grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 rounded-2xl border bg-canvas px-3 py-2.5 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-signal @2xl:grid-cols-[2rem_minmax(0,1fr)_8rem_8.5rem_auto]",
              dragging === key(r) ? "border-signal/60 opacity-60" : isLikely(r) ? "border-success/60" : "border-line",
              isUnreached(r) && "opacity-55",
            )}
          >
            <span className="flex flex-col items-center gap-0.5">
              <span aria-hidden className="cursor-grab select-none text-subtle" title="Drag to reorder">⋮⋮</span>
              <span className="font-mono text-xs font-semibold tabular-nums">{i + 1}</span>
            </span>
            <span className="min-w-0">
              <span className="block truncate font-medium">{r.speciality}</span>
              <span className="block truncate text-xs text-muted">{r.hospital}</span>
              {isLikely(r) ? <span className="text-[0.7rem] font-semibold text-success">Most likely placement</span> : null}
              {isUnreached(r) ? <span className="text-[0.7rem] text-subtle">Unlikely to be used (a Safe option is above)</span> : null}
              {!r.offered ? <span className="text-[0.7rem] text-amber">Not offered in the latest induction</span> : null}
            </span>
            <span className="col-start-2 row-start-2 flex flex-wrap items-center gap-2 @2xl:col-start-auto @2xl:row-start-auto">
              {r.status ? <StatusPill status={r.status} /> : <span className="text-xs text-subtle">—</span>}
            </span>
            <span className="col-start-2 row-start-3 text-xs text-muted @2xl:col-start-auto @2xl:row-start-auto @2xl:text-right" title={r.lastClosing != null && total ? `${r.lastClosing.toFixed(2)} of ${total} in round ${r.lastRound}` : undefined}>
              {r.lastPct != null ? <>Closed at <span className="font-mono text-ink">{r.lastPct.toFixed(1)}%</span></> : null}
              {r.predicted ? <span className="block"><PredictionBadge {...r.predicted} compact /></span> : null}
            </span>
            <span className="col-start-3 row-span-3 row-start-1 flex flex-col items-end gap-1 print:hidden @2xl:col-start-auto @2xl:row-span-1 @2xl:row-start-auto @2xl:flex-row @2xl:items-center">
              <span className="flex gap-1">
                <button type="button" onClick={() => move(i, i - 1, true)} disabled={i === 0 || pending} className="h-8 w-8 rounded-full border border-line text-muted hover:text-ink disabled:opacity-30" aria-label={`Move ${r.speciality} at ${r.hospital} up`}>↑</button>
                <button type="button" onClick={() => move(i, i + 1, true)} disabled={i === order.length - 1 || pending} className="h-8 w-8 rounded-full border border-line text-muted hover:text-ink disabled:opacity-30" aria-label={`Move ${r.speciality} at ${r.hospital} down`}>↓</button>
              </span>
              <button type="button" onClick={() => remove(r)} disabled={pending} className="rounded-full px-2 py-1 text-xs text-subtle hover:bg-hover hover:text-ink" aria-label={`Remove ${r.speciality} at ${r.hospital}`}>Remove</button>
            </span>
          </li>
        ))}
      </ol>
      <p role="status" aria-live="polite" className={cn("min-h-5 text-xs print:hidden", message?.tone === "error" ? "text-danger" : "text-subtle")}>
        {pending ? "Saving…" : message?.text ?? "Drag rows, use ↑/↓, or focus a row and press Alt + arrow keys. Changes save automatically."}
      </p>
    </div>
  );
}
