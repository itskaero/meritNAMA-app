import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/auth/auth-forms";
import { BrandLockup } from "@/components/brand";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ signedOut?: string }> }) {
  const session = await getSession();
  if (session && !session.isStub) redirect(session.role === "candidate" ? "/portal" : "/admin");
  const { signedOut } = await searchParams;
  const isDev = process.env.NODE_ENV !== "production";
  return (
    <main id="main" className="grid min-h-screen place-items-center px-4 py-12">
      <div className="w-full max-w-md">
        <Link href="/" aria-label="meritNAMA home"><BrandLockup className="mb-8 text-xl" markClassName="h-9 w-9" /></Link>
        <Card className="p-6">
          <h1 className="text-2xl font-bold tracking-tight">Sign in</h1>
          <p className="mt-2 text-sm text-muted">
            Use the email address you gave in your PHF application: your merit record is then linked to your account automatically.
          </p>
          {signedOut ? <div className="mt-4"><Notice title="You are signed out." /></div> : null}
          <div className="mt-6"><SignInForm /></div>
          {isDev ? (
            <p className="mt-6 text-xs text-muted">
              Development: without SMTP_URL, links are not emailed; open <Link href="/dev/mailbox" className="font-semibold text-signal hover:underline">the dev mailbox</Link> to use them.
            </p>
          ) : null}
        </Card>
        <p className="mt-6 text-center text-xs text-subtle">meritNAMA is independent and not an official admissions authority.</p>
      </div>
    </main>
  );
}
