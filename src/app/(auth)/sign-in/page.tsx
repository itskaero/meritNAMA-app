import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignInForm } from "@/components/auth/auth-forms";
import { Notice } from "@/components/ui/notice";
import { googleConfig } from "@/lib/auth/google";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  google: "Google sign-in did not complete. Try again, or use an email link.",
  "google-cancelled": "Google sign-in was cancelled.",
  "google-expired": "That Google sign-in took too long. Try again.",
  "google-unverified": "Google has not verified that email address. Use an email link instead.",
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ signedOut?: string; error?: string }> }) {
  const session = await getSession();
  if (session && !session.isStub) redirect(session.role === "candidate" ? "/portal" : "/admin");
  const { signedOut, error } = await searchParams;
  const isDev = process.env.NODE_ENV !== "production";
  return (
    <AuthShell step={1}>
      <div className="grid gap-2 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">Sign in to meritNAMA</h2>
        <p className="text-sm text-muted">Use the email from your PHF application and your merit record links itself.</p>
      </div>
      {signedOut ? <Notice title="You are signed out." /> : null}
      {error && ERRORS[error] ? <Notice tone="warning" title={ERRORS[error]} /> : null}
      <SignInForm google={Boolean(googleConfig())} />
      <p className="text-center text-xs text-subtle">No password. meritNAMA is independent and not an official admissions authority.</p>
      {isDev ? (
        <p className="text-center text-xs text-muted">
          Development: links are not emailed without SMTP_URL; open <Link href="/dev/mailbox" className="font-semibold text-signal hover:underline">the dev mailbox</Link>.
        </p>
      ) : null}
    </AuthShell>
  );
}
