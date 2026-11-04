import { CountUp } from "./count-up";

export type Stat = { label: string; value: number; hint?: string };

/** Headline numbers that count up and rise in, staggered. */
export function StatTiles({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((s, i) => (
        <section key={s.label} className="mn-rise rounded-[1.5rem] border border-line bg-surface p-5" style={{ animationDelay: `${i * 70}ms` }}>
          <p className="text-xs text-muted">{s.label}</p>
          <p className="mt-3 font-display text-4xl font-extrabold tracking-tight [font-stretch:110%]"><CountUp value={s.value} /></p>
          {s.hint ? <p className="mt-1 text-xs text-subtle">{s.hint}</p> : null}
        </section>
      ))}
    </div>
  );
}
