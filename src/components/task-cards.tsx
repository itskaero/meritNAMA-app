import Link from "next/link";
import { Icon, type IconName } from "./icon";

export type Task = { href: string; icon: IconName; title: string; body: string };

/**
 * "What do you want to do?": the old site's "I want to…" entry points as big cards,
 * one plain question each, so nobody needs to learn the menu first.
 */
export function TaskCards({ tasks, guide = true }: { tasks: Task[]; guide?: boolean }) {
  return (
    <section aria-labelledby="todo" className="grid gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="todo" className="font-serif text-2xl font-semibold text-heading">What do you want to do?</h2>
        {guide ? <Link href="/portal/guide" className="text-sm font-medium text-signal underline underline-offset-2">New here? Read the 2-minute guide</Link> : null}
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {tasks.map((t) => (
          <li key={t.title}>
            <Link href={t.href} className="group flex h-full items-start gap-4 rounded-xl border border-line bg-surface p-5 shadow-[var(--mn-shadow-1)] transition-colors hover:border-teal hover:bg-tint">
              <span className="grid h-12 w-12 flex-none place-items-center rounded-xl bg-tint text-signal transition-colors group-hover:bg-teal group-hover:text-white"><Icon name={t.icon} className="h-6 w-6" /></span>
              <span className="min-w-0">
                <span className="block text-lg font-semibold leading-snug text-heading">{t.title}</span>
                <span className="mt-1 block text-sm text-muted">{t.body}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
