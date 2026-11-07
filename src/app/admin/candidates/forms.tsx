"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { ActionResult, Field, ReasonField, fieldClass } from "@/components/ui/form";
import { idleState } from "@/lib/action-state";
import { CORRECTIONS_CSV_HEADER } from "@/lib/domain/corrections";
import { importCorrectionsAction, proposeCorrectionAction, revokeCorrectionAction, reviewLinkAction } from "./actions";

/** Approve or reject one link request; the reason is audited and shown to the candidate on rejection. */
export function ReviewControls({ id }: { id: string }) {
  const [res, action, pending] = useActionState(reviewLinkAction, idleState);
  const [reason, setReason] = useState("");
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <label className="sr-only" htmlFor={`rv-${id}`}>Reason</label>
      <input id={`rv-${id}`} name="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (audited)" className={cn(fieldClass, "h-9 min-w-0 flex-1 py-0 sm:w-64 sm:flex-none")} />
      <Button type="submit" name="decision" value="approve" size="sm" disabled={pending || !reason.trim()}>Approve</Button>
      <Button type="submit" name="decision" value="reject" size="sm" variant="secondary" disabled={pending || !reason.trim()}>Reject</Button>
      {res.status === "error" ? <span role="alert" className="w-full text-xs text-danger">{res.message}</span> : null}
    </form>
  );
}

/** Propose one correction to an applicant's simulation inputs. Staged; someone publishes it from Changes. */
export function CorrectionForm({ induction, applicantId, programs }: { induction: number; applicantId: string; programs: string[] }) {
  const [res, action, pending] = useActionState(proposeCorrectionAction, idleState);
  const [field, setField] = useState("base_marks");
  const [program, setProgram] = useState(programs[0] ?? "");
  const [value, setValue] = useState("");
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="induction" value={induction} />
      <input type="hidden" name="applicantId" value={applicantId} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="What">
          {(id) => (
            <select id={id} name="field" value={field} onChange={(e) => setField(e.target.value)} className={fieldClass}>
              <option value="base_marks">Base marks</option>
              {programs.length ? <option value="program_marks">Programme marks</option> : null}
              <option value="profile_status">Profile status</option>
            </select>
          )}
        </Field>
        {field === "program_marks" ? (
          <Field label="Programme">
            {(id) => (
              <select id={id} name="program" value={program} onChange={(e) => setProgram(e.target.value)} className={fieldClass}>
                {programs.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            )}
          </Field>
        ) : null}
        <Field label="New value">
          {(id) =>
            field === "profile_status" ? (
              <select id={id} name="value" value={value} onChange={(e) => setValue(e.target.value)} className={fieldClass} required>
                <option value="">— Choose —</option>
                <option value="1">Accepted</option>
                <option value="2">Rejected</option>
                <option value="11">Pending</option>
              </select>
            ) : (
              <input id={id} name="value" value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" required className={fieldClass} placeholder="e.g. 61.25" />
            )
          }
        </Field>
      </div>
      <ReasonField placeholder="e.g. Grievance 4417 upheld: house-job marks were missing" />
      <div><Button type="submit" disabled={pending}>Stage the correction</Button></div>
      <ActionResult state={res} />
    </form>
  );
}

/** Upload a corrections CSV for one induction. */
export function CorrectionsImportForm({ inductions }: { inductions: number[] }) {
  const [res, action, pending] = useActionState(importCorrectionsAction, idleState);
  const [induction, setInduction] = useState(String(inductions[0] ?? ""));
  return (
    <form action={action} className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
        <Field label="Induction">
          {(id) => (
            <select id={id} name="induction" value={induction} onChange={(e) => setInduction(e.target.value)} className={fieldClass}>
              {inductions.map((i) => <option key={i} value={i}>Induction {i}</option>)}
            </select>
          )}
        </Field>
        <Field label="Corrections file (CSV)" hint={<>Header <code className="font-mono">{CORRECTIONS_CSV_HEADER}</code>. Field is base_marks, program_marks (with a programme) or profile_status (1, 2 or 11).</>}>
          {(id) => <input id={id} name="file" type="file" accept=".csv,text/csv" required className={cn(fieldClass, "file:mr-3 file:rounded-full file:border-0 file:bg-elevated file:px-3 file:py-1 file:text-ink")} />}
        </Field>
      </div>
      <ReasonField placeholder="e.g. Grievance committee decisions, 3 Nov" />
      <div><Button type="submit" disabled={pending || !inductions.length}>Check and stage</Button></div>
      <ActionResult state={res} fileReset />
    </form>
  );
}

/** Withdraw a correction, with a reason. */
export function RevokeCorrection({ id }: { id: string }) {
  const [res, action, pending] = useActionState(revokeCorrectionAction, idleState);
  const [reason, setReason] = useState("");
  if (res.status === "success") return <span role="status" className="text-xs text-success">{res.message}</span>;
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <label className="sr-only" htmlFor={`rc-${id}`}>Reason for withdrawing</label>
      <input id={`rc-${id}`} name="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (audited)" className={cn(fieldClass, "h-8 min-w-0 flex-1 py-0 text-xs sm:w-52 sm:flex-none")} />
      <Button type="submit" size="sm" variant="secondary" disabled={pending || !reason.trim()}>Withdraw</Button>
      {res.status === "error" ? <span role="alert" className="w-full text-xs text-danger">{res.message}</span> : null}
    </form>
  );
}
