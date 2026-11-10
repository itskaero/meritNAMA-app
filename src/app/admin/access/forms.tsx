"use client";

import { useActionState } from "react";
import { grantAccessAction, reviewAccessAction, revokeAccessAction, saveAccessSettingsAction } from "./actions";
import { Button } from "@/components/ui/button";
import { ActionResult } from "@/components/ui/form";
import { fieldClass } from "@/components/ui/styles";
import { idleState } from "@/lib/action-state";
import type { AccessSettings } from "@/lib/domain/access";

export function ReviewForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(reviewAccessAction, idleState);
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="id" value={id} />
      <label className="sr-only" htmlFor={`note-${id}`}>Note (needed to reject)</label>
      <input id={`note-${id}`} name="note" maxLength={200} placeholder="Note; needed to reject, e.g. payment not found" className={fieldClass} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="decision" value="approve" size="sm" disabled={pending}>Payment checked: approve</Button>
        <Button type="submit" name="decision" value="reject" size="sm" variant="secondary" disabled={pending}>Reject</Button>
      </div>
      {state.status !== "idle" ? <ActionResult state={state} /> : null}
    </form>
  );
}

export function RevokeForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(revokeAccessAction, idleState);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <label className="sr-only" htmlFor={`rev-${id}`}>Why</label>
      <input id={`rev-${id}`} name="note" required maxLength={200} placeholder="Why" className={`${fieldClass} max-w-48`} />
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>Remove access</Button>
      {state.status === "error" ? <ActionResult state={state} /> : null}
    </form>
  );
}

export function GrantForm() {
  const [state, action, pending] = useActionState(grantAccessAction, idleState);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
      <label className="grid gap-1.5 text-sm font-medium">Email
        <input name="email" type="email" required className={fieldClass} />
      </label>
      <label className="grid gap-1.5 text-sm font-medium">Note
        <input name="note" maxLength={200} placeholder="e.g. paid by bank transfer, ref 1234" className={fieldClass} />
      </label>
      <Button type="submit" disabled={pending}>Give access</Button>
      {state.status !== "idle" ? <div className="sm:col-span-3"><ActionResult state={state} /></div> : null}
    </form>
  );
}

function Check({ name, label, hint, on }: { name: string; label: string; hint?: string; on: boolean }) {
  return (
    <label className="flex items-start gap-3 text-sm">
      <input type="checkbox" name={name} defaultChecked={on} className="mt-0.5 h-4 w-4 accent-[var(--mn-cyan)]" />
      <span><span className="font-medium text-heading">{label}</span>{hint ? <span className="block text-xs text-muted">{hint}</span> : null}</span>
    </label>
  );
}

export function AccessSettingsForm({ s }: { s: AccessSettings }) {
  const [state, action, pending] = useActionState(saveAccessSettingsAction, idleState);
  return (
    <form action={action} className="grid gap-4">
      <Check name="paywall" label="Paywall on" hint="Sign-in needs an approved request. The sign-in page then shows Request access." on={s.paywall} />
      <Check name="requestsOpen" label="Accept new requests" hint="Turn off to close the door without lifting the paywall." on={s.requestsOpen} />
      <Check name="paymentRequired" label="Payment required with a request" hint="People enter the amount and the bank reference." on={s.paymentRequired} />
      <Check name="keepExisting" label="Keep people who already have an account" hint="Accounts made before the paywall was switched on keep signing in." on={s.keepExisting} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-medium">Lowest amount (PKR)<input name="priceMinPkr" inputMode="numeric" defaultValue={s.priceMinPkr} className={fieldClass} /></label>
        <label className="grid gap-1.5 text-sm font-medium">Highest amount (PKR)<input name="priceMaxPkr" inputMode="numeric" defaultValue={s.priceMaxPkr} className={fieldClass} /></label>
        <label className="grid gap-1.5 text-sm font-medium">Bank<input name="bankName" defaultValue={s.bankName} className={fieldClass} /></label>
        <label className="grid gap-1.5 text-sm font-medium">Account number<input name="accountNumber" defaultValue={s.accountNumber} className={fieldClass} /></label>
        <label className="grid gap-1.5 text-sm font-medium">Account title <span className="font-normal text-subtle">(shown to payers; leave empty to hide)</span><input name="accountTitle" defaultValue={s.accountTitle} className={fieldClass} /></label>
        <label className="grid gap-1.5 text-sm font-medium">Raast ID <span className="font-normal text-subtle">(optional)</span><input name="raastId" defaultValue={s.raastId} className={fieldClass} /></label>
      </div>
      <label className="grid gap-1.5 text-sm font-medium">Note above the payment details<textarea name="note" rows={3} defaultValue={s.note} className={fieldClass} /></label>
      <label className="grid gap-1.5 text-sm font-medium">Refund rule <span className="font-normal text-subtle">(shown on the request form and in the terms)</span><textarea name="refundNote" rows={3} defaultValue={s.refundNote} className={fieldClass} /></label>
      <label className="grid gap-1.5 text-sm font-medium">Message when requests are closed<input name="closedMessage" defaultValue={s.closedMessage} className={fieldClass} /></label>
      <label className="grid gap-1.5 text-sm font-medium">Reason for this change<input name="reason" required maxLength={200} placeholder="e.g. paywall on for induction 21" className={fieldClass} /></label>
      <div><Button type="submit" disabled={pending}>{pending ? "Saving" : "Save"}</Button></div>
      {state.status !== "idle" ? <ActionResult state={state} /> : null}
    </form>
  );
}
