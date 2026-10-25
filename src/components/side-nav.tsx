"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "./ui/cn";

export function SideNav({ area, sections, brand, footer }: {
  area: string;
  sections: { href: string; label: string }[];
  brand: ReactNode;
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

  return (
    <>
      <div className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-line bg-canvas/95 px-4 backdrop-blur lg:hidden">
        {brand}
        <button
          type="button"
          className="grid h-11 w-11 place-items-center rounded-md border border-line-strong"
          aria-expanded={open}
          aria-controls="app-nav"
          aria-label={open ? "Close navigation" : "Open navigation"}
          onClick={() => setOpen(!open)}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>

      <aside
        id="app-nav"
        className={cn(
          "border-line bg-canvas lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:border-r",
          open ? "fixed inset-x-0 top-16 bottom-0 z-20 flex flex-col overflow-y-auto" : "hidden",
        )}
      >
        <div className="hidden h-16 items-center px-6 lg:flex">{brand}</div>
        <nav aria-label={area} className="flex-1 px-3 py-4">
          <p className="px-3 pb-2 font-mono text-[0.7rem] uppercase tracking-[0.2em] text-subtle">{area}</p>
          <ul className="flex flex-col gap-0.5">
            {sections.map((s) => {
              const active = s.href === pathname;
              return (
                <li key={s.href}>
                  <Link
                    href={s.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "block rounded-md px-3 py-2 text-sm transition-colors",
                      active ? "bg-signal/10 font-semibold text-signal" : "text-muted hover:bg-surface hover:text-ink",
                    )}
                  >
                    {s.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="border-t border-line px-6 py-4">{footer}</div>
      </aside>
    </>
  );
}
