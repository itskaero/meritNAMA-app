"use client";

import Link from "next/link";
import { useTransition } from "react";
import { dismissWhatsNewAction } from "@/app/_actions/whats-new";
import { Icon } from "./icon";

/**
 * A one-line strip above the page with the newest events (new merit lists, staged
 * changes…). "Dismiss" hides them until something newer arrives. It used to sit in
 * the sidebar, where it pushed half the menu out of view.
 */
export function WhatsNew({ items }: { items: { text: string; href: string; at: string }[] }) {
  const [pending, start] = useTransition();
  if (items.length === 0) return null;
  const [first, ...rest] = items;
  return (
    <section aria-label="What's new" className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-tint px-4 py-2 text-sm sm:px-8">
      <span className="inline-flex items-center gap-1.5 font-semibold text-heading"><Icon name="spark" className="h-4 w-4 text-signal" />New</span>
      <Link href={first!.href} className="min-w-0 truncate text-ink underline-offset-4 hover:underline">{first!.text}</Link>
      {rest.length ? (
        <details className="relative">
          <summary className="cursor-pointer list-none rounded-md px-1.5 text-muted hover:text-ink">and {rest.length} more</summary>
          <ul className="absolute left-0 z-30 mt-2 grid w-72 gap-1 rounded-xl border border-line bg-surface p-2 shadow-[var(--mn-shadow-2)]">
            {rest.map((i) => (
              <li key={i.href + i.at}><Link href={i.href} className="block rounded-md px-2 py-1.5 text-sm hover:bg-hover">{i.text}</Link></li>
            ))}
          </ul>
        </details>
      ) : null}
      <button type="button" onClick={() => start(() => dismissWhatsNewAction())} disabled={pending} className="ml-auto rounded-md px-2 py-1 text-xs font-medium text-muted hover:bg-hover hover:text-ink">
        Dismiss
      </button>
    </section>
  );
}
