"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ActionResult, ReasonField } from "@/components/ui/form";
import { idleState } from "@/lib/action-state";
import { importConsentAction, importDatasetAction, startRunAction } from "./actions";

export function ImportDatasetForm({ induction, replaces }: { induction: number; replaces: boolean }) {
  const [state, action, pending] = useActionState(importDatasetAction, idleState);
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="induction" value={induction} />
      <ReasonField placeholder={`e.g. Induction ${induction} files from PHF, for the back-test`} />
      <div>
        <Button type="submit" variant={replaces ? "secondary" : "primary"} disabled={pending}>
          {pending ? "Importing… (large files take a minute)" : replaces ? "Re-import (replaces the stored data)" : "Import"}
        </Button>
      </div>
      <ActionResult state={state} />
    </form>
  );
}

/** Round 1 from preferences, or (with fromRound) round fromRound + 1 from the published round and its consent. */
export function StartRunForm({ induction, fromRound, variant = "primary" }: { induction: number; fromRound?: number; variant?: "primary" | "secondary" }) {
  const [state, action, pending] = useActionState(startRunAction, idleState);
  const label = fromRound ? `Simulate round ${fromRound + 1}` : "Simulate round 1";
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="induction" value={induction} />
      {fromRound ? <input type="hidden" name="fromRound" value={fromRound} /> : null}
      <div><Button type="submit" size="sm" variant={variant} disabled={pending}>{pending ? "Starting…" : label}</Button></div>
      <ActionResult state={state} />
    </form>
  );
}

export function ImportConsentForm({ induction }: { induction: number }) {
  const [state, action, pending] = useActionState(importConsentAction, idleState);
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="induction" value={induction} />
      <ReasonField placeholder="e.g. Round 3 consent fetched from the portal" />
      <div><Button type="submit" variant="secondary" disabled={pending}>{pending ? "Importing…" : "Import consent files"}</Button></div>
      <ActionResult state={state} />
    </form>
  );
}
