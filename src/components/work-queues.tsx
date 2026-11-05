import Link from "next/link";
import { Icon, type IconName } from "./icon";
import { cn } from "./ui/cn";

export type Queue = {
  title: string;
  /** null = not countable yet (e.g. a feature that is not built). */
  count: number | null;
  text: string;
  href?: string;
  cta?: string;
  icon: IconName;
};

/** The admin home's first row: what needs a person now. Non-empty queues are amber. */
export function WorkQueues({ queues }: { queues: Queue[] }) {
  if (queues.length === 0) return null;
  return (
    <section aria-label="Work queues" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {queues.map((q, i) => {
        const busy = (q.count ?? 0) > 0;
        const body = (
          <>
            <span className="flex items-center justify-between gap-3">
              <span className={cn("grid h-10 w-10 place-items-center rounded-full ring-1", busy ? "bg-amber/15 text-amber ring-amber/30" : "bg-elevated text-muted ring-line")}>
                <Icon name={q.icon} className="h-5 w-5" />
              </span>
              <span className={cn("font-display text-3xl font-extrabold tabular-nums [font-stretch:110%]", busy ? "text-amber" : q.count === null ? "text-subtle" : "text-ink")}>
                {q.count === null ? "—" : q.count}
              </span>
            </span>
            <span className="mt-3 block font-semibold">{q.title}</span>
            <span className="mt-1 block text-sm text-muted">{q.text}</span>
            {q.href && q.cta ? <span className={cn("mt-3 inline-flex items-center gap-1 text-sm font-semibold", busy ? "text-amber" : "text-signal")}>{q.cta} <span aria-hidden>→</span></span> : null}
          </>
        );
        const cls = cn(
          "mn-rise block rounded-[1.5rem] border p-5 transition-colors",
          busy ? "border-amber/40 bg-amber/5 hover:border-amber/70" : "border-line bg-surface",
          q.href && "hover:bg-elevated",
        );
        return q.href ? (
          <Link key={q.title} href={q.href} className={cls} style={{ animationDelay: `${i * 60}ms` }}>{body}</Link>
        ) : (
          <div key={q.title} className={cls} style={{ animationDelay: `${i * 60}ms` }}>{body}</div>
        );
      })}
    </section>
  );
}
