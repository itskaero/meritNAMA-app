import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import specialist from "@/assets/journey/specialist.jpg";
import { BrandLockup } from "@/components/brand";
import { Icon } from "@/components/icon";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  const isDev = env().NODE_ENV !== "production";
  return (
    <main id="main" className="grid min-h-screen lg:grid-cols-[1fr_1.05fr]">
      <div className="relative flex flex-col px-5 py-8 sm:px-10">
        <div className="flex items-center justify-between">
          <BrandLockup />
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
            <Icon name="chevronLeft" className="h-4 w-4" /> Back to site
          </Link>
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-12">
          <p className="font-mono text-[0.7rem] font-semibold uppercase tracking-[0.28em] text-amber">Welcome back</p>
          <h1 className="mt-3 font-serif text-5xl leading-none tracking-tight">Sign in</h1>
          <p className="mt-3 text-muted">Access your candidate portal or the admin workspace.</p>
          <Card className="mt-8 p-6">
            <Notice tone="warning" title="Sign-in is not available yet">
              Authentication has not been integrated into this application. No account data is collected on this page.
            </Notice>
            {isDev ? (
              <p className="mt-4 text-xs text-muted">
                Development: set <code className="font-mono text-ink">DEV_AUTH_STUB_ROLE=candidate</code> or{" "}
                <code className="font-mono text-ink">admin</code> in <code className="font-mono text-ink">.env</code> to preview guarded routes.
              </p>
            ) : null}
          </Card>
        </div>
        <p className="text-xs text-subtle">MeritNAMA is independent and not an official admissions authority.</p>
      </div>

      <div className="relative hidden p-3 lg:block">
        <div className="relative h-full overflow-hidden rounded-[2rem] border border-white/10">
          <Image src={specialist} alt="" fill placeholder="blur" sizes="50vw" className="object-cover object-[60%_30%]" />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/20 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-10">
            <p className="max-w-md font-serif text-4xl leading-tight">
              A focused, well-planned journey towards your <em className="text-amber">speciality</em>.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
