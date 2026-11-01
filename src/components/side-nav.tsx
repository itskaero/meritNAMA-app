"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { BrandLockup } from "./brand";
import { Icon, type IconName } from "./icon";
import { cn } from "./ui/cn";

type NavItem = { href: string; label: string; group: string; icon: IconName };

// Collapsed/expanded preference, remembered per browser. Storage can be unavailable
// (private mode, blocked site data), so every access is guarded and defaults to expanded.
const KEY = "mn-nav-collapsed";
const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
function readCollapsed() {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
function writeCollapsed(v: boolean) {
  try {
    window.localStorage.setItem(KEY, v ? "1" : "0");
  } catch {
    /* preference simply isn't remembered */
  }
  listeners.forEach((l) => l());
}

/**
 * Sidebar from the dashboard references: a greeting, grouped menu and profile card,
 * collapsible on desktop into an icon rail; a drawer on small screens.
 */
export function SideNav({ area, items, greeting, profile, profileCompact, footer }: {
  area: string;
  items: NavItem[];
  greeting: ReactNode;
  profile: ReactNode;
  /** Shown instead of `profile` when the sidebar is collapsed to a rail. */
  profileCompact: ReactNode;
  footer: ReactNode;
}) {
  const pathname = usePathname();
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, () => false);
  // The drawer is open "for" a path, so navigating anywhere closes it without an effect.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = openFor === pathname;
  const setOpen = (v: boolean) => setOpenFor(v ? pathname : null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenFor(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const groups = [...new Set(items.map((i) => i.group))];
  // The drawer always shows labels; only the desktop sidebar collapses.
  const rail = collapsed && !open;

  return (
    <>
      <div className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-line bg-canvas/90 px-4 backdrop-blur lg:hidden">
        <BrandLockup href="/" />
        <button
          type="button"
          className="grid h-11 w-11 place-items-center rounded-full border border-line-strong"
          aria-expanded={open}
          aria-controls="app-nav"
          aria-label={open ? "Close navigation" : "Open navigation"}
          onClick={() => setOpen(!open)}
        >
          <Icon name={open ? "close" : "menu"} />
        </button>
      </div>

      <aside
        id="app-nav"
        data-collapsed={rail || undefined}
        className={cn(
          "bg-canvas/95 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-none lg:flex-col lg:bg-transparent lg:transition-[width] lg:duration-300",
          rail ? "lg:w-[92px]" : "lg:w-[280px]",
          open ? "fixed inset-x-0 top-16 bottom-0 z-20 flex flex-col overflow-y-auto backdrop-blur" : "hidden",
        )}
      >
        <div className={cn("hidden h-20 items-center lg:flex", rail ? "h-28 flex-col justify-center gap-3" : "justify-between px-6")}>
          <BrandLockup href="/" compact={rail} />
          <button
            type="button"
            onClick={() => writeCollapsed(!collapsed)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-controls="app-nav"
            aria-expanded={!collapsed}
            className="grid h-8 w-8 place-items-center rounded-lg border border-line-strong text-muted transition-colors hover:bg-hover hover:text-ink"
          >
            <Icon name={collapsed ? "chevronRight" : "chevronLeft"} className="h-4 w-4" />
          </button>
        </div>

        {rail ? null : <div className="px-6 pt-2 pb-2">{greeting}</div>}

        <nav aria-label={area} className={"flex-1 overflow-y-auto px-4 py-4"}>
          {groups.map((g) => (
            <div key={g} className={cn("mb-5 last:mb-0", rail && "mb-3 border-b border-line pb-3 last:border-0")}>
              <p className={cn("px-3 pb-2 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-subtle", rail && "sr-only")}>{g}</p>
              <ul className={cn("flex flex-col gap-1", rail && "items-center gap-2")}>
                {items.filter((i) => i.group === g).map((s) => {
                  const active = s.href === pathname;
                  return (
                    <li key={s.href} className={cn(rail ? "" : "w-full")}>
                      <Link
                        href={s.href}
                        title={rail ? s.label : undefined}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "relative flex items-center text-sm transition-all duration-200",
                          rail
                            ? cn(
                                "h-11 w-11 justify-center rounded-full border",
                                active ? "border-transparent bg-ink text-canvas shadow-glow" : "border-line text-muted hover:border-line-strong hover:bg-surface hover:text-ink",
                              )
                            : cn(
                                "gap-3 rounded-xl border px-3 py-2.5",
                                active
                                  ? "border-signal/30 bg-gradient-to-r from-signal-deep/45 to-signal/10 font-semibold text-ink shadow-glow"
                                  : "border-transparent text-muted hover:bg-surface hover:text-ink",
                              ),
                        )}
                      >
                        <Icon name={s.icon} className={cn("h-[18px] w-[18px] flex-none", !rail && active && "text-signal-strong")} />
                        <span className={cn(rail && "sr-only")}>{s.label}</span>
                        {!rail && active ? <span aria-hidden className="ml-auto h-4 w-0.5 rounded-full bg-signal-strong" /> : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className={cn("pb-4", rail ? "flex justify-center px-2" : "px-4")}>{rail ? profileCompact : profile}</div>
        {rail ? null : <div className="px-6 pb-5">{footer}</div>}
      </aside>
    </>
  );
}
