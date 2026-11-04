"use client";

import { useId, useState, type ReactNode } from "react";
import type { ActionState } from "@/lib/action-state";
import { cn } from "./cn";

import { fieldClass } from "./styles";

export { fieldClass };

/** Success or error banner for a form Server Action, with validation issues listed. */
export function ActionResult({ state, fileReset = false }: { state: ActionState; fileReset?: boolean }) {
  if (state.status === "idle") return null;
  const error = state.status === "error";
  return (
    <div
      role={error ? "alert" : "status"}
      className={cn("rounded-2xl border p-4 text-sm", error ? "border-danger/40 bg-danger/10" : "border-success/40 bg-success/10")}
    >
      <p className={cn("font-semibold", error ? "text-danger" : "text-success")}>{state.message}</p>
      {error && fileReset ? <p className="mt-1 text-muted">Choose the file again before retrying.</p> : null}
      {state.href ? <a href={state.href} className="mt-2 inline-block font-semibold text-signal underline-offset-4 hover:underline">{state.hrefLabel ?? "Open"} →</a> : null}
      {state.issues?.length ? (
        <ul className="mt-2 list-disc space-y-1 pl-5 font-mono text-xs text-muted">
          {state.issues.slice(0, 20).map((i, n) => <li key={n}>{i}</li>)}
          {state.issues.length > 20 ? <li>…and {state.issues.length - 20} more</li> : null}
        </ul>
      ) : null}
    </div>
  );
}

/** Label + control. `children` receives the generated id. */
export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      {children(id)}
      {hint ? <p className="text-xs text-subtle">{hint}</p> : null}
    </div>
  );
}

/**
 * Controlled on purpose: React resets uncontrolled form fields after an action runs,
 * which would wipe what the admin typed whenever validation fails.
 */
export function ReasonField({ placeholder, value, onChange }: { placeholder: string; value?: string; onChange?: (v: string) => void }) {
  const [own, setOwn] = useState("");
  const v = value ?? own;
  return (
    <Field label={<>Reason <span className="text-muted">(recorded in the audit log)</span></>}>
      {(id) => (
        <input id={id} name="reason" required className={fieldClass} placeholder={placeholder} value={v} onChange={(e) => (onChange ?? setOwn)(e.target.value)} />
      )}
    </Field>
  );
}

/** Browsers cannot refill a file input, so after a failed import the file must be chosen again. */
export function FileField({ label, hint }: { label: string; hint?: ReactNode }) {
  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <input
          id={id}
          name="file"
          type="file"
          accept="application/json,.json"
          required
          className={cn(fieldClass, "file:mr-3 file:rounded-full file:border-0 file:bg-elevated file:px-3 file:py-1 file:text-ink")}
        />
      )}
    </Field>
  );
}

/** JSON editor textarea; controlled so edits survive a failed save. */
export function JsonField({ label, hint, initial, rows = 24 }: { label: string; hint?: ReactNode; initial: string; rows?: number }) {
  const [text, setText] = useState(initial);
  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <textarea
          id={id}
          name="data"
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          rows={rows}
          className={cn(fieldClass, "font-mono text-xs leading-relaxed")}
        />
      )}
    </Field>
  );
}
