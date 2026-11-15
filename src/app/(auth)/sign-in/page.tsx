import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignInForm } from "@/components/auth/auth-forms";
import { RequestAccessForm } from "@/components/auth/request-access-form";
import { Notice } from "@/components/ui/notice";
import { googleConfig } from "@/lib/auth/google";
import { getSession } from "@/lib/auth/session";
import { currentSale, loadAccessSettings } from "@/lib/data/access";
import { getDb } from "@/lib/db/client";
import { DEFAULT_ACCESS } from "@/lib/domain/access";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  google: "Google sign-in did not complete. Try again, or use an email link.",
  "google-cancelled": "Google sign-in was cancelled.",
  "google-expired": "That Google sign-in took too long. Try again.",
  "google-unverified": "Google has not verified that email address. Use an email link instead.",
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ signedOut?: string; deleted?: string; error?: string; tab?: string }> }) {
  const session = await getSession();
  if (session && !session.isStub) redirect(session.role === "candidate" ? "/portal" : "/admin");
  const { signedOut, deleted, error, tab } = await searchParams;
  // While the paywall is on, a new person asks for access; approved people still sign in by link.
  const access = await loadAccessSettings(getDb()).catch(() => DEFAULT_ACCESS);
  const isDev = process.env.NODE_ENV !== "production";
  const asking = access.paywall && tab !== "signin" && !signedOut && !error;
  const sale = asking ? await currentSale(getDb(), access).catch(() => null) : null;
  const forWhat = sale?.induction
    ? `for induction ${sale.induction}${sale.end ? `, until ${sale.end.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Karachi" })}` : ""}`
    : "for one induction";
  return (
    <AuthShell step={1} showStatus>
      {access.paywall ? (
        <nav aria-label="Choose" className="flex gap-1 self-start rounded-xl bg-white/5 p-1 text-[13px]">
          <Link href="/sign-in?tab=signin" aria-current={!asking ? "page" : undefined} className={!asking ? "flex h-[34px] items-center rounded-[9px] px-4 font-semibold text-white [background:linear-gradient(90deg,rgba(255,255,255,.06),rgba(110,86,255,.45))] shadow-[inset_0_-2px_0_#7B61FF,0_0_18px_rgba(110,86,255,.3)]" : "flex h-[34px] items-center rounded-[9px] px-4 text-[#A3ABBD] hover:text-white"}>Sign in</Link>
          <Link href="/sign-in" aria-current={asking ? "page" : undefined} className={asking ? "flex h-[34px] items-center rounded-[9px] px-4 font-semibold text-white [background:linear-gradient(90deg,rgba(255,255,255,.06),rgba(110,86,255,.45))] shadow-[inset_0_-2px_0_#7B61FF,0_0_18px_rgba(110,86,255,.3)]" : "flex h-[34px] items-center rounded-[9px] px-4 text-[#A3ABBD] hover:text-white"}>Request access</Link>
        </nav>
      ) : null}
      <div>
        <h1 className="text-2xl font-bold">{asking ? "Request access" : "Welcome back"}</h1>
        <p className="mt-1.5 text-[#A3ABBD]">{asking ? `Access is by approval, ${forWhat}. Pay by Easypaisa or JazzCash and give the transaction ID: if we already have the payment you are in at once.` : "We email you a one-time link. No password to remember."}</p>
      </div>
      {signedOut ? <Notice title="You are signed out." /> : null}
      {deleted ? <Notice title="Your account was deleted." /> : null}
      {error && ERRORS[error] ? <Notice tone="warning" title={ERRORS[error]} /> : null}
      {asking ? (
        <>
          <RequestAccessForm s={access} />
          <p className="text-sm text-[#A3ABBD]">Sent a request already? <Link href="/access" className="font-semibold text-[#B9AAFF] hover:underline">Check its status</Link> · <Link href="/access?renew=1" className="font-semibold text-[#B9AAFF] hover:underline">Renew</Link></p>
        </>
      ) : (
        <>
          <SignInForm google={Boolean(googleConfig())} />
          <p className="text-sm text-[#A3ABBD]">Can&apos;t open that email any more? <Link href="/recover" className="font-semibold text-[#B9AAFF] hover:underline">Move your account to a new one</Link></p>
        </>
      )}
      {isDev ? (
        <p className="text-xs text-[#737C90]">
          Development: links are not emailed without SMTP_URL; open <Link href="/dev/mailbox" className="font-semibold text-[#B9AAFF] hover:underline">the dev mailbox</Link>.
        </p>
      ) : null}
    </AuthShell>
  );
}
