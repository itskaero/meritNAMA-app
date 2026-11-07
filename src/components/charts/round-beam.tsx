import Link from "next/link";
import { cn } from "../ui/cn";

/**
 * An induction's rounds as nodes on an ember beam: where you are in the cycle.
 * The beam's glow drifts slowly (off under reduced motion).
 */
export function RoundBeam({ rounds, current, hrefFor }: { rounds: number[]; current?: number; hrefFor: (round: number) => string }) {
  return (
    <ol className="relative flex items-center gap-0 overflow-x-auto py-3" aria-label="Rounds">
      <span aria-hidden className="mn-beam-flow absolute inset-x-3 top-1/2 h-1 -translate-y-1/2 rounded-full bg-[linear-gradient(90deg,var(--mn-ember-deep),var(--mn-ember),var(--mn-ember-hot),var(--mn-ember),var(--mn-ember-deep))] opacity-70" />
      {rounds.map((r) => (
        <li key={r} className="relative flex flex-1 justify-center">
          <Link
            href={hrefFor(r)}
            aria-current={r === current ? "page" : undefined}
            className={cn(
              "grid h-9 min-w-9 place-items-center rounded-full border px-2 font-mono text-xs font-semibold transition-colors",
              r === current ? "border-ember bg-ember text-canvas" : "border-line-strong bg-canvas text-muted hover:border-ember hover:text-ink",
            )}
          >
            R{r}
          </Link>
        </li>
      ))}
    </ol>
  );
}
