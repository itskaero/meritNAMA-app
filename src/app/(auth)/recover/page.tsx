import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { RecoverForm } from "@/components/auth/recover-form";
import { loadAccessSettings } from "@/lib/data/access";
import { getDb } from "@/lib/db/client";
import { DEFAULT_ACCESS } from "@/lib/domain/access";

export const metadata: Metadata = { title: "Lost your email" };
export const dynamic = "force-dynamic";

/** No access to the old email: prove it is you with the applicant ID and CNIC, and move to a new one. */
export default async function RecoverPage() {
  const access = await loadAccessSettings(getDb()).catch(() => DEFAULT_ACCESS);
  return (
    <AuthShell step={1}>
      <div>
        <h1 className="text-2xl font-bold">Lost your email?</h1>
        <p className="mt-1.5 text-[#A3ABBD]">Sign-in links go to your email. If you cannot open it any more, move your account to one you can: your applicant ID and CNIC show it is you.</p>
      </div>
      <RecoverForm paywall={access.paywall} />
      <ul className="grid gap-1.5 text-sm text-[#A3ABBD]">
        <li>Still have a Gmail address? <Link href="/sign-in?tab=signin" className="font-semibold text-[#B9AAFF] hover:underline">Continue with Google</Link> works without a link.</li>
        <li>No CNIC in PHF&apos;s file? Write to us from the <Link href="/contact" className="font-semibold text-[#B9AAFF] hover:underline">contact page</Link>.</li>
      </ul>
      <p className="text-sm"><Link href="/sign-in?tab=signin" className="font-semibold text-[#B9AAFF] hover:underline">Back to sign in</Link></p>
    </AuthShell>
  );
}
