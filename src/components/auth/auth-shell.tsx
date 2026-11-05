import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLockup } from "@/components/brand";
import { cn } from "@/components/ui/cn";

const STEPS = ["Sign in with Google or email", "Link your merit record", "Build your shortlist"];

/**
 * Split sign-in layout: a deep-teal panel with the three steps of getting started
 * (the current one in white), and the form on the right. Stacks on phones.
 */
export function AuthShell({ step = 1, children }: { step?: 1 | 2 | 3; children: ReactNode }) {
  return (
    <main id="main" className="grid min-h-screen place-items-center bg-[#050505] px-3 py-6 sm:px-6 sm:py-10">
      <div className="grid w-full max-w-6xl grid-cols-1 overflow-hidden rounded-[1.75rem] border border-line bg-black lg:min-h-[640px] lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <section
          aria-label="Getting started"
          className="relative m-2 flex flex-col justify-end gap-7 overflow-hidden rounded-[1.25rem] p-6 sm:p-8 lg:min-h-0"
          style={{ background: "radial-gradient(120% 90% at 85% 65%, #2a8f7c 0%, #12564b 30%, #0b2e29 60%, #061614 100%)" }}
        >
          <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(60% 50% at 18% 8%, rgba(255,255,255,0.07), transparent 60%)" }} />
          <Link href="/" aria-label="meritNAMA home" className="relative mb-auto"><BrandLockup className="text-lg" markClassName="h-8 w-8" /></Link>
          <div className="relative flex flex-wrap items-end justify-between gap-5 pt-16 lg:pt-0">
            <h1 className="text-[clamp(1.9rem,3.6vw,2.6rem)] font-medium leading-[1.1] tracking-tight">Find your seat<br />with real merit data</h1>
            <p className="max-w-[32ch] text-sm text-ink/75">Sign in, link your merit record, then shortlist hospitals against past closing merit.</p>
          </div>
          <ol className="relative grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {STEPS.map((label, i) => {
              const current = i + 1 === step;
              return (
                <li
                  key={label}
                  aria-current={current ? "step" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl p-4 text-sm font-medium sm:min-h-28 sm:flex-col sm:items-start sm:justify-between",
                    current ? "bg-white text-[#0b0b0c]" : "bg-white/[0.08] text-ink/80 backdrop-blur",
                  )}
                >
                  <span className={cn("grid h-6 w-6 flex-none place-items-center rounded-full text-xs font-bold", current ? "bg-[#0b0b0c] text-white" : "bg-white/20")}>{i + 1}</span>
                  <span>{label}</span>
                </li>
              );
            })}
          </ol>
        </section>
        <section className="grid content-center px-5 py-10 sm:px-10 lg:px-14">
          <div className="mx-auto grid w-full max-w-sm gap-5">{children}</div>
        </section>
      </div>
    </main>
  );
}
