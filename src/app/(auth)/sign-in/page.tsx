import type { Metadata } from "next";
import { BrandMark } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  const isDev = env().NODE_ENV !== "production";
  return (
    <main id="main" className="grid min-h-screen place-items-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center gap-3 text-xl font-extrabold tracking-tight">
          <BrandMark className="h-9 w-9" />
          <span>Merit<span className="text-signal">Nama</span></span>
        </div>
        <Card className="p-6">
          <h1 className="text-2xl font-bold tracking-tight">Sign in</h1>
          <p className="mt-2 text-sm text-muted">Access your candidate portal or the admin workspace.</p>
          <div className="mt-6">
            <Notice tone="warning" title="Sign-in is not available yet">
              Authentication has not been integrated into this application. No account data is collected on this page.
            </Notice>
          </div>
          {isDev ? (
            <p className="mt-4 text-xs text-muted">
              Development: set <code className="font-mono text-ink">DEV_AUTH_STUB_ROLE=candidate</code> or{" "}
              <code className="font-mono text-ink">admin</code> in <code className="font-mono text-ink">.env</code> to preview guarded routes.
            </p>
          ) : null}
        </Card>
        <p className="mt-6 text-center text-xs text-subtle">
          MeritNama is independent and not an official admissions authority.
        </p>
      </div>
    </main>
  );
}
