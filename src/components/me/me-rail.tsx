import Link from "next/link";
import { Icon, type IconName } from "../icon";

export type RailItem = { href: string; label: string; icon: IconName; count?: number };

/**
 * The left rail of the Me workspace (a column on wide screens, a scrolling strip on phones).
 * In-page anchors first, then the pages the workspace leans on.
 */
export function MeRail({ items }: { items: RailItem[] }) {
  return (
    <nav aria-label="My workspace" className="min-w-0 lg:sticky lg:top-20 lg:self-start">
      <ul className="flex gap-1 overflow-x-auto pb-1 lg:grid lg:overflow-visible lg:pb-0">
        {items.map((i) => (
          <li key={i.href} className="flex-none">
            <Link href={i.href} className="flex items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm text-muted hover:bg-hover hover:text-heading">
              <Icon name={i.icon} className="h-4 w-4" />
              <span className="flex-1">{i.label}</span>
              {i.count ? <span className="rounded-full bg-tint px-1.5 text-xs tabular-nums text-signal">{i.count}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
