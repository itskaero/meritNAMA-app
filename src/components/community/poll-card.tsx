"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { voteAction } from "@/app/portal/community/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { idleState } from "@/lib/action-state";

type Poll = {
  question: string;
  closesAt: Date | null;
  closed: boolean;
  showResults: boolean;
  total: number;
  myOptionId: number | null;
  options: { id: number; label: string; votes: number | null; pct: number | null }[];
};

const daysLeft = (d: Date) => Math.max(1, Math.ceil((d.getTime() - Date.now()) / 86_400_000));

/** A question's poll: vote (or change it) while open; results after voting or once closed. */
export function PollCard({ threadId, poll, mayVote }: { threadId: string; poll: Poll; mayVote: boolean }) {
  const [state, action, pending] = useActionState(voteAction, idleState);
  const [choice, setChoice] = useState<number | null>(poll.myOptionId);
  const [changing, setChanging] = useState(false);
  const voting = mayVote && !poll.closed && (!poll.showResults || changing || poll.myOptionId === null);
  const top = Math.max(...poll.options.map((o) => o.votes ?? 0));

  return (
    <section aria-label="Poll" className="grid gap-3 rounded-2xl border border-signal/30 bg-signal/[0.04] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">{poll.question}</h2>
        <span className="text-xs text-subtle">
          {poll.total} {poll.total === 1 ? "vote" : "votes"} · {poll.closed ? "Closed" : poll.closesAt ? `Closes in ${daysLeft(new Date(poll.closesAt))} days` : "Open"}
        </span>
      </div>
      {voting ? (
        <form action={action} className="grid gap-2">
          <input type="hidden" name="threadId" value={threadId} />
          {poll.options.map((o) => (
            <label key={o.id} className={cn("flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm", choice === o.id ? "border-signal bg-signal/10" : "border-line hover:border-line-strong")}>
              <input type="radio" name="optionId" value={o.id} checked={choice === o.id} onChange={() => setChoice(o.id)} className="accent-[var(--mn-cyan)]" />
              {o.label}
            </label>
          ))}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="sm" disabled={pending || choice === null}>{poll.myOptionId ? "Change vote" : "Vote"}</Button>
            {changing ? <button type="button" onClick={() => setChanging(false)} className="text-xs text-muted hover:text-ink">Cancel</button> : null}
            {state.status === "error" ? <span role="alert" className="text-xs text-danger">{state.message}</span> : null}
          </div>
        </form>
      ) : poll.showResults ? (
        <ul className="grid gap-2">
          {poll.options.map((o) => (
            <li key={o.id} className="relative overflow-hidden rounded-xl border border-line px-3 py-2.5 text-sm">
              <span aria-hidden className={cn("absolute inset-y-0 left-0 transition-[width] duration-500", o.votes === top && top > 0 ? "bg-signal/25" : "bg-elevated")} style={{ width: `${o.pct ?? 0}%` }} />
              <span className="relative flex items-center justify-between gap-3">
                <span>{o.label}{poll.myOptionId === o.id ? <span className="ml-2 text-xs font-semibold text-signal">Your vote</span> : null}</span>
                <span className="font-mono tabular-nums">{o.pct}% <span className="text-xs text-subtle">({o.votes})</span></span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="grid gap-2">
          {poll.options.map((o) => <li key={o.id} className="rounded-xl border border-line px-3 py-2.5 text-sm text-muted">{o.label}</li>)}
        </ul>
      )}
      {!mayVote && !poll.closed ? (
        <p className="text-xs text-muted">Results show after voting. <Link href="/portal/profile" className="font-semibold text-signal hover:underline">Verify your account to vote →</Link></p>
      ) : poll.showResults && poll.myOptionId && !poll.closed && !changing && mayVote ? (
        <button type="button" onClick={() => setChanging(true)} className="justify-self-start text-xs font-semibold text-signal hover:underline">Change my vote</button>
      ) : null}
    </section>
  );
}
