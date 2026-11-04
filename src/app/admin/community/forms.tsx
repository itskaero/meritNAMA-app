"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { fieldClass } from "@/components/ui/form";
import { idleState } from "@/lib/action-state";
import { dismissAction, moderateAction } from "./actions";

type State = { hidden: boolean; locked?: boolean; pinned?: boolean };

/** Admin-only moderation row: pick an action, give a reason (audited), apply. */
export function ModerationControls({ kind, id, state, allowDismiss = false }: { kind: "thread" | "post"; id: string; state: State; allowDismiss?: boolean }) {
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
