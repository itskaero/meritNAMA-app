"use client";

import Link from "next/link";
import { useTransition } from "react";
import { dismissWhatsNewAction } from "@/app/_actions/whats-new";
import { Icon } from "./icon";

/** Sidebar card with the newest events; "Dismiss" hides them until something newer arrives. */
export function WhatsNew({ items }: { items: { text: string; href: string; at: string }[] }) {
  const [pending, start] = useTransition();
  if (items.length === 0) return null;
  return (
    <section aria-label="What's new" className="rounded-2xl border border-line bg-surface p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-muted"><Icon name="spark" className="h-3.5 w-3.5 text-ember-hot" />What&apos;s new</p>
        <button type="button" onClick={() => start(() => dismissWhatsNewAction())} disabled={pending} className="rounded-full px-2 py-0.5 text-[0.7rem] text-subtle hover:bg-hover hover:text-ink">
          Dismiss
        </button>
      </div>
      <ul className="grid gap-1">
        {items.map((i) => (
          <li key={i.href + i.at}>
            <Link href={i.href} className="flex gap-2 rounded-lg px-1.5 py-1 text-xs text-ink/90 hover:bg-hover">
              <span aria-hidden className="mt-1.5 h-1 w-1 flex-none rounded-full bg-muted" />
              <span className="line-clamp-2">{i.text}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
