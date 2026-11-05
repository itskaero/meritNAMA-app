"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "./icon";
import { cn } from "./ui/cn";

export type NavItem = { href: string; label: string; group: string; icon: IconName };

/**
 * Sidebar on wide screens, drawer on phones. In Pro mode the wide-screen sidebar is
 * an icon rail: labels stay in the DOM for screen readers and show as tooltips.
 * The phone drawer always shows full labels.
 */
export function SideNav({ area, items, pro = false, brand, bell, profile, tools, footer }: {
  area: string;
  items: NavItem[];
  pro?: boolean;
  brand: ReactNode;
  /** Inbox bell: in the phone header and beside the brand on wide screens. */
  bell?: ReactNode;
  profile: ReactNode;
  tools?: ReactNode;
  footer: ReactNode;
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
      <div className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-line bg-canvas/95 px-4 backdrop-blur lg:hidden">
        {brand}
        <div className="flex items-center gap-2">
          {bell}
        <button
          ref={toggleRef}
          type="button"
          className="grid h-11 w-11 place-items-center rounded-full border border-muted/60"
          aria-expanded={open}
          aria-controls="app-nav"
          aria-label={open ? "Close navigation" : "Open navigation"}
          onClick={() => setOpen(!open)}
        >
          <Icon name={open ? "close" : "menu"} />
        </button>
        </div>
      </div>

      <aside
        id="app-nav"
        className={cn(
          "bg-canvas lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col",
          open ? "fixed inset-x-0 top-16 bottom-0 z-20 flex flex-col overflow-y-auto" : "hidden",
        )}
      >
        <div className={cn("hidden h-16 items-center lg:flex", pro ? "flex-col justify-center gap-2 pt-3 h-auto" : "justify-between px-6")}>{brand}{bell}</div>
        <div className="grid gap-3 px-4 pt-2">
          {profile}
          {tools}
        </div>
        <nav ref={navRef} aria-label={area} className={cn("flex-1 overflow-y-auto py-5", pro ? "px-4 lg:px-3" : "px-4")}>
          {groups.map((g) => (
            <div key={g} className={cn("mb-6 last:mb-0", pro && "lg:mb-3 lg:border-b lg:border-line lg:pb-3 lg:last:border-0")}>
              <p className={cn("px-3 pb-2 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-subtle", pro && "lg:sr-only")}>{g}</p>
              <ul className="flex flex-col gap-1">
                {items.filter((i) => i.group === g).map((s) => {
                  const active = isActive(s.href);
                  return (
                    <li key={s.href}>
                      <Link
                        href={s.href}
                        aria-current={active ? "page" : undefined}
                        title={pro ? s.label : undefined}
                        className={cn(
                          "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors",
                          pro && "lg:justify-center lg:px-0 lg:py-3",
                          active
                            ? "border-ink bg-ink font-semibold text-canvas shadow-[0_6px_20px_-8px_rgba(244,244,245,0.45)]"
                            : "border-transparent text-muted hover:bg-surface hover:text-ink",
                        )}
                      >
                        <Icon name={s.icon} className="h-[18px] w-[18px] flex-none" />
                        <span className={cn(pro && "lg:sr-only")}>{s.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className={cn("py-4", pro ? "px-6 lg:px-3" : "px-6")}>{footer}</div>
      </aside>
    </>
  );
}
