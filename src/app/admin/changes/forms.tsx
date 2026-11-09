"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { ActionResult, ReasonField } from "@/components/ui/form";
import { idleState } from "@/lib/action-state";
import { decideChangeAction } from "./actions";

/** Publish / discard (pending) or roll back (published), with an audited reason. */
export function DecisionForm({ id, mode, stale }: { id: string; mode: "pending" | "rollback"; stale?: boolean }) {
  const [state, action, pending] = useActionState(decideChangeAction, idleState);
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState<"publish" | "discard" | "rollback" | null>(null);
  if (state.status === "success") return <ActionResult state={state} />;
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="id" value={id} />
      <ReasonField value={reason} onChange={setReason} placeholder={mode === "rollback" ? "e.g. Wrong file uploaded" : "e.g. Checked against the PHF notification"} />
      {confirm ? (
        <div className="grid gap-3 rounded-xl border border-amber/40 bg-amber/10 p-3 text-sm">
          <p className="font-semibold text-amber">
            {confirm === "publish" ? "Publish this change now? It applies immediately for everyone." : confirm === "rollback" ? "Roll back? The data returns to how it was before this change." : "Discard this change? Nothing is applied."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" name="decision" value={confirm} variant={confirm === "discard" ? "secondary" : "primary"} disabled={pending || !reason.trim()}>
              {pending ? "Working…" : confirm === "publish" ? "Yes, publish" : confirm === "rollback" ? "Yes, roll back" : "Yes, discard"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
          </div>
        </div>
      ) : mode === "pending" ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => setConfirm("publish")} disabled={stale || !reason.trim()}>Publish</Button>
          <Button type="button" variant="secondary" onClick={() => setConfirm("discard")} disabled={!reason.trim()}>Discard</Button>
        </div>
      ) : (
        <div><Button type="button" variant="danger" onClick={() => setConfirm("rollback")} disabled={!reason.trim()}>Roll back</Button></div>
      )}
      <ActionResult state={state} />
    </form>
  );
}
