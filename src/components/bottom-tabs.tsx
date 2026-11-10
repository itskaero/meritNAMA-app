"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icon";
import { cn } from "./ui/cn";

export type BottomTab = { href: string; label: string; icon: IconName; match?: string[]; badge?: number };

/**
 * Phones only: the main sections as a tab bar at the bottom of the screen, within
 * thumb reach, with words under the icons. The full menu stays behind the ☰ button.
 */
export function BottomTabs({ tabs }: { tabs: BottomTab[] }) {
  const pathname = usePathname();
  const under = (h: string) => pathname === h || (h.split("/").length > 2 && pathname.startsWith(`${h}/`));
  return (
    <nav data-print-hide aria-label="Main sections" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map((t) => {
          const on = under(t.href) || Boolean(t.match?.some(under));
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={on ? "page" : undefined}
                className={cn("relative flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-[0.7rem] font-medium", on ? "text-signal-strong" : "text-muted")}
              >
                <span className={cn("grid h-7 w-12 place-items-center rounded-full", on && "bg-[var(--mn-cyan-soft)]")}><Icon name={t.icon} className="h-5 w-5" /></span>
                <span className="truncate">{t.label}</span>
                {t.badge ? <span className="absolute right-1/4 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-action px-1 text-[0.65rem] font-semibold text-action-ink" aria-label={`${t.badge} unread`}>{t.badge > 99 ? "99+" : t.badge}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
