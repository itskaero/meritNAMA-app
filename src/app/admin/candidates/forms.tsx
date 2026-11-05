"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { fieldClass } from "@/components/ui/form";
import { idleState } from "@/lib/action-state";
import { reviewLinkAction } from "./actions";

/** Approve or reject one link request; the reason is audited and shown to the candidate on rejection. */
export function ReviewControls({ id }: { id: string }) {
  const [res, action, pending] = useActionState(reviewLinkAction, idleState);
  const [reason, setReason] = useState("");
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <label className="sr-only" htmlFor={`rv-${id}`}>Reason</label>
      <input id={`rv-${id}`} name="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (audited)" className={cn(fieldClass, "h-9 min-w-0 flex-1 py-0 sm:w-64 sm:flex-none")} />
      <Button type="submit" name="decision" value="approve" size="sm" disabled={pending || !reason.trim()}>Approve</Button>
      <Button type="submit" name="decision" value="reject" size="sm" variant="secondary" disabled={pending || !reason.trim()}>Reject</Button>
      {res.status === "error" ? <span role="alert" className="w-full text-xs text-danger">{res.message}</span> : null}
    </form>
  );
}
