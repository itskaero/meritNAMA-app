"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BrandLockup } from "@/components/brand";
import { Icon } from "@/components/icon";
import { cn } from "@/components/ui/cn";

const links = [
  { href: "#journey", label: "Journey" },
  { href: "#features", label: "Features" },
  { href: "#about", label: "About" },
];

/** Floating pill navigation that firms up into glass once the hero scrolls away. */
export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-40 px-3 pt-3 sm:px-6 sm:pt-5">
      <div
        className={cn(
          "mx-auto flex h-14 max-w-6xl items-center justify-between rounded-full px-3 pl-5 transition-all duration-500",
          scrolled || open ? "glass" : "border border-transparent",
        )}
      >
        <BrandLockup />

        <nav aria-label="Site" className="hidden md:block">
          <ul className="flex items-center gap-1 text-sm">
            {links.map((l) => (
              <li key={l.href}>
                <a href={l.href} className="rounded-full px-4 py-2 text-muted transition-colors hover:bg-white/5 hover:text-ink">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/start"
            className="hidden h-10 items-center gap-2 rounded-full bg-ink px-4 text-sm font-semibold text-canvas transition-colors hover:bg-signal-strong sm:inline-flex"
          >
            Open MeritNAMA <Icon name="arrow" className="h-4 w-4" />
          </Link>
          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-full border border-line-strong md:hidden"
            aria-expanded={open}
            aria-controls="site-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            <Icon name={open ? "close" : "menu"} />
          </button>
        </div>
      </div>

      {open ? (
        <nav id="site-menu" aria-label="Site" className="glass mx-auto mt-2 max-w-6xl rounded-3xl p-3 md:hidden">
          <ul className="flex flex-col">
            {links.map((l) => (
              <li key={l.href}>
                <a href={l.href} onClick={() => setOpen(false)} className="block rounded-2xl px-4 py-3 text-muted hover:bg-white/5 hover:text-ink">
                  {l.label}
                </a>
              </li>
            ))}
            <li>
              <Link href="/start" className="mt-1 flex items-center justify-between rounded-2xl bg-ink px-4 py-3 font-semibold text-canvas">
                Open MeritNAMA <Icon name="arrow" className="h-4 w-4" />
              </Link>
            </li>
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
