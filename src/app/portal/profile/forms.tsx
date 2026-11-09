"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { ActionResult, Field, fieldClass } from "@/components/ui/form";
import { cn } from "@/components/ui/cn";
import { idleState } from "@/lib/action-state";
import { requestLinkAction } from "./actions";

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
      <Field label="Proof" hint="A screenshot or PDF of your PHF portal page showing the applicant ID. PDF, JPG or PNG, up to 5 MB. Only verifiers can open it.">
        {(id) => (
          <input id={id} name="evidence" type="file" required accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
            className={cn(fieldClass, "file:mr-3 file:rounded-full file:border-0 file:bg-elevated file:px-3 file:py-1 file:text-ink")} />
        )}
      </Field>
      <div><Button type="submit" disabled={pending}>{pending ? "Sending…" : "Ask for verification"}</Button></div>
      <ActionResult state={state} fileReset />
    </form>
  );
}
