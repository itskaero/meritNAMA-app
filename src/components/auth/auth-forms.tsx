"use client";

import { useActionState, useState } from "react";
import { requestLinkAction, verifyLinkAction } from "@/app/_actions/auth";
import { Button } from "@/components/ui/button";
import { ActionResult } from "@/components/ui/form";
import { idleState } from "@/lib/action-state";

const inputClass = "h-11 w-full rounded-[10px] border border-line bg-elevated px-3.5 text-sm text-ink placeholder:text-subtle";

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/** Google (when set up) or a one-time email link; after sending, a "check your inbox" panel. */
export function SignInForm({ google }: { google: boolean }) {
  const [state, action, pending] = useActionState(requestLinkAction, idleState);
  const [email, setEmail] = useState("");
  const [again, setAgain] = useState(false);

  if (state.status === "success" && !again) {
    return (
      <div className="grid justify-items-center gap-4 text-center" role="status">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-signal/15 text-signal">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M3 6h18v12H3z" /><path d="m3 7 9 6 9-6" /></svg>
        </span>
        <h2 className="text-xl font-semibold">Check your inbox</h2>
        <p className="text-sm text-muted">If <strong className="text-ink">{email}</strong> can sign in, a link is on its way. Open it on this device and press Continue. It works once, for 15 minutes.</p>
        <Button type="button" variant="secondary" onClick={() => setAgain(true)}>Use a different email</Button>
      </div>
    );
  }
  return (
    <div className="grid gap-4">
      {google ? (
        <>
          <a href="/auth/google/start" className="inline-flex h-11 items-center justify-center gap-2.5 rounded-[10px] border border-line-strong text-sm font-semibold text-ink transition-colors hover:bg-elevated">
            <GoogleMark />Continue with Google
          </a>
          <p className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-xs text-subtle before:border-t before:border-line after:border-t after:border-line">or</p>
        </>
      ) : null}
      <form action={(f) => { setAgain(false); return action(f); }} className="grid gap-4">
        <label className="grid gap-1.5 text-sm font-medium">
          Email
          <input name="email" type="email" required autoComplete="email" inputMode="email" placeholder="e.g. ayesha.khan@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </label>
        <button type="submit" disabled={pending} className="h-11 rounded-lg bg-signal text-sm font-semibold text-signal-ink transition-colors hover:bg-signal-strong disabled:opacity-60">
          {pending ? "Sending…" : "Email me a sign-in link"}
        </button>
        {state.status === "error" ? <ActionResult state={state} /> : null}
      </form>
    </div>
  );
}

/**
 * The link opens this page and the person presses Continue: mail scanners that
 * open links (GET) never use up the token, only this POST does.
 */
export function VerifyForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(verifyLinkAction, idleState);
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="token" value={token} />
      <Button type="submit" disabled={pending} autoFocus>{pending ? "Signing in…" : "Continue to meritNAMA"}</Button>
      <ActionResult state={state} />
      {state.status === "error" ? <a href="/sign-in" className="text-sm font-semibold text-signal hover:underline">Ask for a new link →</a> : null}
    </form>
  );
}
