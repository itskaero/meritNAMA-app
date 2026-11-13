import { basisChips, type Basis } from "@/lib/ingest/workflow";
import { cn } from "./ui/cn";

/**
 * What an estimate was built on: each layer as a chip, official ones solid green,
 * unofficial ones dashed amber, corrections cyan. Recorded on the run, so an old estimate
 * keeps its label after newer official data arrives.
 */
export function BuiltOn({ basis, className }: { basis: Basis | null | undefined; className?: string }) {
  if (!basis) return <p className={cn("text-xs text-muted", className)}>What this estimate was built on was not recorded (made before November 2026).</p>;
  return (
    <div className={cn("flex flex-wrap items-center gap-2 text-xs", className)} aria-label="What this estimate is built on">
      <span className="font-semibold text-muted">Built on</span>
      {basisChips(basis).map((c) => (
        <span
          key={c.label}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5",
            c.tone === "official" ? "border-success/45 text-success" : c.tone === "unofficial" ? "border-dashed border-amber/60 text-amber" : "border-info/40 text-info",
          )}
        >
          {c.tone === "official" ? "✓" : c.tone === "unofficial" ? "◐" : "+"} {c.label}
        </span>
      ))}
    </div>
  );
}
