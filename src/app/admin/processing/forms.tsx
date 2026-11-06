"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ActionResult, ReasonField } from "@/components/ui/form";
import { idleState } from "@/lib/action-state";
import { importDatasetAction, startRunAction } from "./actions";

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

export function StartRunForm({ induction }: { induction: number }) {
  const [state, action, pending] = useActionState(startRunAction, idleState);
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="induction" value={induction} />
      <div><Button type="submit" disabled={pending}>{pending ? "Starting…" : "Simulate round 1"}</Button></div>
      <ActionResult state={state} />
    </form>
  );
}
