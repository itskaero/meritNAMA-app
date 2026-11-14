"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ActionResult, Field, fieldClass } from "@/components/ui/form";
import { selectClass } from "@/components/ui/styles";
import { idleState } from "@/lib/action-state";
import { postNoticeAction } from "./notices-actions";

export function PostNoticeForm() {
  const [state, action, pending] = useActionState(postNoticeAction, idleState);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field label="Notice" hint="One line. e.g. “PHF portal is down for maintenance tonight.”">{(id) => <input id={id} name="text" required maxLength={160} className={fieldClass} />}</Field>
      </div>
      <Field label="Link (optional)" hint="A page here (/portal/…) or https://…">{(id) => <input id={id} name="href" maxLength={300} className={fieldClass} />}</Field>
      <Field label="Show for">{(id) => (
        <select id={id} name="days" defaultValue="3" className={selectClass}>
          {[1, 2, 3, 7, 14, 30].map((d) => <option key={d} value={d}>{d} day{d === 1 ? "" : "s"}</option>)}
        </select>
      )}</Field>
      <Field label="Colour">{(id) => (
        <select id={id} name="tone" defaultValue="info" className={selectClass}>
          <option value="info">Information (cyan)</option>
          <option value="warning">Deadline or warning (amber)</option>
          <option value="highlight">Good news (violet)</option>
        </select>
      )}</Field>
      <Field label="Who sees it">{(id) => (
        <select id={id} name="audience" defaultValue="all" className={selectClass}>
          <option value="all">Everyone</option>
          <option value="members">Signed-in members only</option>
        </select>
      )}</Field>
      <div className="grid gap-2 sm:col-span-2">
        <div><Button type="submit" disabled={pending}>{pending ? "Posting…" : "Post to the bar"}</Button></div>
        <ActionResult state={state} />
      </div>
    </form>
  );
}
