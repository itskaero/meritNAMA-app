import { Space_Grotesk } from "next/font/google";
import Link from "next/link";
import type { ReactNode } from "react";
import { signInStatus, type StatusLine } from "@/lib/data/announcements";
import { landingFigures } from "@/lib/data/public";
import { checkDatabase, getDb } from "@/lib/db/client";

const display = Space_Grotesk({ subsets: ["latin"], weight: ["500"], display: "swap" });
const DOT: Record<StatusLine["tone"], string> = { done: "#3ECF8E", live: "#E8A627", wait: "#737C90" };

/**
 * Sign-in, access and verify pages (docs/mockups/v4/SignIn.dc.html): one 1180px card on
 * near-black. Left, the night-study photograph under a navy fade with the latest seat
 * count; right, a frosted pane with the form and a few figures from the running cycle.
 * Public aggregates only. Side by side from 768px (tablets, phones in desktop mode); on
 * narrower phones the photo pane becomes a short band above the form.
 */
export async function AuthShell({ children, showStatus = false }: { step?: 1 | 2 | 3; showStatus?: boolean; children: ReactNode }) {
  const up = (await checkDatabase()) === "ok";
  const [f, status] = up ? await Promise.all([landingFigures(getDb()).catch(() => null), signInStatus(getDb()).catch(() => null)]) : [null, null];
  // A finished cycle has no next list to wait for.
  const closed = status?.lines[0]?.tone === "done";
  const trend = f?.latest?.trend ?? [];
  const last = trend.at(-1), before = trend.at(-2);
  const updated = f?.updatedAt ? new Date(f.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Karachi" }) : null;
  return (
    <main id="main" className="grid min-h-screen place-items-center p-3 sm:p-8 lg:p-16 [background:radial-gradient(800px_500px_at_20%_20%,rgba(77,184,217,.10),transparent_60%),#070A10]">
      <div className="flex w-full max-w-[1180px] flex-col overflow-hidden rounded-[20px] border border-white/[.06] text-[#E5E8EE] shadow-[0_40px_120px_rgba(0,0,0,.6)] md:min-h-[600px] md:flex-row lg:min-h-[680px]">
        <section aria-label="meritNAMA" className="relative flex min-h-48 flex-col justify-between overflow-hidden bg-[#10243A] p-6 sm:p-10 md:flex-[1.15] lg:flex-[1.35] lg:p-12">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/v4/night-study.jpg" alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover [object-position:40%_center]" />
          <div aria-hidden className="absolute inset-0 [background:linear-gradient(180deg,rgba(16,36,58,.55)_0%,rgba(16,36,58,.15)_40%,rgba(10,14,22,.92)_100%),radial-gradient(500px_360px_at_85%_20%,rgba(229,160,75,.18),transparent_70%)]" />
          <Link href="/" aria-label="meritNAMA home" className="relative self-start text-[15px] font-bold tracking-[0.02em]">merit<span className="text-[#B9AAFF]">NAMA</span></Link>
          <div className="relative hidden sm:block">
            {f?.seats ? (
              <div className="flex flex-wrap items-end gap-[22px]">
                <p className={`${display.className} text-[clamp(4rem,8vw,8.25rem)] font-medium leading-[0.85] tracking-[-0.04em] tabular-nums`}>{f.seats.toLocaleString("en-US")}</p>
                <div className="pb-2">
                  <p className="text-[30px] font-semibold">seats</p>
                  <p className="mt-1 text-[13px] text-[#A3ABBD]">{f.latest ? `Induction ${f.latest.induction}${last ? ` · round ${last.round}` : ""}` : "in the latest matrix"}{updated ? ` · ${updated}` : ""}</p>
                </div>
              </div>
            ) : null}
            <p className="mt-[22px] max-w-[460px] text-base leading-[1.6] text-[#C7CEDB]">Know where you stand. Every merit list since 2020, who holds which seat, and where your marks can land next round.</p>
          </div>
        </section>
        <section className="flex flex-col gap-[22px] bg-[rgba(20,27,40,.86)] p-6 backdrop-blur-[18px] sm:px-10 sm:py-11 md:flex-1 md:px-8 lg:px-12">
          {showStatus && status && (status.team.length || status.lines.length) ? (
            <section aria-label="Where things stand" role="status" className="grid gap-2 rounded-xl border border-white/[.08] bg-white/[.04] px-3.5 py-3 text-[13px] leading-snug">
              {status.team.map((n) => (
                <p key={n.id} className="flex gap-2.5"><span aria-hidden className="mt-[5px] h-2 w-2 flex-none rounded-full bg-[#B9AAFF] shadow-[0_0_8px_#B9AAFF]" /><span className="text-[#E5E8EE]">{n.text}{n.href ? <> <a href={n.href} className="font-semibold text-[#B9AAFF] hover:underline">More</a></> : null}</span></p>
              ))}
              {status.lines.map((l) => (
                <p key={l.label} className="flex gap-2.5">
                  <span aria-hidden className="mt-[5px] h-2 w-2 flex-none rounded-full" style={{ background: DOT[l.tone], boxShadow: `0 0 8px ${DOT[l.tone]}` }} />
                  <span className="text-[#A3ABBD]"><b className="font-semibold text-[#E5E8EE]">{l.label}</b> · {l.text}</span>
                </p>
              ))}
            </section>
          ) : null}
          {children}
          {f && f.rounds ? (
            <dl className="mt-1.5 border-t border-white/[.08] pt-5 text-sm">
              <p className="mb-3 font-semibold">This cycle</p>
              <div className="flex justify-between py-2 text-[#A3ABBD]"><dt>Rounds published</dt><dd className="font-mono text-[#E5E8EE]">{f.rounds}</dd></div>
              {last ? <div className="flex justify-between py-2 text-[#A3ABBD]"><dt>Median closing merit</dt><dd className="font-mono text-[#3ECF8E]">{last.median.toFixed(2)} {before ? (last.median <= before.median ? "▼" : "▲") : ""}</dd></div> : null}
              {f.latest ? <div className="flex justify-between py-2 text-[#A3ABBD]"><dt>Latest list</dt><dd className="font-mono text-[#E5E8EE]">Induction {f.latest.induction}{last ? ` · round ${last.round}` : ""}</dd></div> : null}
              {last && !closed ? <div className="flex justify-between py-2 text-[#A3ABBD]"><dt>Next list</dt><dd className="font-mono text-[#E8A627]">Round {last.round + 1}</dd></div> : null}
            </dl>
          ) : null}
          <p className="mt-auto text-xs text-[#737C90]"><Link href="/privacy" className="text-[#B9AAFF] hover:text-[#D6CCFF]">Privacy</Link> · <Link href="/terms" className="text-[#B9AAFF] hover:text-[#D6CCFF]">Terms</Link> · <Link href="/contact" className="text-[#B9AAFF] hover:text-[#D6CCFF]">Contact</Link> · Independent, not an official admissions authority.</p>
        </section>
      </div>
    </main>
  );
}
