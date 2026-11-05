"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { fieldClass } from "@/components/ui/form";
import { idleState } from "@/lib/action-state";
import { dismissAction, duplicateAction, moderateAction, searchThreadsAction } from "./actions";

type State = { hidden: boolean; locked?: boolean; pinned?: boolean };

/** Admin-only moderation row: pick an action, give a reason (audited), apply. */
export function ModerationControls({ kind, id, state, allowDismiss = false }: { kind: "thread" | "post" | "review"; id: string; state: State; allowDismiss?: boolean }) {
  const [res, action, pending] = useActionState(moderateAction, idleState);
  const [dres, dismiss, dpending] = useActionState(dismissAction, idleState);
  const options = [
    state.hidden ? ["show", "Show to members"] : ["hide", "Hide from members"],
    ...(kind === "thread" ? [state.locked ? ["unlock", "Reopen replies"] : ["lock", "Lock replies"], state.pinned ? ["unpin", "Unpin"] : ["pin", "Pin to top"]] : []),
  ] as [string, string][];
  const [choice, setChoice] = useState(options[0]![0]);
  const [reason, setReason] = useState("");
  const msg = res.status !== "idle" ? res : dres;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-line-strong p-2">
      <span className="px-1 text-xs font-semibold uppercase tracking-wider text-subtle">Moderate</span>
      <form action={action} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="id" value={id} />
        <label className="sr-only" htmlFor={`mod-a-${id}`}>Moderation action</label>
        <select id={`mod-a-${id}`} name="action" value={choice} onChange={(e) => setChoice(e.target.value)} className={cn(fieldClass, "h-8 w-auto py-0 text-xs")}>
          {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <label className="sr-only" htmlFor={`mod-r-${id}`}>Reason</label>
        <input id={`mod-r-${id}`} name="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (audited)" className={cn(fieldClass, "h-8 w-44 py-0 text-xs")} />
        <Button type="submit" size="sm" variant="secondary" disabled={pending || !reason.trim()}>Apply</Button>
      </form>
      {allowDismiss ? (
        <form action={dismiss}>
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="reason" value={reason} />
          <Button type="submit" size="sm" variant="ghost" disabled={dpending || !reason.trim()}>Dismiss reports</Button>
        </form>
      ) : null}
      {msg.status !== "idle" ? <span role={msg.status === "error" ? "alert" : "status"} className={cn("text-xs", msg.status === "error" ? "text-danger" : "text-success")}>{msg.message}</span> : null}
    </div>
  );
}

/** Moderators: close a question as a duplicate of another, found by title. */
export function DuplicateControl({ threadId }: { threadId: string }) {
  const [res, action, pending] = useActionState(duplicateAction, idleState);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ id: string; title: string }[]>([]);
  const [pick, setPick] = useState("");
  const [reason, setReason] = useState("");
  const [searching, start] = useTransition();
  const search = (v: string) => {
    setQ(v);
    if (v.trim().length >= 3) start(async () => setHits(await searchThreadsAction(v, threadId)));
  };
  return (
    <details className="rounded-xl border border-dashed border-line-strong p-2 text-xs">
      <summary className="cursor-pointer px-1 font-semibold uppercase tracking-wider text-subtle">Mark as duplicate</summary>
      <form action={action} className="mt-2 grid gap-2">
        <input type="hidden" name="threadId" value={threadId} />
        <input type="hidden" name="originalId" value={pick} />
        <label className="sr-only" htmlFor={`dup-q-${threadId}`}>Search the original question</label>
        <input id={`dup-q-${threadId}`} value={q} onChange={(e) => search(e.target.value)} placeholder="Search the original by title" className={cn(fieldClass, "h-8 py-0 text-xs")} />
        {hits.length ? (
          <ul className="grid gap-1">
            {hits.map((h) => (
              <li key={h.id}>
                <label className="flex items-center gap-2">
                  <input type="radio" name="pick" checked={pick === h.id} onChange={() => setPick(h.id)} />
                  <span className="truncate">{h.title}</span>
                </label>
              </li>
            ))}
          </ul>
        ) : q.trim().length >= 3 && !searching ? <p className="text-subtle">No matching questions.</p> : null}
        <label className="sr-only" htmlFor={`dup-r-${threadId}`}>Reason</label>
        <input id={`dup-r-${threadId}`} name="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (audited)" className={cn(fieldClass, "h-8 py-0 text-xs")} />
        <div><Button type="submit" size="sm" variant="secondary" disabled={pending || !pick || !reason.trim()}>Close as duplicate</Button></div>
        {res.status !== "idle" ? <span role={res.status === "error" ? "alert" : "status"} className={res.status === "error" ? "text-danger" : "text-success"}>{res.message}</span> : null}
      </form>
    </details>
  );
}
