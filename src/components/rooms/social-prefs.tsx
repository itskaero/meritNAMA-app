"use client";

import { useState, useTransition } from "react";
import { socialPrefsAction } from "@/app/portal/rooms/actions";

/** Two privacy switches: the merit band in rooms (off by default) and being counted in peer figures (on). */
export function SocialPrefs({ showBand, peerCounted }: { showBand: boolean; peerCounted: boolean }) {
  const [band, setBand] = useState(showBand);
  const [counted, setCounted] = useState(peerCounted);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const save = (p: { showBand?: boolean; peerCounted?: boolean }) => start(async () => { await socialPrefsAction(p); setSaved(true); });
  return (
    <fieldset className="grid gap-2.5 text-sm" disabled={pending}>
      <legend className="sr-only">Privacy</legend>
      <label className="flex items-start gap-2.5">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--mn-cyan)]" checked={band} onChange={(e) => { setBand(e.target.checked); save({ showBand: e.target.checked }); }} />
        <span><span className="font-medium text-ink">Show my merit band in round rooms</span><span className="block text-xs text-muted">Programme and a one-mark range, e.g. FCPS · 21–22. Never your exact marks.</span></span>
      </label>
      <label className="flex items-start gap-2.5">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--mn-cyan)]" checked={counted} onChange={(e) => { setCounted(e.target.checked); save({ peerCounted: e.target.checked }); }} />
        <span><span className="font-medium text-ink">Count me in &ldquo;people near your marks&rdquo;</span><span className="block text-xs text-muted">Anonymous counts only, and never fewer than three people.</span></span>
      </label>
      <p aria-live="polite" className="text-xs text-subtle">{saved && !pending ? "Saved." : ""}</p>
    </fieldset>
  );
}
