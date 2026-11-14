import { Space_Grotesk } from "next/font/google";
import Link from "next/link";
import type { ReactNode } from "react";
import { landingFigures } from "@/lib/data/public";
import { checkDatabase, getDb } from "@/lib/db/client";

const display = Space_Grotesk({ subsets: ["latin"], weight: ["500"], display: "swap" });

/**
 * Sign-in, access and verify pages (docs/mockups/v4/SignIn.dc.html): one 1180px card on
 * near-black. Left, the night-study photograph under a navy fade with the latest seat
 * count; right, a frosted pane with the form and a few figures from the running cycle.
 * Public aggregates only. On phones the photo pane becomes a short band above the form.
 */
export async function AuthShell({ children }: { step?: 1 | 2 | 3; children: ReactNode }) {
  const f = (await checkDatabase()) === "ok" ? await landingFigures(getDb()).catch(() => null) : null;
  const trend = f?.latest?.trend ?? [];
  const last = trend.at(-1), before = trend.at(-2);
  const updated = f?.updatedAt ? new Date(f.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Karachi" }) : null;
  return (
    <main id="main" className="grid min-h-screen place-items-center p-3 sm:p-8 lg:p-16 [background:radial-gradient(800px_500px_at_20%_20%,rgba(77,184,217,.10),transparent_60%),#070A10]">
      <div className="flex w-full max-w-[1180px] flex-col overflow-hidden rounded-[20px] border border-white/[.06] text-[#E5E8EE] shadow-[0_40px_120px_rgba(0,0,0,.6)] lg:min-h-[680px] lg:flex-row">
        <section aria-label="meritNAMA" className="relative flex min-h-48 flex-col justify-between overflow-hidden bg-[#10243A] p-6 sm:p-12 lg:flex-[1.35]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/v4/night-study.jpg" alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover [object-position:40%_center]" />
          <div aria-hidden className="absolute inset-0 [background:linear-gradient(180deg,rgba(16,36,58,.55)_0%,rgba(16,36,58,.15)_40%,rgba(10,14,22,.92)_100%),radial-gradient(500px_360px_at_85%_20%,rgba(229,160,75,.18),transparent_70%)]" />
          <Link href="/" aria-label="meritNAMA home" className="relative self-start text-[15px] font-bold tracking-[0.02em]">merit<span className="text-[#B9AAFF]">NAMA</span></Link>
          <div className="relative hidden sm:block">
            {f?.seats ? (
              <div className="flex flex-wrap items-end gap-[22px]">
                <p className={`${display.className} text-[clamp(4.5rem,9vw,8.25rem)] font-medium leading-[0.85] tracking-[-0.04em] tabular-nums`}>{f.seats.toLocaleString("en-US")}</p>
                <div className="pb-2">
                  <p className="text-[30px] font-semibold">seats</p>
                  <p className="mt-1 text-[13px] text-[#A3ABBD]">{f.latest ? `Induction ${f.latest.induction}${last ? ` · round ${last.round}` : ""}` : "in the latest matrix"}{updated ? ` · ${updated}` : ""}</p>
                </div>
              </div>
            ) : null}
            <p className="mt-[22px] max-w-[460px] text-base leading-[1.6] text-[#C7CEDB]">Know where you stand. Every merit list since 2020, who holds which seat, and where your marks can land next round.</p>
          </div>
        </section>
        <section className="flex flex-col gap-[22px] bg-[rgba(20,27,40,.86)] p-6 backdrop-blur-[18px] sm:px-12 sm:py-11 lg:flex-1">
          {children}
          {f && f.rounds ? (
            <dl className="mt-1.5 border-t border-white/[.08] pt-5 text-sm">
              <p className="mb-3 font-semibold">This cycle</p>
              <div className="flex justify-between py-2 text-[#A3ABBD]"><dt>Rounds published</dt><dd className="font-mono text-[#E5E8EE]">{f.rounds}</dd></div>
              {last ? <div className="flex justify-between py-2 text-[#A3ABBD]"><dt>Median closing merit</dt><dd className="font-mono text-[#3ECF8E]">{last.median.toFixed(2)} {before ? (last.median <= before.median ? "▼" : "▲") : ""}</dd></div> : null}
              {f.latest ? <div className="flex justify-between py-2 text-[#A3ABBD]"><dt>Latest list</dt><dd className="font-mono text-[#E5E8EE]">Induction {f.latest.induction}{last ? ` · round ${last.round}` : ""}</dd></div> : null}
              {last ? <div className="flex justify-between py-2 text-[#A3ABBD]"><dt>Next list</dt><dd className="font-mono text-[#E8A627]">Round {last.round + 1}</dd></div> : null}
            </dl>
          ) : null}
          <p className="mt-auto text-xs text-[#737C90]"><Link href="/privacy" className="text-[#B9AAFF] hover:text-[#D6CCFF]">Privacy</Link> · <Link href="/terms" className="text-[#B9AAFF] hover:text-[#D6CCFF]">Terms</Link> · <Link href="/contact" className="text-[#B9AAFF] hover:text-[#D6CCFF]">Contact</Link> · Independent, not an official admissions authority.</p>
        </section>
      </div>
    </main>
  );
}
