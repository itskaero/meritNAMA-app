"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Icon, type IconName } from "./icon";
import { cn } from "./ui/cn";

type NavItem = { href: string; label: string; group: string; icon: IconName };

export function SideNav({ area, items, brand, profile, footer }: {
  area: string;
  items: NavItem[];
  brand: ReactNode;
  profile: ReactNode;
  footer: ReactNode;
}) {
  const pathname = usePathname();
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

  return (
    <>
      <div className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-line bg-canvas/95 px-4 backdrop-blur lg:hidden">
        {brand}
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
        className={cn(
          "bg-canvas lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col",
          open ? "fixed inset-x-0 top-16 bottom-0 z-20 flex flex-col overflow-y-auto" : "hidden",
        )}
      >
        <div className="hidden h-16 items-center px-6 lg:flex">{brand}</div>
        <div className="px-4 pt-2">{profile}</div>
        <nav aria-label={area} className="flex-1 overflow-y-auto px-4 py-5">
          {groups.map((g) => (
            <div key={g} className="mb-6 last:mb-0">
              <p className="px-3 pb-2 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-subtle">{g}</p>
              <ul className="flex flex-col gap-1">
                {items.filter((i) => i.group === g).map((s) => {
                  const active = s.href === pathname;
                  return (
                    <li key={s.href}>
                      <Link
                        href={s.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors",
                          active
                            ? "border-line-strong bg-gradient-to-b from-elevated to-surface font-semibold text-ink shadow-[inset_0_1px_0_rgba(242,246,252,0.06)]"
                            : "border-transparent text-muted hover:bg-surface hover:text-ink",
                        )}
                      >
                        <Icon name={s.icon} className={cn("h-[18px] w-[18px]", active ? "text-signal" : "")} />
                        {s.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="px-6 py-4">{footer}</div>
      </aside>
    </>
  );
}
