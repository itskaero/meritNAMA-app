"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { ActionResult, Field, fieldClass } from "@/components/ui/form";
import { cn } from "@/components/ui/cn";
import { idleState } from "@/lib/action-state";
import { linkByCnicAction, requestLinkAction } from "./actions";

/** Applicant ID + CNIC, checked against PHF's record: linked at once, nothing uploaded. */
export function CnicLinkForm() {
  const [state, action, pending] = useActionState(linkByCnicAction, idleState);
  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Applicant ID" hint="As printed on the PHF merit list or gazette.">
          {(id) => <input id={id} name="applicantId" required maxLength={32} inputMode="numeric" autoComplete="off" className={fieldClass} />}
        </Field>
        <Field label="CNIC" hint="The one on your PHF application. 13 digits, dashes optional.">
          {(id) => <input id={id} name="cnic" required maxLength={15} inputMode="numeric" autoComplete="off" placeholder="35202-1234567-1" className={fieldClass} />}
        </Field>
      </div>
      <p className="text-xs text-muted">We never keep your CNIC. It is compared with a one-way fingerprint taken from PHF&apos;s file, then thrown away.</p>
      <div><Button type="submit" disabled={pending}>{pending ? "Checking…" : "Link my record"}</Button></div>
      <ActionResult state={state} />
    </form>
  );
}

export function LinkRequestForm() {
  const [state, action, pending] = useActionState(requestLinkAction, idleState);
  const [applicantId, setApplicantId] = useState("");
  const [pmdcNo, setPmdcNo] = useState("");
  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Applicant ID" hint="As printed on the PHF merit list.">
          {(id) => <input id={id} name="applicantId" required maxLength={32} autoComplete="off" className={fieldClass} value={applicantId} onChange={(e) => setApplicantId(e.target.value)} />}
        </Field>
        <Field label="PMDC registration number" hint="Checked against the record; never shown or stored as text.">
          {(id) => <input id={id} name="pmdcNo" required maxLength={32} autoComplete="off" className={fieldClass} value={pmdcNo} onChange={(e) => setPmdcNo(e.target.value)} />}
        </Field>
      </div>
      <Field label="Document" hint="Anything that shows your applicant ID next to your name: crop out the rest. PDF, JPG or PNG, up to 5 MB. Only verifiers open it.">
        {(id) => (
          <input id={id} name="evidence" type="file" required accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
            className={cn(fieldClass, "file:mr-3 file:rounded-full file:border-0 file:bg-elevated file:px-3 file:py-1 file:text-ink")} />
        )}
      </Field>
      <div><Button type="submit" variant="secondary" disabled={pending}>{pending ? "Sending…" : "Send to a verifier"}</Button></div>
      <ActionResult state={state} fileReset />
    </form>
  );
}
