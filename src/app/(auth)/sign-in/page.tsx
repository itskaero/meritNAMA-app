import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignInForm } from "@/components/auth/auth-forms";
import { RequestAccessForm } from "@/components/auth/request-access-form";
import { Notice } from "@/components/ui/notice";
import { googleConfig } from "@/lib/auth/google";
import { getSession } from "@/lib/auth/session";
import { loadAccessSettings } from "@/lib/data/access";
import { getDb } from "@/lib/db/client";
import { DEFAULT_ACCESS } from "@/lib/domain/access";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  google: "Google sign-in did not complete. Try again, or use an email link.",
  "google-cancelled": "Google sign-in was cancelled.",
  "google-expired": "That Google sign-in took too long. Try again.",
  "google-unverified": "Google has not verified that email address. Use an email link instead.",
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ signedOut?: string; deleted?: string; error?: string }> }) {
  const session = await getSession();
  if (session && !session.isStub) redirect(session.role === "candidate" ? "/portal" : "/admin");
  const { signedOut, deleted, error } = await searchParams;
  // While the paywall is on, a new person asks for access; approved people still sign in by link.
  const access = await loadAccessSettings(getDb()).catch(() => DEFAULT_ACCESS);
  const isDev = process.env.NODE_ENV !== "production";
  return (
    <AuthShell step={1}>
      <div className="grid gap-2 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">{access.paywall ? "Request access to meritNAMA" : "Sign in to meritNAMA"}</h2>
        <p className="text-sm text-muted">{access.paywall ? "Access is by approval. Pay, tell us the reference, and we will email you once it is checked." : "Use the email from your PHF application and your merit record links itself."}</p>
      </div>
      {signedOut ? <Notice title="You are signed out." /> : null}
      {deleted ? <Notice title="Your account was deleted." /> : null}
      {error && ERRORS[error] ? <Notice tone="warning" title={ERRORS[error]} /> : null}
      {access.paywall ? (
        <>
          <RequestAccessForm s={access} />
          <details className="rounded-xl border border-line p-4" open={Boolean(signedOut || error)}>
            <summary className="cursor-pointer text-sm font-semibold text-heading">Already approved? Sign in</summary>
            <div className="mt-4"><SignInForm google={Boolean(googleConfig())} /></div>
          </details>
        </>
      ) : (
        <SignInForm google={Boolean(googleConfig())} />
      )}
      <p className="text-center text-xs text-subtle">No password. meritNAMA is independent and not an official admissions authority. <Link href="/privacy" className="hover:underline">Privacy</Link> · <Link href="/terms" className="hover:underline">Terms</Link> · <Link href="/contact" className="hover:underline">Contact</Link></p>
      {isDev ? (
        <p className="text-center text-xs text-muted">
          Development: links are not emailed without SMTP_URL; open <Link href="/dev/mailbox" className="font-semibold text-signal hover:underline">the dev mailbox</Link>.
        </p>
      ) : null}
    </AuthShell>
  );
}
