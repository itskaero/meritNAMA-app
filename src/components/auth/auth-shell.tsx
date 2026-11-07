import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLockup } from "@/components/brand";
import { ART, PHOTOS } from "@/components/brand-assets";
import { cn } from "@/components/ui/cn";

const STEPS = ["Sign in with Google or email", "Link your merit record", "Build your shortlist"];

/**
 * Split-screen sign-in: the form on the left on warm ivory paper, an illustration of a
 * doctor in a hospital corridor on the right with the three steps of getting started
 * over it (the current one solid). On phones the image becomes a short band above.
 */
export function AuthShell({ step = 1, children }: { step?: 1 | 2 | 3; children: ReactNode }) {
  const photo = PHOTOS.doctor;
  return (
    <main id="main" className="grid min-h-screen bg-surface lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <section className="relative isolate order-2 flex flex-col px-5 py-8 sm:px-10 lg:order-1 lg:px-16 lg:py-10">
        <span aria-hidden className="mn-mask pointer-events-none absolute -bottom-10 -left-16 -z-10 h-80 w-64 text-teal opacity-[0.08]" style={{ ["--mn-mask" as string]: `url(${ART.botanical})` }} />
        <Link href="/" aria-label="meritNAMA home" className="self-start"><BrandLockup className="text-lg" markClassName="h-7 w-7" /></Link>
        <div className="mx-auto grid w-full max-w-sm flex-1 content-center gap-5 py-10">{children}</div>
        <p className="text-xs text-muted">Independent. Not an official admissions authority.</p>
      </section>
      <section aria-label="Getting started" className="relative order-1 min-h-56 overflow-hidden bg-navy lg:order-2 lg:min-h-screen">
        <Image src={photo.src} alt="" fill priority sizes="(min-width: 1024px) 55vw, 100vw" className="mn-hero-img object-cover opacity-90" style={{ objectPosition: photo.position }} />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-navy via-navy/45 to-navy/10" />
        <div className="relative flex h-full flex-col justify-end gap-6 p-6 text-ivory sm:p-10">
          <h1 className="max-w-md font-serif text-[clamp(1.8rem,3.4vw,2.7rem)] font-semibold leading-[1.1] text-ivory">Find your seat with the published record.</h1>
          <p className="hidden max-w-md text-sm text-ivory/85 sm:block">Sign in, link your merit record, then shortlist hospitals against past closing merit.</p>
          <ol className="hidden gap-2 sm:grid sm:grid-cols-3">
            {STEPS.map((label, i) => {
              const current = i + 1 === step;
              return (
                <li
                  key={label}
                  aria-current={current ? "step" : undefined}
                  className={cn("flex flex-col gap-3 rounded-lg p-3.5 text-sm", current ? "bg-ivory text-navy" : "bg-navy/55 text-ivory/90 ring-1 ring-ivory/20")}
                >
                  <span className={cn("grid h-6 w-6 place-items-center rounded-full text-xs font-semibold", current ? "bg-navy text-ivory" : "bg-ivory/15")}>{i + 1}</span>
                  <span>{label}</span>
                </li>
              );
            })}
          </ol>
        </div>
      </section>
    </main>
  );
}
