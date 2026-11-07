"use client";

import { useActionState, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { ActionResult, fieldClass, ReasonField } from "@/components/ui/form";
import { idleState } from "@/lib/action-state";
import { activateRulesAction, saveFormulaDraftAction, saveRulesDraftAction } from "./actions";

/** New draft for an induction, from a JSON definition (prefilled with the current or default rules). */
export function RulesDraftForm({ induction, definition, fixedInduction = false }: { induction?: number; definition: string; fixedInduction?: boolean }) {
  const [state, action, pending] = useActionState(saveRulesDraftAction, idleState);
  const [text, setText] = useState(definition);
  const [n, setN] = useState(induction ? String(induction) : "");
  const textId = useId();
  const nId = useId();
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
      <div className="grid gap-1.5">
        <label htmlFor={textId} className="text-sm font-medium">Rules (JSON)</label>
        <textarea
          id={textId}
          name="definition"
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          rows={24}
          className={cn(fieldClass, "font-mono text-xs leading-relaxed")}
        />
        <p className="text-xs text-subtle">
          Saving creates a new draft version; nothing changes until a draft is activated and the activation is published.
          Unknown settings are rejected. Set a bonus&apos;s <code>enabled</code> to <code>&quot;auto&quot;</code> to follow the scoring policy.
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
