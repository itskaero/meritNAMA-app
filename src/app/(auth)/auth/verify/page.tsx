import type { Metadata } from "next";
import Link from "next/link";
import { VerifyForm } from "@/components/auth/auth-forms";
import { BrandLockup } from "@/components/brand";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";

export const metadata: Metadata = { title: "Finish signing in", referrer: "no-referrer" };

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const { token } = await searchParams;
  const t = typeof token === "string" ? token : "";
  return (
    <main id="main" className="grid min-h-screen place-items-center px-4 py-12">
      <div className="w-full max-w-md">
        <BrandLockup className="mb-8 text-xl" markClassName="h-9 w-9" />
        <Card className="p-6">
          <h1 className="text-2xl font-bold tracking-tight">Finish signing in</h1>
          {t ? (
            <>
              <p className="mt-2 mb-6 text-sm text-muted">Press Continue to sign in on this device.</p>
              <VerifyForm token={t} />
            </>
          ) : (
            <div className="mt-4 grid gap-4">
              <Notice tone="warning" title="This link is incomplete">Open the whole link from your email, or ask for a new one.</Notice>
              <Link href="/sign-in" className="text-sm font-semibold text-signal hover:underline">Ask for a new link →</Link>
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
