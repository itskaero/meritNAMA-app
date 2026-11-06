"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { ActionResult, Field, fieldClass } from "@/components/ui/form";
import { idleState } from "@/lib/action-state";
import { createListAction, deleteListAction, renameListAction, setMarksAction } from "./actions";

export function NewListForm({ tracks, defaultTrack, shortlistCounts }: { tracks: { value: string; label: string }[]; defaultTrack: string; shortlistCounts: Record<string, number> }) {
  const [state, action, pending] = useActionState(createListAction, idleState);
  const [name, setName] = useState("");
  const [track, setTrack] = useState(defaultTrack);
  const fromShortlist = shortlistCounts[track] ?? 0;
  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name">
          {(id) => <input id={id} name="name" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} className={fieldClass} placeholder="e.g. Plan A, Lahore first" />}
        </Field>
        <Field label="Programme · quota">
          {(id) => (
            <select id={id} name="track" value={track} onChange={(e) => setTrack(e.target.value)} className={fieldClass}>
              {tracks.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          )}
        </Field>
      </div>
      <label className={cn("flex items-center gap-2 text-sm", !fromShortlist && "text-subtle")}>
        <input type="checkbox" name="fromShortlist" value="1" defaultChecked={fromShortlist > 0} disabled={!fromShortlist} className="accent-[var(--mn-cyan)]" />
        {fromShortlist ? `Start from my shortlist (${fromShortlist} ${fromShortlist === 1 ? "option" : "options"})` : "Your shortlist has nothing for this programme · quota"}
      </label>
      <div><Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create list"}</Button></div>
      <ActionResult state={state} />
    </form>
  );
}

export function RenameForm({ id, name }: { id: string; name: string }) {
  const [state, action, pending] = useActionState(renameListAction, idleState);
  const [v, setV] = useState(name);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <label className="sr-only" htmlFor="list-name">List name</label>
      <input id="list-name" name="name" value={v} onChange={(e) => setV(e.target.value)} maxLength={60} className={cn(fieldClass, "h-9 w-auto min-w-0 flex-1 py-0 sm:w-64 sm:flex-none")} />
      <Button type="submit" size="sm" variant="secondary" disabled={pending || v.trim() === name}>Rename</Button>
      {state.status === "error" ? <span role="alert" className="text-xs text-danger">{state.message}</span> : null}
    </form>
  );
}

export function MarksForm({ id, marks, total, from }: { id: string; marks: number | null; total: number | null; from: "list" | "record" | null }) {
  const [state, action, pending] = useActionState(setMarksAction, idleState);
  const [m, setM] = useState(marks == null ? "" : String(Number(marks.toFixed(4))));
  const [t, setT] = useState(total == null ? "" : String(total));
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="id" value={id} />
      <label className="grid gap-1.5 text-sm font-medium">Your marks
        <span className="flex items-center gap-2">
          <input name="marks" inputMode="decimal" value={m} onChange={(e) => setM(e.target.value)} placeholder="e.g. 21.8" className={cn(fieldClass, "w-28 font-mono")} />
          <span className="text-sm text-muted">of</span>
          <input name="total" inputMode="decimal" value={t} onChange={(e) => setT(e.target.value)} aria-label="Out of (total marks)" className={cn(fieldClass, "w-20 font-mono")} />
        </span>
      </label>
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>Check the list</Button>
      <p className="min-w-0 flex-1 text-xs text-subtle">{from === "record" ? "From your verified record. Enter other marks to try them." : from === "list" ? "Saved with this list. Clear it to use your verified record." : "Compared in percent of total with the latest induction."}</p>
      {state.status === "error" ? <p role="alert" className="w-full text-xs text-danger">{state.message}</p> : null}
    </form>
  );
}

export function DeleteListButton({ id, name }: { id: string; name: string }) {
  const [confirm, setConfirm] = useState(false);
  if (!confirm) return <Button type="button" size="sm" variant="ghost" onClick={() => setConfirm(true)}>Delete</Button>;
  return (
    <form action={deleteListAction} className="flex flex-wrap items-center gap-2 rounded-full border border-danger/40 px-3 py-1">
      <input type="hidden" name="id" value={id} />
      <span className="text-xs">Delete “{name}”?</span>
      <button type="submit" className="text-xs font-semibold text-danger hover:underline">Delete</button>
      <button type="button" onClick={() => setConfirm(false)} className="text-xs text-muted hover:text-ink">Keep</button>
    </form>
  );
}
