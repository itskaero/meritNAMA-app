import { peerShown } from "@/lib/domain/social";
import { Icon } from "../icon";
import { cn } from "../ui/cn";

/**
 * "n near your marks": how many people within half a mark of you saved this seat.
 * Renders nothing under the minimum, so a count never points at one person.
 */
export function PeerCount({ n, className }: { n: number | null | undefined; className?: string }) {
  const shown = peerShown(n);
  if (shown == null) return null;
  return (
    <span
      title={`${shown} people within half a mark of you have this on a shortlist or preference list`}
      className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-[var(--mn-cyan-soft)] px-2 py-0.5 text-[0.72rem] font-medium text-signal-strong", className)}
    >
      <Icon name="users" className="h-3.5 w-3.5" />
      <span className="tabular-nums">{shown}</span> near your marks
    </span>
  );
}
