"use client";

import { useActionState } from "react";
import { deleteAccountAction } from "./actions";
import { Button } from "@/components/ui/button";
import { ActionResult } from "@/components/ui/form";
import { fieldClass } from "@/components/ui/styles";
import { idleState } from "@/lib/action-state";

export function DeleteAccountForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState(deleteAccountAction, idleState);
  return (
    <form action={action} className="grid gap-3">
      <label className="grid gap-1.5 text-sm font-medium">
        Type <span className="font-mono text-ink">{email}</span> to confirm
        <input name="confirmEmail" required autoComplete="off" className={fieldClass} />
      </label>
      <div><Button type="submit" variant="secondary" disabled={pending}>{pending ? "Deleting" : "Delete my account"}</Button></div>
      {state.status === "error" ? <ActionResult state={state} /> : null}
    </form>
  );
}
