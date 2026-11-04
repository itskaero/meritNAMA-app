"use client";

import { useActionState, useState } from "react";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { ActionResult, Field, fieldClass } from "@/components/ui/form";
import { idleState } from "@/lib/action-state";
import { createThreadAction, displayNameAction, helpfulAction, replyAction, reportAction } from "./actions";

const PRIVACY = "Everyone signed in can read this. Do not share CNIC, phone numbers or email addresses; posts containing them are refused.";

export function NewThreadForm({ topics, defaultTopic }: { topics: { value: string; label: string }[]; defaultTopic: string }) {
  const [state, action, pending] = useActionState(createThreadAction, idleState);
  const [v, setV] = useState({ topic: defaultTopic, title: "", body: "" });
  return (
    <form action={action} className="grid gap-4">
      <Field label="Topic">
        {(id) => (
          <select id={id} name="topic" value={v.topic} onChange={(e) => setV({ ...v, topic: e.target.value })} className={fieldClass}>
            {topics.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        )}
      </Field>
      <Field label="Title" hint={`${v.title.trim().length}/140 · a question or a clear summary works best`}>
        {(id) => <input id={id} name="title" required minLength={8} maxLength={140} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} className={fieldClass} placeholder="e.g. Will anaesthesia close lower in round 7?" />}
      </Field>
      <Field label="Message" hint={PRIVACY}>
        {(id) => <textarea id={id} name="body" required minLength={10} maxLength={5000} rows={7} value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} className={cn(fieldClass, "leading-relaxed")} />}
      </Field>
      <div><Button type="submit" disabled={pending}>{pending ? "Posting…" : "Start discussion"}</Button></div>
      <ActionResult state={state} />
    </form>
  );
}

export function ReplyForm({ threadId }: { threadId: string }) {
  const [body, setBody] = useState("");
  const [state, action, pending] = useActionState(async (prev: typeof idleState, form: FormData) => {
    const r = await replyAction(prev, form);
    if (r.status === "success") setBody("");
    return r;
  }, idleState);
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="threadId" value={threadId} />
      <Field label="Your reply" hint={PRIVACY}>
        {(id) => <textarea id={id} name="body" required minLength={2} maxLength={5000} rows={4} value={body} onChange={(e) => setBody(e.target.value)} className={cn(fieldClass, "leading-relaxed")} />}
      </Field>
      <div><Button type="submit" disabled={pending || body.trim().length < 2}>{pending ? "Posting…" : "Post reply"}</Button></div>
      <ActionResult state={state} />
    </form>
  );
}

/** "Helpful" toggle. Works without JavaScript (plain form post). */
export function HelpfulButton({ kind, id, threadId, count, voted, disabled }: { kind: "thread" | "post"; id: string; threadId: string; count: number; voted: boolean; disabled?: boolean }) {
  return (
    <form action={helpfulAction}>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="threadId" value={threadId} />
      <button
        type="submit"
        disabled={disabled}
        aria-pressed={voted}
        title={disabled ? "You cannot mark your own post" : voted ? "Remove helpful" : "Mark as helpful"}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors disabled:cursor-default disabled:opacity-60",
          voted ? "border-ember/50 bg-ember/15 text-ember-hot" : "border-line-strong text-muted hover:border-ember/50 hover:text-ink",
        )}
      >
        <Icon name="heart" className="h-3.5 w-3.5" />
        <span>Helpful</span>
        <span className="font-mono tabular-nums">{count}</span>
      </button>
    </form>
  );
}

export function ReportButton({ kind, id }: { kind: "thread" | "post"; id: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [state, action, pending] = useActionState(reportAction, idleState);
  if (state.status === "success") return <span role="status" className="text-xs text-success">{state.message}</span>;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex h-8 items-center gap-1.5 rounded-full px-2 text-xs text-subtle hover:text-ink">
        <Icon name="flag" className="h-3.5 w-3.5" />Report
      </button>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <label className="sr-only" htmlFor={`rep-${id}`}>Why are you reporting this?</label>
      <input id={`rep-${id}`} name="reason" required minLength={4} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What is wrong with it?" className={cn(fieldClass, "h-8 w-56 py-1 text-xs")} />
      <Button type="submit" size="sm" variant="secondary" disabled={pending || reason.trim().length < 4}>Send report</Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      {state.status === "error" ? <span role="alert" className="text-xs text-danger">{state.message}</span> : null}
    </form>
  );
}

export function DisplayNameForm({ current }: { current: string }) {
  const [state, action, pending] = useActionState(displayNameAction, idleState);
  const [name, setName] = useState(current);
  return (
    <form action={action} className="grid gap-3">
      <Field label="Display name" hint="Shown on your posts. Your email is never shown.">
        {(id) => <input id={id} name="displayName" required minLength={3} maxLength={32} value={name} onChange={(e) => setName(e.target.value)} className={fieldClass} />}
      </Field>
      <div><Button type="submit" size="sm" variant="secondary" disabled={pending || name.trim() === current}>Save name</Button></div>
      <ActionResult state={state} />
    </form>
  );
}
