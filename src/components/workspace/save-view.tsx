"use client";

import { useActionState, useState } from "react";
import { saveViewAction } from "@/app/portal/workspace/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { ActionResult, fieldClass } from "@/components/ui/form";
import { idleState } from "@/lib/action-state";

/** "Save this view": keeps the page, with its current filters, in the member's workspace. */
export function SaveView({ href, label }: { href: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(label);
  const [res, action, pending] = useActionState(saveViewAction, idleState);
  if (!open) return <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>Save this view</Button>;
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="href" value={href} />
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="sv-label">Name</label>
        <input id="sv-label" name="label" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={cn(fieldClass, "h-9 min-w-0 flex-1 py-0 sm:w-64 sm:flex-none")} />
        <Button type="submit" size="sm" disabled={pending || !name.trim()}>Save</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
      <ActionResult state={res} />
    </form>
  );
}
