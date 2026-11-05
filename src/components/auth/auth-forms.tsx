"use client";

import { useActionState, useState } from "react";
import { requestLinkAction, verifyLinkAction } from "@/app/_actions/auth";
import { Button } from "@/components/ui/button";
import { ActionResult, Field, fieldClass } from "@/components/ui/form";
import { idleState } from "@/lib/action-state";

/** Email field → "a link is on its way". */
export function SignInForm() {
  const [state, action, pending] = useActionState(requestLinkAction, idleState);
  const [email, setEmail] = useState("");
  return (
    <form action={action} className="grid gap-4">
      <Field label="Email address" hint="We email you a one-time link. No password.">
        {(id) => (
          <input id={id} name="email" type="email" required autoComplete="email" inputMode="email" className={fieldClass} placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        )}
      </Field>
      <Button type="submit" disabled={pending}>{pending ? "Sending…" : "Email me a sign-in link"}</Button>
      <ActionResult state={state} />
    </form>
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
