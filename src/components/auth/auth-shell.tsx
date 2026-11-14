import Link from "next/link";
import type { ReactNode } from "react";
import { landingFigures } from "@/lib/data/public";
import { checkDatabase, getDb } from "@/lib/db/client";
import { LogoMark, Wordmark } from "../brand";

/**
 * Sign-in, access and verify pages (v4 mockup "SignIn"): one card on charcoal. Left, a
 * photograph with the latest seat count and what meritNAMA is for; right, the form and a
 * few figures from the running cycle. Public aggregates only. On phones the photo pane
 * becomes a short band above the form.
 */
export async function AuthShell({ children }: { step?: 1 | 2 | 3; children: ReactNode }) {
  const f = (await checkDatabase()) === "ok" ? await landingFigures(getDb()).catch(() => null) : null;
  const trend = f?.latest?.trend ?? [];
  const last = trend.at(-1), before = trend.at(-2);
  return (
    <main id="main" className="grid min-h-screen place-items-center bg-canvas p-3 sm:p-8 [background:radial-gradient(50rem_30rem_at_20%_0%,rgba(23,107,103,.18),transparent),var(--mn-navy-950)]">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-[24px] border border-white/10 bg-card shadow-[0_30px_80px_rgba(0,0,0,.5)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section aria-label="meritNAMA" className="relative flex min-h-48 flex-col justify-between overflow-hidden p-6 sm:p-10 lg:min-h-[36rem]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/v4/night-study.jpg" alt="" aria-hidden className="absolute inset-0 -z-0 h-full w-full object-cover opacity-30" />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-[#0B1424] via-[#0B1424]/70 to-[#0B1424]/30" />
          <Link href="/" aria-label="meritNAMA home" className="relative flex items-center gap-2.5 self-start"><LogoMark animate className="h-7 w-7" /><Wordmark /></Link>
          <div className="relative hidden gap-4 sm:grid">
            {f?.seats ? (
              <p className="flex flex-wrap items-end gap-3">
                <span className="text-[clamp(3.5rem,8vw,6rem)] font-light leading-none tracking-tight text-[#F3EEE5] tabular-nums">{f.seats.toLocaleString("en-US")}</span>
                <span className="pb-2"><span className="block text-2xl font-semibold text-[#F3EEE5]">seats</span><span className="text-xs text-[#F3EEE5]/65">{f.latest ? `Induction ${f.latest.induction}${last ? ` · round ${last.round}` : ""}` : "in the latest matrix"}</span></span>
              </p>
            ) : null}
            <p className="max-w-md text-sm leading-relaxed text-[#F3EEE5]/80">Know where you stand. Every merit list, who holds which seat, and where your marks can land next round.</p>
          </div>
        </section>
        <section className="grid content-start gap-6 border-t border-line bg-[#12141B] p-6 sm:p-10 lg:border-l lg:border-t-0">
          <div className="grid gap-5">{children}</div>
          {f && f.rounds ? (
            <dl className="grid gap-2.5 border-t border-line pt-5 text-sm">
              <p className="font-semibold text-heading">This cycle</p>
              <div className="flex justify-between"><dt className="text-muted">Rounds published</dt><dd className="font-mono text-ink">{f.rounds}</dd></div>
              {last ? <div className="flex justify-between"><dt className="text-muted">Median closing merit</dt><dd className="font-mono text-success">{last.median.toFixed(2)} {before ? (last.median <= before.median ? "▼" : "▲") : ""}</dd></div> : null}
              {f.latest ? <div className="flex justify-between"><dt className="text-muted">Latest list</dt><dd className="font-mono text-ink">Induction {f.latest.induction}{last ? ` · R${last.round}` : ""}</dd></div> : null}
            </dl>
          ) : null}
          <p className="text-xs text-subtle"><Link href="/privacy" className="text-violet-pale hover:underline">Privacy</Link> · <Link href="/terms" className="text-violet-pale hover:underline">Terms</Link> · <Link href="/contact" className="text-violet-pale hover:underline">Contact</Link> · Independent, not an official admissions authority.</p>
        </section>
      </div>
    </main>
  );
}
