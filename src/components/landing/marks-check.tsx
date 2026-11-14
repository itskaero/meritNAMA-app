import Link from "next/link";
import type { LandingCheck } from "@/lib/data/public";
import { Icon } from "../icon";

type Tracks = { induction: number; total: number; tracks: { program: string; quota: string }[] } | null;

/**
 * "Check your marks": a plain GET form answered on the server, so it works without
 * JavaScript. It returns counts only; which options they are is in the score finder.
 */
export function MarksCheck({ tracks, check, query }: { tracks: Tracks; check: LandingCheck | null; query: { marks: string; track: string } }) {
  if (!tracks || !tracks.tracks.length) {
    return (
      <Link href="/portal/finder" className="inline-flex items-center gap-2 justify-self-start rounded-lg bg-gold px-5 py-3 font-semibold text-navy transition-colors hover:bg-ivory">
        Find where your score can go <Icon name="arrow" className="h-4 w-4" />
      </Link>
    );
  }
  const selected = query.track || `${tracks.tracks[0]!.program}|${tracks.tracks[0]!.quota}`;
  return (
    <div id="check" className="grid max-w-xl scroll-mt-6 gap-3 rounded-xl border border-ivory/15 bg-navy/70 p-4 backdrop-blur-sm sm:p-5">
      <form method="get" action="/" className="grid gap-3 sm:grid-cols-[7.5rem_minmax(0,1fr)_auto] sm:items-end">
        <label className="grid gap-1.5 text-xs font-medium text-ivory/80">
          Your marks <span className="sr-only">out of {tracks.total}</span>
          <span className="flex items-center gap-1.5">
            <input name="marks" inputMode="decimal" autoComplete="off" defaultValue={query.marks} placeholder={(tracks.total * 0.7).toFixed(1)} className="h-11 w-full min-w-0 rounded-lg border border-ivory/25 bg-ivory px-3 font-mono text-base text-navy placeholder:text-slate/60" />
            <span aria-hidden className="text-sm text-ivory/70">/{tracks.total}</span>
          </span>
        </label>
        <label className="grid gap-1.5 text-xs font-medium text-ivory/80">
          Programme and quota
          <select name="track" defaultValue={selected} className="h-11 w-full min-w-0 rounded-lg border border-ivory/25 bg-ivory px-3 text-sm text-navy">
            {tracks.tracks.map((t) => <option key={`${t.program}|${t.quota}`} value={`${t.program}|${t.quota}`}>{t.program} · {t.quota}</option>)}
          </select>
        </label>
        <button type="submit" className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-gold px-5 font-semibold text-navy transition-colors hover:bg-ivory">
          Check <Icon name="arrow" className="h-4 w-4" />
        </button>
      </form>
      <div aria-live="polite">
        {check?.ok ? (
          <div className="grid gap-3 border-t border-ivory/15 pt-3">
            <p className="text-sm text-ivory/85">
              Against induction {check.induction}&apos;s closing merit, {check.marks} of {check.total} in {check.program} · {check.quota} would have been:
            </p>
            <ul className="grid grid-cols-3 gap-2">
              {([["safe", check.safe], ["borderline", check.borderline], ["out", check.out]] as const).map(([k, v]) => (
                <li key={k} className="rounded-lg bg-ivory/10 px-3 py-2">
                  <p className="text-2xl font-semibold tabular-nums text-ivory">{v}</p>
                  <p className="text-xs text-ivory/75">{k === "out" ? "out of reach" : k}</p>
                </li>
              ))}
            </ul>
            <p className="text-xs text-ivory/70">
              From past rounds, not a prediction. <Link href={`/portal/finder?marks=${encodeURIComponent(String(check.marks))}&total=${check.total}&induction=${check.induction}&track=${encodeURIComponent(`${check.program}|${check.quota}`)}`} className="font-medium text-gold underline underline-offset-2">Sign in to see which options</Link>
            </p>
          </div>
        ) : check && !check.ok ? (
          <p role="alert" className="text-sm text-gold">{check.message}</p>
        ) : (
          <p className="text-xs text-ivory/70">Free, no sign-in needed. Counts only, from induction {tracks.induction}&apos;s published lists.</p>
        )}
      </div>
    </div>
  );
}
