"use client";

import { useActionState, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { ActionResult as Result, fieldClass as field, ReasonField as Reason } from "@/components/ui/form";
import { idleState as idle } from "@/lib/action-state";
import { activateAction, importPolicyFileAction, saveDraftAction } from "./actions";

export function ImportForm() {
  const [state, action, pending] = useActionState(importPolicyFileAction, idle);
  const fileId = useId();
  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-1.5">
        <label htmlFor={fileId} className="text-sm font-medium">scoring_policy.json</label>
        <input
          id={fileId}
          name="file"
          type="file"
          accept="application/json,.json"
          required
          className={cn(field, "file:mr-3 file:rounded-full file:border-0 file:bg-elevated file:px-3 file:py-1 file:text-ink")}
        />
        <p className="text-xs text-subtle">
          Validated in full before anything is written. Each policy is stored as a new version; existing versions are kept.
          The file&apos;s active_policy becomes active.
        </p>
      </div>
      <Reason placeholder="e.g. Initial import from the public site" />
      <div><Button type="submit" disabled={pending}>{pending ? "Importing…" : "Import file"}</Button></div>
      <Result state={state} fileReset />
    </form>
  );
}

export function EditDraftForm({ policyKey, definition }: { policyKey: string; definition: string }) {
  const [state, action, pending] = useActionState(saveDraftAction, idle);
  const [text, setText] = useState(definition);
  const id = useId();
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="policyKey" value={policyKey} />
      <div className="grid gap-1.5">
        <label htmlFor={id} className="text-sm font-medium">Definition (JSON)</label>
        <textarea
          id={id}
          name="definition"
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          rows={24}
          className={cn(field, "font-mono text-xs leading-relaxed")}
        />
        <p className="text-xs text-subtle">
          Saving never changes this version: it creates a new draft. Components must sum to total_marks; unknown fields are rejected.
        </p>
      </div>
      <Reason placeholder="e.g. Correct research marks per the 2026 notification" />
      <div><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save as new draft"}</Button></div>
      <Result state={state} />
    </form>
  );
}

export function ActivateForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(activateAction, idle);
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="id" value={id} />
      <Reason placeholder="e.g. Policy for induction 22 announced" />
      <div><Button type="submit" variant="secondary" disabled={pending}>{pending ? "Activating…" : "Make active"}</Button></div>
      <Result state={state} />
    </form>
  );
}
