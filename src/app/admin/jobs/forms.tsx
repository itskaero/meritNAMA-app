"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ActionResult, Field, fieldClass } from "@/components/ui/form";
import { idleState, type ActionState } from "@/lib/action-state";
import { addJobAction, syncJobsAction } from "./actions";

export function SyncJobsButton() {
  const [state, setState] = useState<ActionState>(idleState);
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-2">
      <div><Button type="button" disabled={pending} onClick={() => start(async () => setState(await syncJobsAction()))}>{pending ? "Checking the sources…" : "Sync now"}</Button></div>
      <ActionResult state={state} />
    </div>
  );
}

export function AddJobForm() {
  const [state, action, pending] = useActionState(addJobAction, idleState);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <Field label="Title">{(id) => <input id={id} name="title" required maxLength={300} className={fieldClass} placeholder="Medical officers, DHQ Hospital Sahiwal" />}</Field>
      <Field label="Employer">{(id) => <input id={id} name="employer" required maxLength={200} className={fieldClass} />}</Field>
      <Field label="City">{(id) => <input id={id} name="city" maxLength={80} className={fieldClass} />}</Field>
      <Field label="Last date">{(id) => <input id={id} name="lastDate" type="date" className={fieldClass} />}</Field>
      <Field label="Link to the advert">{(id) => <input id={id} name="link" type="url" required className={fieldClass} placeholder="https://…" />}</Field>
      <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="official" value="1" defaultChecked /> Official advert</label>
      <div className="sm:col-span-2 grid gap-2">
        <div><Button type="submit" disabled={pending}>{pending ? "Adding…" : "Add advert"}</Button></div>
        <ActionResult state={state} />
      </div>
    </form>
  );
}
