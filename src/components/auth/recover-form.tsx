"use client";

import { useActionState } from "react";
import { recoverAccountAction } from "@/app/_actions/auth";
import { Button } from "@/components/ui/button";
import { ActionResult } from "@/components/ui/form";
import { idleState } from "@/lib/action-state";

const input = "h-11 border-0 border-b border-white/25 bg-transparent px-0.5 text-base text-[#E5E8EE] outline-none placeholder:text-[#737C90] focus:border-[rgba(155,135,255,.8)]";
const label = "flex flex-col gap-1.5 text-xs text-[#A3ABBD]";

/** Applicant ID + CNIC prove who it is; the account moves to an email the person can reach. */
export function RecoverForm({ paywall }: { paywall: boolean }) {
  const [state, action, pending] = useActionState(recoverAccountAction, idleState);
  if (state.status === "success") return <ActionResult state={state} />;
  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>Applicant ID
          <input name="applicantId" required maxLength={32} inputMode="numeric" autoComplete="off" className={input} />
        </label>
        <label className={label}>CNIC
          <input name="cnic" required maxLength={15} inputMode="numeric" autoComplete="off" placeholder="35202-1234567-1" className={input} />
        </label>
      </div>
      <label className={label}>New email you can reach
        <input name="email" type="email" required autoComplete="email" inputMode="email" placeholder="you@example.com" className={input} />
      </label>
      {paywall ? (
        <label className={label}>Transaction ID you paid with <span className="text-[#737C90]">(needed to move paid access; skip for a voucher)</span>
          <input name="reference" maxLength={40} autoComplete="off" className={input} />
        </label>
      ) : null}
      <p className="text-xs text-[#737C90]">Your CNIC is checked against a one-way fingerprint from PHF&apos;s file and never kept. Your old email gets a note that the account moved.</p>
      <div><Button type="submit" disabled={pending}>{pending ? "Checking…" : "Move my account"}</Button></div>
      <ActionResult state={state} />
    </form>
  );
}
