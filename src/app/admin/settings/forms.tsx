"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { ActionResult, Field, fieldClass, ReasonField } from "@/components/ui/form";
import { idleState } from "@/lib/action-state";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES, type Role } from "@/lib/auth/roles";
import { setRoleAction } from "./actions";

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
