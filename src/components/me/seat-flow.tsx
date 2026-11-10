import Link from "next/link";
import type { SeatFlow } from "@/lib/domain/journey";
import { formatMarks } from "@/lib/format";
import { Badge } from "../ui/badge";
import { cn } from "../ui/cn";

function Node({ eyebrow, title, children, glow = false }: { eyebrow: string; title: string; children?: React.ReactNode; glow?: boolean }) {
  return (
    <div className={cn("min-w-0 rounded-xl border bg-surface p-4", glow ? "border-action/60 shadow-[0_0_32px_-8px_var(--mn-glow)]" : "border-line")}>
      <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-subtle">{eyebrow}</p>
      <p className="mt-1 break-words font-semibold text-heading">{title}</p>
      {children ? <div className="mt-1 text-sm text-muted">{children}</div> : null}
    </div>
  );
}

/** A connector: a line with an arrow head, horizontal on wide screens and vertical on phones. */
function Link2() {
  return (
    <div aria-hidden className="grid place-items-center text-decor">
      <svg viewBox="0 0 40 16" className="hidden h-4 w-10 md:block"><path d="M0 8h34M28 2l7 6-7 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      <svg viewBox="0 0 16 28" className="h-7 w-4 md:hidden"><path d="M8 0v22M2 17l6 7 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </div>
  );
}

/**
 * Where the latest allocation came from and how safe it was: your preference, the seat it
 * landed on, and your marks against that round's closing merit.
 */
export function SeatFlowGraph({ flow }: { flow: SeatFlow }) {
  const { preference, seat, outcome, consent, round } = flow;
  return (
    <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.3fr)_auto_minmax(0,1fr)] md:items-center" role="group" aria-label="How your latest seat came about">
      <Node eyebrow="Your preference" title={`#${preference.no}`}>{preference.label}</Node>
      <Link2 />
      <Node eyebrow={`Seat · induction ${round.induction}, round ${round.roundNo}`} title={seat.speciality} glow>
        <span className="block">{seat.hospital}</span>
        <span className="block">{seat.track} · your marks <span className="font-mono text-ink">{formatMarks(seat.marks)}</span></span>
      </Node>
      <Link2 />
      <Node eyebrow="How close" title={outcome.closing == null ? "Not known" : `Closing ${formatMarks(outcome.closing)}`}>
        <span className="block">{outcome.text}</span>
        <span className="mt-1.5 flex flex-wrap items-center gap-2">
          {outcome.safe === true ? <Badge tone="success">Cleared</Badge> : outcome.safe === false ? <Badge tone="warning">Below closing</Badge> : null}
          <Badge tone={consent === "Accepted" ? "success" : consent === "Rejected" ? "danger" : "neutral"}>Consent: {consent}</Badge>
        </span>
        <Link href={`/portal/history/${round.induction}/rounds/${round.roundNo}`} className="mt-2 inline-block text-signal hover:underline">See the round →</Link>
      </Node>
    </div>
  );
}
