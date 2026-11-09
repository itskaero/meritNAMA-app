"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { ActionResult, Field, fieldClass, ReasonField } from "@/components/ui/form";
import { idleState } from "@/lib/action-state";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES, type Role } from "@/lib/auth/roles";
import { FEATURES, RETENTION, type Feature, type FeatureFlags, type Retention, type RetentionKey } from "@/lib/domain/settings";
import { applyRetentionAction, sendTestEmailAction, setFeaturesAction, setRetentionAction, setRoleAction } from "./actions";

/** Give someone a role by email (works before their first sign-in). */
export function AddMemberForm() {
  const [state, action, pending] = useActionState(setRoleAction, idleState);
  const [v, setV] = useState<{ email: string; role: Role }>({ email: "", role: "data_editor" });
  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email">
          {(id) => <input id={id} name="email" type="email" required value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} className={fieldClass} placeholder="name@example.com" />}
        </Field>
        <Field label="Role" hint={ROLE_DESCRIPTIONS[v.role]}>
          {(id) => (
            <select id={id} name="role" value={v.role} onChange={(e) => setV({ ...v, role: e.target.value as Role })} className={fieldClass}>
              {ROLES.filter((r) => r !== "candidate").map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          )}
        </Field>
      </div>
      <ReasonField placeholder="e.g. Joins the data team for induction 22" />
      <div><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Give role"}</Button></div>
      <ActionResult state={state} />
    </form>
  );
}

/** Change or remove one member's role inline. */
export function RoleRow({ email, role, isMe }: { email: string; role: Role; isMe: boolean }) {
  const [state, action, pending] = useActionState(setRoleAction, idleState);
  const [next, setNext] = useState<Role>(role);
  const [reason, setReason] = useState("");
  return (
    <form action={action} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_12rem_minmax(0,1fr)_auto] sm:items-center">
      <input type="hidden" name="email" value={email} />
      <p className="min-w-0 truncate text-sm font-medium">{email}{isMe ? <span className="text-subtle"> (you)</span> : null}</p>
      <label className="sr-only" htmlFor={`role-${email}`}>Role for {email}</label>
      <select id={`role-${email}`} name="role" value={next} onChange={(e) => setNext(e.target.value as Role)} className={cn(fieldClass, "h-9 py-1")}>
        {ROLES.map((r) => <option key={r} value={r}>{r === "candidate" ? "No team role (candidate)" : ROLE_LABELS[r]}</option>)}
      </select>
      <label className="sr-only" htmlFor={`reason-${email}`}>Reason</label>
      <input id={`reason-${email}`} name="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" className={cn(fieldClass, "h-9 py-1")} />
      <Button type="submit" size="sm" variant="secondary" disabled={pending || next === role || !reason.trim()}>Save</Button>
      {state.status !== "idle" ? <p role={state.status === "error" ? "alert" : "status"} className={cn("text-xs sm:col-span-4", state.status === "error" ? "text-danger" : "text-success")}>{state.message}</p> : null}
    </form>
  );
}

/** Switch candidate features on or off. */
export function FeaturesForm({ flags }: { flags: FeatureFlags }) {
  const [res, action, pending] = useActionState(setFeaturesAction, idleState);
  const [on, setOn] = useState(flags);
  const changed = (Object.keys(flags) as Feature[]).some((k) => flags[k] !== on[k]);
  return (
    <form action={action} className="grid gap-3">
      <ul className="grid gap-2">
        {(Object.keys(FEATURES) as Feature[]).map((k) => (
          <li key={k}>
            <label className="flex items-start gap-3 rounded-xl bg-canvas p-3 text-sm">
              <input type="checkbox" name={`f_${k}`} value="1" checked={on[k]} onChange={(e) => setOn({ ...on, [k]: e.target.checked })} className="mt-0.5 h-4 w-4 accent-[var(--color-signal)]" />
              <span className="grid gap-0.5">
                <span className="font-medium">{FEATURES[k].label} <span className={on[k] ? "text-success" : "text-amber"}>· {on[k] ? "on" : "off"}</span></span>
                <span className="text-xs text-muted">{FEATURES[k].description}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <ReasonField placeholder="e.g. Pause the community during result week" />
      <div><Button type="submit" disabled={pending || !changed}>Save switches</Button></div>
      <ActionResult state={res} />
    </form>
  );
}

/** How long short-lived data is kept. */
export function RetentionForm({ days }: { days: Retention }) {
  const [res, action, pending] = useActionState(setRetentionAction, idleState);
  const [v, setV] = useState<Record<RetentionKey, string>>(Object.fromEntries(Object.entries(days).map(([k, n]) => [k, String(n)])) as Record<RetentionKey, string>);
  return (
    <form action={action} className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {(Object.keys(RETENTION) as RetentionKey[]).map((k) => (
          <Field key={k} label={RETENTION[k].label} hint={`${RETENTION[k].min}–${RETENTION[k].max} days · default ${RETENTION[k].default}`}>
            {(id) => <input id={id} name={`r_${k}`} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} inputMode="numeric" className={cn(fieldClass, "max-w-32")} />}
          </Field>
        ))}
      </div>
      <ReasonField placeholder="e.g. Keep proof documents for one induction cycle" />
      <div><Button type="submit" disabled={pending}>Save periods</Button></div>
      <ActionResult state={res} />
    </form>
  );
}

/** Remove what is past its retention period, now. */
export function ApplyRetentionForm({ pending: due }: { pending: number }) {
  const [res, action, pending] = useActionState(applyRetentionAction, idleState);
  return (
    <form action={action} className="grid gap-3">
      <ReasonField placeholder="e.g. Clean-up before the NAS backup" />
      <div><Button type="submit" variant="secondary" disabled={pending || !due}>Remove {due.toLocaleString("en-US")} item{due === 1 ? "" : "s"} now</Button></div>
      <ActionResult state={res} />
    </form>
  );
}

/** Sends a test email to the signed-in owner, to check SMTP_URL. */
export function TestEmailForm() {
  const [state, action, pending] = useActionState(sendTestEmailAction, idleState);
  return (
    <form action={action} className="grid gap-3">
      <div><Button type="submit" variant="secondary" disabled={pending}>{pending ? "Sending…" : "Send me a test email"}</Button></div>
      <ActionResult state={state} />
    </form>
  );
}
