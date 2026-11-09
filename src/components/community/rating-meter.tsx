import { cn } from "../ui/cn";

/** Five glowing pills filled to a 1–5 rating (averages fill a part of the last pill). */
export function RatingMeter({ value, size = "md", label }: { value: number | null; size?: "sm" | "md"; label: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2" role="img" aria-label={value == null ? `${label}: no ratings yet` : `${label}: ${value.toFixed(1)} out of 5`}>
      <span className={cn("grid flex-1 grid-cols-5", size === "sm" ? "gap-0.5" : "gap-1")}>
        {[0, 1, 2, 3, 4].map((i) => {
          const fill = value == null ? 0 : Math.min(Math.max(value - i, 0), 1);
          return (
            <span key={i} className={cn("relative overflow-hidden rounded-full bg-line", size === "sm" ? "h-1.5" : "h-2.5")}>
              {fill > 0 ? <span className="absolute inset-y-0 left-0 rounded-full bg-signal" style={{ width: `${fill * 100}%` }} /> : null}
            </span>
          );
        })}
      </span>
      <span className={cn("flex-none text-right font-mono tabular-nums", size === "sm" ? "w-6 text-[0.7rem] text-muted" : "w-8 text-sm")}>{value == null ? "—" : value.toFixed(1)}</span>
    </span>
  );
}
