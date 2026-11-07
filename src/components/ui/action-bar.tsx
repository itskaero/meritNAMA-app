import Link from "next/link";
import { Icon, type IconName } from "../icon";
import { cn } from "./cn";

export type BarAction = {
  label: string;
  href: string;
  icon?: IconName;
  /** The main action. */
  primary?: boolean;
  /** Full navigation (file downloads, exports). */
  download?: boolean;
};

/**
 * Toolbar for the record on screen (policy version, change, seat matrix, round): a row
 * of links under the page title. It only links to the page's own forms and exports,
 * so no action logic lives here. Scrolls sideways on narrow screens. (It used to float
 * over the content as you scrolled, covering cards.)
 */
export function ActionBar({ actions, label = "Actions" }: { actions: BarAction[]; label?: string }) {
  return (
    <nav aria-label={label} className="-mt-1">
      <ul className="flex max-w-full gap-2 overflow-x-auto pb-1">
        {actions.map((a) => {
          const cls = cn(
            "inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors",
            a.primary ? "bg-signal text-signal-ink hover:bg-signal-strong" : "border border-line-strong bg-surface text-ink hover:bg-hover",
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
