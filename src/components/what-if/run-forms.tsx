"use client";

import { useActionState } from "react";
import { resetConsentAction, runWhatIfAction } from "@/app/what-if-actions";
import { Button } from "@/components/ui/button";
import { ActionResult } from "@/components/ui/form";
import { idleState } from "@/lib/action-state";

/** "Simulate round N+1" with the person's simulated consent, and "Reset". */
export function WhatIfRunForm({ induction, base, back, nextRound, changes }: { induction: number; base: string; back: string; nextRound: number; changes: number }) {
  const [state, action, pending] = useActionState(runWhatIfAction, idleState);
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <form action={action}>
          <input type="hidden" name="induction" value={induction} />
          <input type="hidden" name="base" value={base} />
          <input type="hidden" name="back" value={back} />
          <Button type="submit" disabled={pending}>{pending ? "Starting…" : `Simulate round ${nextRound}`}</Button>
        </form>
        {changes ? (
          <form action={resetConsentAction}>
            <input type="hidden" name="induction" value={induction} />
            <input type="hidden" name="base" value={base} />
            <input type="hidden" name="back" value={back} />
            <Button type="submit" variant="ghost">Reset to official consent</Button>
          </form>
        ) : null}
      </div>
      <ActionResult state={state} />
    </div>
  );
}
