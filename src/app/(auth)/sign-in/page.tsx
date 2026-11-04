import type { Metadata } from "next";
import { BrandLockup } from "@/components/brand";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  const isDev = env().NODE_ENV !== "production";
  return (
    <main id="main" className="grid min-h-screen place-items-center px-4 py-12">
      <div className="w-full max-w-md">
        <BrandLockup className="mb-8 text-xl" markClassName="h-9 w-9" />
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
              Development: set <code className="font-mono text-ink">DEV_AUTH_STUB_ROLE</code> in <code className="font-mono text-ink">.env</code> to{" "}
              <code className="font-mono text-ink">candidate</code>, <code className="font-mono text-ink">owner</code> or a staff role (data_editor, policy_editor, verifier, moderator) to preview guarded routes.
            </p>
          ) : null}
        </Card>
        <p className="mt-6 text-center text-xs text-subtle">
          meritNAMA is independent and not an official admissions authority.
        </p>
      </div>
    </main>
  );
}
