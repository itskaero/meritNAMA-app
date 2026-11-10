import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLockup } from "@/components/brand";

/** The frame of the public pages (privacy, terms, contact): readable width, a way home and to the others. */
export function LegalPage({ title, updated, children }: { title: string; updated?: string; children: ReactNode }) {
  return (
    <main id="main" className="min-h-screen bg-canvas text-ink">
      <div className="mx-auto grid max-w-3xl gap-6 px-5 py-10 sm:px-8">
        <Link href="/" aria-label="meritNAMA home" className="self-start"><BrandLockup className="text-lg" markClassName="h-7 w-7" /></Link>
        <header className="grid gap-1">
          <h1 className="text-3xl font-semibold tracking-tight text-heading">{title}</h1>
          {updated ? <p className="text-sm text-muted">Last updated {updated}</p> : null}
        </header>
        <div className="grid gap-5 text-[0.95rem] leading-relaxed text-ink [&_h2]:mt-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-heading [&_ul]:grid [&_ul]:list-disc [&_ul]:gap-1.5 [&_ul]:pl-5 [&_a]:text-signal [&_a:hover]:underline">{children}</div>
        <nav aria-label="Legal" className="flex flex-wrap gap-4 border-t border-line pt-5 text-sm text-muted">
          <Link href="/privacy" className="hover:text-heading">Privacy</Link>
          <Link href="/terms" className="hover:text-heading">Terms</Link>
          <Link href="/contact" className="hover:text-heading">Contact</Link>
          <Link href="/sign-in" className="hover:text-heading">Sign in</Link>
        </nav>
      </div>
    </main>
  );
}
