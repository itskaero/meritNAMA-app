"use client";

import { setConsentAction } from "@/app/what-if-actions";
import { cn } from "@/components/ui/cn";
import type { ConsentStatus } from "@/lib/domain/what-if";

const STATUSES: ConsentStatus[] = ["Accepted", "Rejected", "Awaited"];
const tone: Record<ConsentStatus, string> = {
  Accepted: "bg-[var(--mn-cyan-soft)] text-signal-strong ring-teal/60",
  Rejected: "bg-danger/15 text-danger ring-danger/50",
  Awaited: "bg-surface text-amber ring-amber/60",
};

/**
 * Three buttons for one allocation's simulated consent. Works without JavaScript (each is
 * a form post); the current choice is marked, and a change from the official consent is
 * labelled as simulated.
 */
export function ConsentToggle(props: {
  induction: number;
  base: string;
  back: string;
  applicantId: string;
  seatKey: string;
  official: ConsentStatus;
  simulated: ConsentStatus;
  changed: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div role="group" aria-label="Simulated consent" className="inline-flex rounded-full bg-elevated p-0.5">
        {STATUSES.map((s) => {
          const current = props.simulated === s;
          return (
            <form key={s} action={setConsentAction}>
              <input type="hidden" name="induction" value={props.induction} />
              <input type="hidden" name="base" value={props.base} />
              <input type="hidden" name="back" value={props.back} />
              <input type="hidden" name="applicantId" value={props.applicantId} />
              <input type="hidden" name="seatKey" value={props.seatKey} />
              <input type="hidden" name="status" value={s === props.official ? "" : s} />
              <button
                type="submit"
                aria-pressed={current}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                  current ? cn("ring-1", tone[s]) : "text-muted hover:text-ink",
                )}
              >
                {s}
              </button>
            </form>
          );
        })}
      </div>
      {props.changed ? (
        <span className="rounded-full border border-amber/40 bg-[var(--mn-amber-soft)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-amber">simulated</span>
      ) : null}
    </div>
  );
}
