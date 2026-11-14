import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { AccessStatusForm, RequestAccessForm } from "@/components/auth/request-access-form";
import { loadAccessSettings } from "@/lib/data/access";
import { getDb } from "@/lib/db/client";
import { DEFAULT_ACCESS } from "@/lib/domain/access";

export const metadata: Metadata = { title: "Access" };
export const dynamic = "force-dynamic";

/**
 * Check a request's status, or renew access for a new induction. Works signed in or not
 * (someone whose access ended still has a session and lands here from the portal).
 */
export default async function AccessPage({ searchParams }: { searchParams: Promise<{ renew?: string }> }) {
  const { renew } = await searchParams;
  const access = await loadAccessSettings(getDb()).catch(() => DEFAULT_ACCESS);
  return (
    <AuthShell step={1}>
      <div className="grid gap-2 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">{renew ? "Renew your access" : "Your access request"}</h2>
        <p className="text-sm text-muted">{renew ? "Access lasts one induction. Pay for this one and use the same email: your account stays as it is." : "Check where your request stands with your email and transaction ID."}</p>
      </div>
      {access.paywall ? (
        <>
          <section className="grid gap-3 rounded-xl border border-line p-4">
            <h3 className="text-sm font-semibold text-heading"><span className="mr-2 text-xs text-subtle">3</span>Check status</h3>
            <AccessStatusForm />
          </section>
          <details className="rounded-xl border border-line p-4" open={Boolean(renew)}>
            <summary className="cursor-pointer text-sm font-semibold text-heading">{renew ? "Renew" : "Send a request"}</summary>
            <div className="mt-4"><RequestAccessForm s={access} /></div>
          </details>
        </>
      ) : (
        <p className="rounded-xl border border-line p-4 text-sm text-muted">Access is open: sign in with an email link.</p>
      )}
      <p className="text-center text-sm"><Link href="/sign-in" className="font-semibold text-signal hover:underline">Back to sign in</Link></p>
    </AuthShell>
  );
}
