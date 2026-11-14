"use client";

import { useActionState, useState } from "react";
import { accessStatusAction, requestAccessAction } from "@/app/_actions/auth";
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

function PayLine({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex flex-wrap items-center gap-2">
      <span className="w-24 text-xs text-subtle">{label}</span>
      <code className="font-mono text-ink">{value}</code>
      <Copy value={value} />
    </p>
  );
}

export type RequestAccessSettings = Pick<AccessSettings, "paymentRequired" | "priceMinPkr" | "priceMaxPkr" | "bankName" | "accountNumber" | "accountTitle" | "raastId" | "easypaisaNumber" | "jazzcashNumber" | "walletTitle" | "note" | "requestsOpen" | "closedMessage" | "refundNote">;

/**
 * Shown while the paywall is on: 1 pay, 2 tell us (email + transaction ID, or a voucher
 * code), 3 the answer. A transaction ID already in an imported statement lets the person in
 * at once; otherwise a person checks it and the person is emailed.
 */
export function RequestAccessForm({ s }: { s: RequestAccessSettings }) {
  const [state, action, pending] = useActionState(requestAccessAction, idleState);
  const [voucher, setVoucher] = useState(false);

  if (!s.requestsOpen) return <p className="rounded-xl border border-line p-4 text-sm text-muted">{s.closedMessage}</p>;
  if (state.status === "success") {
    const inNow = state.message?.startsWith("You are in");
    return (
      <div role="status" className={inNow ? "grid gap-2 rounded-xl border border-success/40 bg-success/10 p-4 text-sm" : "grid gap-2 rounded-xl border border-amber/40 bg-amber/10 p-4 text-sm"}>
        <p className={inNow ? "font-semibold text-success" : "font-semibold text-amber"}>{inNow ? "Approved" : "Request received"}</p>
        <p className="text-muted">{state.message}</p>
      </div>
    );
  }
  const wallets = [s.easypaisaNumber && { label: "Easypaisa", value: s.easypaisaNumber }, s.jazzcashNumber && { label: "JazzCash", value: s.jazzcashNumber }].filter(Boolean) as { label: string; value: string }[];
  return (
    <form action={action} className="grid gap-4">
      {s.paymentRequired && !voucher ? (
        <div className="grid gap-2 rounded-xl border border-line bg-elevated p-4 text-sm">
          <p className="font-semibold text-heading"><span className="mr-2 text-xs text-subtle">1</span>Pay {priceText(s)}</p>
          <p className="text-muted">{s.note}</p>
          {wallets.map((w) => <PayLine key={w.label} label={w.label} value={w.value} />)}
          {wallets.length && s.walletTitle ? <p className="text-xs text-subtle">Account title: {s.walletTitle}</p> : null}
          {s.accountNumber ? <PayLine label={s.bankName || "Bank"} value={s.accountNumber} /> : null}
          {s.raastId ? <PayLine label="Raast ID" value={s.raastId} /> : null}
          {s.accountNumber && s.accountTitle ? <p className="text-xs text-subtle">Bank account title: {s.accountTitle}</p> : null}
          <p className="text-xs text-subtle">After paying, the app shows a <span className="font-semibold text-muted">TID</span> (transaction ID) and sends it by SMS. You need it below.</p>
        </div>
      ) : s.note && !voucher ? <p className="text-sm text-muted">{s.note}</p> : null}

      <p className="text-sm font-semibold text-heading"><span className="mr-2 text-xs text-subtle">2</span>Tell us</p>
      <label className="grid gap-1.5 text-sm font-medium">Email
        <input name="email" type="email" required autoComplete="email" inputMode="email" placeholder="the email you will sign in with" className={inputClass} />
      </label>
      {voucher ? (
        <label className="grid gap-1.5 text-sm font-medium">Access code
          <input name="voucher" required maxLength={40} placeholder="MN-XXXX-XXXX" autoCapitalize="characters" className={inputClass} />
        </label>
      ) : (
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
          <label className="grid gap-1.5 text-sm font-medium">Transaction ID (TID)
            <input name="reference" required={s.paymentRequired} maxLength={120} placeholder="e.g. 41823975512" className={inputClass} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">Paid with
            <select name="channel" defaultValue={s.easypaisaNumber ? "easypaisa" : s.jazzcashNumber ? "jazzcash" : "bank"} className={inputClass}>
              <option value="easypaisa">Easypaisa</option>
              <option value="jazzcash">JazzCash</option>
              <option value="bank">Bank / Raast</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">Amount sent (PKR) <span className="font-normal text-subtle">(optional)</span>
            <input name="amount" inputMode="numeric" placeholder={String(s.priceMinPkr)} className={inputClass} />
          </label>
        </div>
      )}
      <button type="button" onClick={() => setVoucher(!voucher)} className="w-fit text-sm font-semibold text-signal hover:underline">
        {voucher ? "Pay instead" : "Have an access code?"}
      </button>
      <label className="grid gap-1.5 text-sm font-medium">Applicant ID <span className="font-normal text-subtle">(optional, links your merit record)</span>
        <input name="applicantId" inputMode="numeric" pattern="\d*" maxLength={20} className={inputClass} />
      </label>
      <label className="grid gap-1.5 text-sm font-medium">Message <span className="font-normal text-subtle">(optional)</span>
        <textarea name="message" rows={2} maxLength={500} className="w-full rounded-[10px] border border-line bg-elevated px-3.5 py-2 text-sm text-ink" />
      </label>
      <p className="text-xs text-subtle">Access lasts for this induction. {s.refundNote} See the <a href="/terms" className="text-signal hover:underline">terms</a> and <a href="/privacy" className="text-signal hover:underline">privacy policy</a>.</p>
      <Button type="submit" disabled={pending}>{pending ? "Checking…" : voucher ? "Use the code" : "Request access"}</Button>
      {state.status === "error" ? <ActionResult state={state} /> : null}
    </form>
  );
}

/** Step 3: where my request stands. Needs the email and the transaction ID (or code) together. */
export function AccessStatusForm() {
  const [state, action, pending] = useActionState(accessStatusAction, idleState);
  return (
    <form action={action} className="grid gap-3">
      <label className="grid gap-1.5 text-sm font-medium">Email
        <input name="email" type="email" required autoComplete="email" className={inputClass} />
      </label>
      <label className="grid gap-1.5 text-sm font-medium">Transaction ID or access code
        <input name="reference" required maxLength={120} className={inputClass} />
      </label>
      <Button type="submit" variant="secondary" disabled={pending}>{pending ? "Looking…" : "Check status"}</Button>
      {state.status !== "idle" ? <ActionResult state={state} /> : null}
    </form>
  );
}
