"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "./icon";
import { cn } from "./ui/cn";

export type NavItem = { href: string; label: string; group: string; icon: IconName };

/**
 * Persistent sidebar on wide screens, drawer on phones. Brand and search at the top,
 * the menu in the middle (it alone scrolls, so every section stays reachable), the
 * account menu at the bottom. In Pro mode the wide-screen sidebar is an icon rail:
 * labels stay in the DOM for screen readers and show as tooltips.
 */
export function SideNav({ area, items, pro = false, brand, bell, profile, tools, footer = null }: {
  area: string;
  items: NavItem[];
  pro?: boolean;
  brand: ReactNode;
  /** Inbox bell: in the phone header and beside the brand on wide screens. */
  bell?: ReactNode;
  profile: ReactNode;
  tools?: ReactNode;
  footer?: ReactNode;
}) {
  const pathname = usePathname();
  // The drawer is open "for" a path, so navigating anywhere closes it without an effect.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = openFor === pathname;
  const setOpen = (v: boolean) => setOpenFor(v ? pathname : null);

  const toggleRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);

  // While the drawer is open it is the only interactive surface: the page behind
  // is inert and does not scroll, focus starts inside it and returns to the toggle.
  useEffect(() => {
    if (!open) return;
    const toggle = toggleRef.current;
    const nav = navRef.current;
    const main = document.getElementById("main");
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    main?.setAttribute("inert", "");
    nav?.querySelector<HTMLElement>("a[href]")?.focus();

    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenFor(null);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      main?.removeAttribute("inert");
      // Only pull focus back if it was inside the drawer (not after a link navigated away).
      if (nav?.contains(document.activeElement)) toggle?.focus();
    };
  }, [open]);

  const groups = [...new Set(items.map((i) => i.group))];
  // Section roots (/admin, /portal) match exactly; other items also own their sub-routes.
  const isActive = (href: string) =>
    pathname === href || (href.split("/").length > 2 && pathname.startsWith(`${href}/`));

  return (
    <>
      <header data-print-hide className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-surface/95 px-4 backdrop-blur lg:hidden">
        {brand}
        <div className="flex items-center gap-2">
          {bell}
          <button
            ref={toggleRef}
            type="button"
            className="grid h-11 w-11 place-items-center rounded-lg border border-line text-ink"
            aria-expanded={open}
            aria-controls="app-nav"
            aria-label={open ? "Close navigation" : "Open navigation"}
            onClick={() => setOpen(!open)}
          >
            <Icon name={open ? "close" : "menu"} />
          </button>
        </div>
      </header>

      <aside
        id="app-nav"
        className={cn(
          "border-line bg-surface lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:border-r",
          open ? "fixed inset-x-0 top-14 bottom-0 z-20 flex flex-col overflow-y-auto" : "hidden",
        )}
      >
        <div className={cn("hidden h-14 flex-none items-center lg:flex", pro ? "justify-center" : "justify-between pl-5 pr-3")}>{brand}{pro ? null : bell}</div>
        {tools ? <div className={cn("flex-none px-3 pb-2", pro && "lg:flex lg:justify-center")}>{tools}</div> : null}
        <nav ref={navRef} aria-label={area} className={cn("min-h-0 flex-1 overflow-y-auto px-3 pb-3", pro && "lg:px-2")}>
          {groups.map((g) => (
            <div key={g} className={cn("pt-3 first:pt-1", pro && "lg:border-t lg:border-line lg:first:border-0")}>
              <p className={cn("px-3 pb-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-subtle", pro && "lg:sr-only")}>{g}</p>
              <ul className="flex flex-col gap-0.5">
                {items.filter((i) => i.group === g).map((s) => {
                  const active = isActive(s.href);
                  return (
                    <li key={s.href}>
                      <Link
                        href={s.href}
                        aria-current={active ? "page" : undefined}
                        title={pro ? s.label : undefined}
                        className={cn(
                          "relative flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                          pro && "lg:justify-center lg:px-0",
                          active
                            ? "bg-[color-mix(in_srgb,var(--mn-brand-teal)_20%,transparent)] font-semibold text-heading before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-teal"
                            : "text-muted hover:bg-hover hover:text-ink",
                        )}
                      >
                        <Icon name={s.icon} className={cn("h-[18px] w-[18px] flex-none", active ? "text-signal" : "text-decor")} />
                        <span className={cn(pro && "lg:sr-only")}>{s.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className={cn("flex-none border-t border-line p-3", pro && "lg:px-2")}>{profile}{footer}</div>
      </aside>
    </>
  );
}
