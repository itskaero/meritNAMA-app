"use client";

import { useActionState, useState } from "react";
import { requestAccessAction } from "@/app/_actions/auth";
import { Button } from "@/components/ui/button";
import { ActionResult } from "@/components/ui/form";
import { idleState } from "@/lib/action-state";
import { priceText, type AccessSettings } from "@/lib/domain/access";

const inputClass = "h-11 w-full rounded-[10px] border border-line bg-elevated px-3.5 text-sm text-ink placeholder:text-subtle";

function Copy({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { void navigator.clipboard?.writeText(value.replace(/\s/g, "")).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }); }}
      className="rounded-md border border-line px-2 py-0.5 text-xs text-muted hover:text-ink"
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}

/**
 * Shown on the sign-in page while the paywall is on: how to pay, then email, what was
 * sent and the bank's reference. Approval is by hand; the person is emailed.
 */
export function RequestAccessForm({ s }: { s: Pick<AccessSettings, "paymentRequired" | "priceMinPkr" | "priceMaxPkr" | "bankName" | "accountNumber" | "accountTitle" | "raastId" | "note" | "requestsOpen" | "closedMessage"> }) {
  const [state, action, pending] = useActionState(requestAccessAction, idleState);

  if (!s.requestsOpen) return <p className="rounded-xl border border-line p-4 text-sm text-muted">{s.closedMessage}</p>;
  if (state.status === "success") {
    return (
      <div role="status" className="grid gap-2 rounded-xl border border-success/40 bg-success/10 p-4 text-sm">
        <p className="font-semibold text-success">Request received</p>
        <p className="text-muted">{state.message}</p>
      </div>
    );
  }
  return (
    <form action={action} className="grid gap-4">
      {s.paymentRequired ? (
        <div className="grid gap-2 rounded-xl border border-line bg-elevated p-4 text-sm">
          <p className="font-semibold text-heading">Pay {priceText(s)}</p>
          <p className="text-muted">{s.note}</p>
          {s.bankName ? <p className="text-xs text-subtle">{s.bankName}{s.accountTitle ? ` · ${s.accountTitle}` : ""}</p> : null}
          {s.accountNumber ? <p className="flex flex-wrap items-center gap-2"><span className="text-xs text-subtle">Account</span><code className="font-mono text-ink">{s.accountNumber}</code><Copy value={s.accountNumber} /></p> : null}
          {s.raastId ? <p className="flex flex-wrap items-center gap-2"><span className="text-xs text-subtle">Raast ID</span><code className="font-mono text-ink">{s.raastId}</code><Copy value={s.raastId} /></p> : null}
        </div>
      ) : s.note ? <p className="text-sm text-muted">{s.note}</p> : null}
      <label className="grid gap-1.5 text-sm font-medium">Email
        <input name="email" type="email" required autoComplete="email" inputMode="email" placeholder="the email you will sign in with" className={inputClass} />
      </label>
      <label className="grid gap-1.5 text-sm font-medium">Applicant ID <span className="font-normal text-subtle">(optional, helps us find your record)</span>
        <input name="applicantId" inputMode="numeric" pattern="\d*" maxLength={20} className={inputClass} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-medium">Amount sent (PKR)
          <input name="amount" inputMode="numeric" required={s.paymentRequired} placeholder={String(s.priceMinPkr)} className={inputClass} />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">Transaction reference
          <input name="reference" required={s.paymentRequired} maxLength={120} placeholder="from your banking app" className={inputClass} />
        </label>
      </div>
      <label className="grid gap-1.5 text-sm font-medium">Message <span className="font-normal text-subtle">(optional)</span>
        <textarea name="message" rows={2} maxLength={500} className="w-full rounded-[10px] border border-line bg-elevated px-3.5 py-2 text-sm text-ink" />
      </label>
      <Button type="submit" disabled={pending}>{pending ? "Sending…" : "Request access"}</Button>
      {state.status === "error" ? <ActionResult state={state} /> : null}
    </form>
  );
}
