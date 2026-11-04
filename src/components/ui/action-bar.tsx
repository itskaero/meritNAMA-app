import Link from "next/link";
import { Icon, type IconName } from "../icon";
import { cn } from "./cn";

export type BarAction = {
  label: string;
  href: string;
  icon?: IconName;
  /** The main action: a white pill. */
  primary?: boolean;
  /** Full navigation (file downloads, exports). */
  download?: boolean;
};

/**
 * Floating pill toolbar for the record on screen (policy version, change, seat
 * matrix, round). It only links to the page's own forms and exports, so no action
 * logic lives here. Scrolls sideways on narrow screens.
 */
export function ActionBar({ actions, label = "Actions" }: { actions: BarAction[]; label?: string }) {
  return (
    <nav aria-label={label} className="pointer-events-none sticky top-3 z-20 flex justify-center">
      <ul className="pointer-events-auto flex max-w-full gap-1 overflow-x-auto rounded-full bg-[#050506]/95 p-1 shadow-[0_16px_40px_-16px_rgba(0,0,0,0.9)] ring-1 ring-line-strong backdrop-blur">
        {actions.map((a) => {
          const cls = cn(
            "inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-full px-3.5 text-sm font-medium transition-colors",
            a.primary ? "bg-ink text-canvas hover:bg-ink/90" : "text-muted hover:bg-hover hover:text-ink",
          );
          const body = <>{a.icon ? <Icon name={a.icon} className="h-4 w-4" /> : null}{a.label}</>;
          return (
            <li key={a.label} className="flex">
              {a.download ? <a href={a.href} className={cls}>{body}</a> : <Link href={a.href} className={cls}>{body}</Link>}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
