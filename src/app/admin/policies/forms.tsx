"use client";

import { useActionState, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { activateAction, importPolicyFileAction, saveDraftAction, type ActionState } from "./actions";

const idle: ActionState = { status: "idle" };

const field = "w-full rounded-xl border border-line-strong bg-canvas px-3 py-2.5 text-sm text-ink placeholder:text-subtle";

function Result({ state }: { state: ActionState }) {
  if (state.status === "idle") return null;
  const error = state.status === "error";
  return (
    <div
      role={error ? "alert" : "status"}
      className={cn("rounded-2xl border p-4 text-sm", error ? "border-danger/40 bg-danger/10" : "border-success/40 bg-success/10")}
    >
      <p className={cn("font-semibold", error ? "text-danger" : "text-success")}>{state.message}</p>
      {state.issues?.length ? (
        <ul className="mt-2 list-disc space-y-1 pl-5 font-mono text-xs text-muted">
          {state.issues.slice(0, 20).map((i, n) => <li key={n}>{i}</li>)}
          {state.issues.length > 20 ? <li>…and {state.issues.length - 20} more</li> : null}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Fields are controlled on purpose: React resets uncontrolled form fields after an
 * action runs, which would wipe an admin's edits whenever validation fails.
 */
function Reason({ placeholder }: { placeholder: string }) {
  const id = useId();
  const [value, setValue] = useState("");
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">Reason <span className="text-muted">(recorded in the audit log)</span></label>
      <input id={id} name="reason" required className={field} placeholder={placeholder} value={value} onChange={(e) => setValue(e.target.value)} />
    </div>
  );
}

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
      <Result state={state} />
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
