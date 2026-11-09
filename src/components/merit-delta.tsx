import { formatDelta } from "@/lib/format";
import { cn } from "./ui/cn";

/**
 * Change in closing merit. A fall (easier to get in) is teal with a down arrow,
 * a rise is amber with an up arrow; the arrow and sign carry it without colour.
 */
export function MeritDelta({ value }: { value: number | null }) {
  if (value == null) return <span className="text-subtle">new</span>;
  const flat = Math.abs(value) < 0.005;
  return (
    <span className={cn("whitespace-nowrap font-mono tabular-nums", flat ? "text-subtle" : value < 0 ? "text-signal" : "text-amber")}>
      {flat ? "" : value < 0 ? "▼ " : "▲ "}
      {formatDelta(value)}
    </span>
  );
}
