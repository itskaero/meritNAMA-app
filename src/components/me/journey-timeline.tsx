import Link from "next/link";
import type { JourneyEvent } from "@/lib/domain/journey";
import { cn } from "../ui/cn";

const DOT: Record<JourneyEvent["tone"], string> = {
  success: "bg-teal shadow-[0_0_12px_var(--mn-glow)]",
  warning: "bg-amber",
  neutral: "bg-decor",
};

/**
 * A vertical timeline of the person's own journey: a line down the left, a dot per event
 * (green when marks cleared the closing merit or a seat was accepted, amber when not),
 * newest first. Each entry opens the page it is about.
 */
export function JourneyTimeline({ events, empty }: { events: JourneyEvent[]; empty: string }) {
  if (events.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ol className="relative grid gap-0 before:absolute before:bottom-2 before:left-[0.45rem] before:top-2 before:w-px before:bg-line">
      {events.map((e, i) => (
        <li key={e.key} className="mn-rise relative pl-8" style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}>
          <span aria-hidden className={cn("absolute left-0 top-3 h-3.5 w-3.5 rounded-full ring-4 ring-[var(--mn-surface,transparent)]", DOT[e.tone], e.kind === "consent" && "scale-75")} />
          <Link href={e.href} className={cn("block rounded-lg px-3 py-2 hover:bg-hover", e.kind === "consent" && "text-sm")}>
            <span className="flex flex-wrap items-center gap-2">
              <span className={cn("font-semibold", e.kind === "consent" ? "text-muted" : "text-heading")}>{e.title}</span>
              {e.kind === "notice" && e.unread ? <span className="rounded-full bg-action px-1.5 text-[0.65rem] font-semibold text-action-ink">new</span> : null}
            </span>
            <span className="block text-sm text-muted">{e.detail}</span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
