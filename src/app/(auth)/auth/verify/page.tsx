import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { VerifyForm } from "@/components/auth/auth-forms";
import { Notice } from "@/components/ui/notice";

export const metadata: Metadata = { title: "Finish signing in", referrer: "no-referrer" };

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const { token } = await searchParams;
  const t = typeof token === "string" ? token : "";
  return (
    <AuthShell step={1}>
      <div className="grid gap-2 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">Finish signing in</h2>
        <p className="text-sm text-muted">{t ? "Press Continue to sign in on this device." : "This link is incomplete."}</p>
      </div>
      {t ? (
        <VerifyForm token={t} />
      ) : (
        <>
          <Notice tone="warning" title="Open the whole link from your email, or ask for a new one." />
          <Link href="/sign-in" className="text-center text-sm font-semibold text-signal hover:underline">Ask for a new link →</Link>
        </>
      )}
    </AuthShell>
  );
}
