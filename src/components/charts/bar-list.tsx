import Link from "next/link";

export type BarItem = { label: string; value: number; href?: string; detail?: string };

/** Ranked horizontal bars; each bar grows in, staggered. Values are drawn to one scale. */
export function BarList({ items, format = (v) => String(v), max, tone = "ember" }: {
  items: BarItem[];
  format?: (v: number) => string;
  max?: number;
  tone?: "ember" | "teal";
}) {
  const top = max ?? Math.max(...items.map((i) => i.value), 1);
  const fill = tone === "ember" ? "bg-gradient-to-r from-ember-deep to-ember" : "bg-gradient-to-r from-signal/50 to-signal";
  return (
    <ul className="grid min-w-0 gap-2.5">
      {items.map((it, i) => {
        const label = it.href ? <Link href={it.href} className="hover:text-ink hover:underline">{it.label}</Link> : it.label;
        return (
          <li key={`${it.label}-${i}`} className="grid min-w-0 grid-cols-1 gap-1">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-muted">{label}{it.detail ? <span className="text-subtle"> · {it.detail}</span> : null}</span>
              <span className="font-mono text-xs tabular-nums text-ink">{format(it.value)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-elevated">
              <div className={`mn-grow-x h-full rounded-full ${fill}`} style={{ width: `${Math.max(2, (it.value / top) * 100)}%`, animationDelay: `${Math.min(i, 12) * 40}ms` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
