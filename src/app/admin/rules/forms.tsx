"use client";

import { useActionState, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { ActionResult, fieldClass, ReasonField } from "@/components/ui/form";
import { idleState } from "@/lib/action-state";
import { activateRulesAction, saveFormulaDraftAction, saveRulesDraftAction } from "./actions";
import { RulesFormEditor, type RulesValue } from "./rules-form-editor";

/**
 * New draft for an induction, prefilled with the current or default rules. Edited as a
 * form (default) or as JSON; both produce the same definition, validated on the server.
 */
export function RulesDraftForm({ induction, definition, fixedInduction = false }: { induction?: number; definition: string; fixedInduction?: boolean }) {
  const [state, action, pending] = useActionState(saveRulesDraftAction, idleState);
  const [text, setText] = useState(definition);
  const [mode, setMode] = useState<"form" | "json">("form");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [n, setN] = useState(induction ? String(induction) : "");
  const textId = useId();
  const nId = useId();
  let parsed: RulesValue | null = null;
  try { parsed = JSON.parse(text) as RulesValue; } catch { parsed = null; }
  const toForm = () => {
    if (!parsed || typeof parsed !== "object") { setJsonError("The JSON has an error; fix it before switching to the form."); return; }
    setJsonError(null);
    setMode("form");
  };
  return (
    <form action={action} className="grid gap-4">
      {fixedInduction ? (
        <input type="hidden" name="induction" value={n} />
      ) : (
        <div className="grid gap-1.5">
          <label htmlFor={nId} className="text-sm font-medium">Induction</label>
          <input id={nId} name="induction" inputMode="numeric" required value={n} onChange={(e) => setN(e.target.value)} className={cn(fieldClass, "max-w-40")} placeholder="e.g. 22" />
        </div>
      )}
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">Rules</p>
          <div role="tablist" aria-label="Edit rules as" className="inline-flex rounded-lg border border-line bg-canvas p-0.5 text-sm">
            <button type="button" role="tab" aria-selected={mode === "form"} onClick={toForm} className={cn("rounded-md px-3 py-1", mode === "form" ? "bg-surface font-medium text-ink shadow-[var(--mn-shadow-1)]" : "text-muted")}>Form</button>
            <button type="button" role="tab" aria-selected={mode === "json"} onClick={() => setMode("json")} className={cn("rounded-md px-3 py-1", mode === "json" ? "bg-surface font-medium text-ink shadow-[var(--mn-shadow-1)]" : "text-muted")}>JSON</button>
          </div>
        </div>
        {jsonError ? <p role="alert" className="text-sm text-danger">{jsonError}</p> : null}
        {mode === "form" && parsed ? (
          <>
            <input type="hidden" name="definition" value={text} />
            <RulesFormEditor value={parsed} onChange={(v) => setText(JSON.stringify(v, null, 2))} />
          </>
        ) : (
          <>
            <label htmlFor={textId} className="sr-only">Rules (JSON)</label>
            <textarea
              id={textId}
              name="definition"
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
              rows={24}
              className={cn(fieldClass, "font-mono text-xs leading-relaxed")}
            />
          </>
        )}
        <p className="text-xs text-subtle">
          Saving creates a new draft version; nothing changes until a draft is activated and the activation is published.
          In JSON, unknown settings are rejected; set a bonus&apos;s <code>enabled</code> to <code>&quot;auto&quot;</code> to follow the scoring policy.
        </p>
      </div>
      <ReasonField placeholder="e.g. PHF notification: certificate marks count once, best certificate" />
      <div><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save as new draft"}</Button></div>
      <ActionResult state={state} />
    </form>
  );
}

export function ActivateRulesForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(activateRulesAction, idleState);
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="id" value={id} />
      <ReasonField placeholder="e.g. Rules for induction 22 confirmed" />
      <div><Button type="submit" variant="secondary" disabled={pending}>{pending ? "Staging…" : "Make active"}</Button></div>
      <ActionResult state={state} />
    </form>
  );
}

/** Save the tried formula into a new draft of this version. */
export function SaveFormulaForm({ id, formula, onMissing, label }: { id: string; formula: string; onMissing: "imported" | "zero"; label: string }) {
  const [state, action, pending] = useActionState(saveFormulaDraftAction, idleState);
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="formula" value={formula} />
      <input type="hidden" name="onMissing" value={onMissing} />
      <ReasonField placeholder="e.g. Recompute base marks from components; 9 records were mis-totalled" />
      <div><Button type="submit" disabled={pending}>{label}</Button></div>
      <ActionResult state={state} />
    </form>
  );
}
