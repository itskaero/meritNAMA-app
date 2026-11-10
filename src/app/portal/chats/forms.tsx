"use client";

import { useState, useTransition } from "react";
import { createGroupAction, dmOpenAction, joinAction, leaveAction } from "./actions";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/ui/styles";

export function NewGroupForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      action={(fd) => start(async () => { setError(null); const r = await createGroupAction(null, fd); if (r && !r.ok) setError(r.message); })}
      className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"
    >
      <label className="sr-only" htmlFor="group-name">Group name</label>
      <input id="group-name" name="name" required minLength={3} maxLength={60} placeholder="e.g. FCPS Medicine, induction 21" className={fieldClass} />
      <Button type="submit" disabled={pending}>{pending ? "Creating" : "Start a group"}</Button>
      {error ? <p role="alert" className="text-sm text-danger sm:col-span-2">{error}</p> : null}
    </form>
  );
}

export function JoinButton({ roomId }: { roomId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="inline-grid gap-1">
      <Button type="button" disabled={pending} onClick={() => start(async () => { const r = await joinAction(roomId); if (!r.ok) setError(r.message); })}>{pending ? "Joining" : "Join this chat"}</Button>
      {error ? <span role="alert" className="text-sm text-danger">{error}</span> : null}
    </span>
  );
}

export function LeaveButton({ roomId }: { roomId: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => start(async () => { await leaveAction(roomId); })} className="text-xs text-muted hover:text-danger">
      Leave chat
    </button>
  );
}

export function DmToggle({ open }: { open: boolean }) {
  const [on, setOn] = useState(open);
  const [pending, start] = useTransition();
  return (
    <label className="flex items-start gap-3 text-sm">
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 accent-[var(--mn-cyan)]"
        checked={on}
        disabled={pending}
        onChange={(e) => { const v = e.target.checked; setOn(v); start(async () => { const r = await dmOpenAction(v); if (!r.ok) setOn(!v); }); }}
      />
      <span>
        <span className="font-medium text-heading">Let other members message me</span>
        <span className="block text-xs text-muted">Turn off to stop new one-to-one chats. Chats you already have continue, and the team can always reach you.</span>
      </span>
    </label>
  );
}
