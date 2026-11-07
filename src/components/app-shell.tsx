import { cookies } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";
import { signOutAction } from "@/app/_actions/auth";
import { ROLE_LABELS, type Session } from "@/lib/auth/roles";
import { myLink } from "@/lib/data/candidates";
import { unreadCount } from "@/lib/data/notifications";
import { Icon } from "./icon";
import type { Section } from "@/lib/navigation";
import { whatsNew } from "@/lib/data/whats-new";
import { getDb } from "@/lib/db/client";
import { parseTheme, parseUiMode, THEME_COOKIE, UI_MODE_COOKIE, WHATS_NEW_COOKIE, type Theme, type UiMode } from "@/lib/ui-mode";
import { LogoMark, Wordmark } from "./brand";
import { CommandPalette, PaletteButton, type Command } from "./command-palette";
import { ModeToggle } from "./mode-toggle";
import { ThemeToggle } from "./theme-toggle";
import { WhatsNew } from "./whats-new";
import { SideNav, type NavItem } from "./side-nav";
import { cn } from "./ui/cn";

/**
 * The account row at the foot of the sidebar: who is signed in, and a menu (opening
 * upward) with the colour theme, interface mode and sign out. A <details> element, so
 * it works before scripts load.
 */
function AccountMenu({ session, mode, theme, verified }: { session: Session; mode: UiMode; theme: Theme; verified: boolean }) {
  const initials = session.email.slice(0, 2).toUpperCase();
  const pro = mode === "pro";
  return (
    <details className="group relative">
      <summary
        className={cn("flex min-h-12 cursor-pointer list-none items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-hover [&::-webkit-details-marker]:hidden", pro && "lg:justify-center lg:px-0")}
        title={pro ? `${session.email} · ${ROLE_LABELS[session.role]}` : undefined}
      >
        <span aria-hidden className="grid h-8 w-8 flex-none place-items-center rounded-full bg-navy text-xs font-semibold text-ivory">{initials}</span>
        <span className={cn("min-w-0 flex-1", pro && "lg:sr-only")}>
          <span className="block truncate text-sm font-medium text-ink">{session.email}</span>
          <span className="flex items-center gap-1.5 text-xs text-muted">
            {ROLE_LABELS[session.role]}
            {verified ? <span className="inline-flex items-center gap-0.5 text-success"><Icon name="check" className="h-3 w-3" />Verified</span> : null}
            {session.isStub ? <span className="text-amber">· dev stub</span> : null}
          </span>
        </span>
        <Icon name="more" className={cn("h-4 w-4 text-decor", pro && "lg:hidden")} />
        <span className="sr-only">Account menu</span>
      </summary>
      <div className={cn("absolute bottom-full z-40 mb-2 grid w-64 gap-3 rounded-xl border border-line bg-surface p-3 shadow-[var(--mn-shadow-2)]", pro ? "left-0 lg:left-full lg:bottom-0 lg:mb-0 lg:ml-2" : "left-0")}>
        <div className="grid gap-1.5">
          <p className="text-xs font-semibold text-muted">Theme</p>
          <ThemeToggle theme={theme} />
        </div>
        <div className="grid gap-1.5">
          <p className="text-xs font-semibold text-muted">Interface</p>
          <ModeToggle mode={mode} />
        </div>
        {session.isStub ? null : (
          <form action={signOutAction} className="border-t border-line pt-2">
            <button type="submit" className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-ink hover:bg-hover">
              <Icon name="logout" className="h-4 w-4 text-decor" />Sign out
            </button>
          </form>
        )}
      </div>
    </details>
  );
}

/**
 * Two-pane layout: a sidebar (labelled in Simple mode, an icon rail in Pro mode on
 * wide screens) and the content inside a framed panel. The mode comes from a cookie
 * so the server renders the right layout; Ctrl/⌘K opens the jump palette in both modes.
 */
export async function AppShell({ area, sections, links = [], commands = [], session, children }: {
  area: string;
  sections: Section[];
  /** Extra sidebar links that are not sections of this area (e.g. admin → candidate portal). */
  links?: NavItem[];
  /** Extra palette entries beyond the sidebar items (quick actions). */
  commands?: Command[];
  session: Session;
  children: ReactNode;
}) {
  const jar = await cookies();
  const mode = parseUiMode(jar.get(UI_MODE_COOKIE)?.value);
  const theme = parseTheme(jar.get(THEME_COOKIE)?.value);
  // "What's new": newest events after the last dismissal; quietly empty if the database is down.
  const seen = Number(jar.get(WHATS_NEW_COOKIE)?.value ?? 0) || 0;
  const verified = session.role === "candidate" && (await myLink(getDb(), session).catch(() => null))?.status === "verified";
  const unread = await unreadCount(getDb(), session).catch(() => 0);
  const news = (await whatsNew(getDb(), session).catch(() => []))
    .filter((n) => n.at.getTime() > seen)
    .map((n) => ({ text: n.text, href: n.href, at: n.at.toISOString() }));
  const pro = mode === "pro";
  const items: NavItem[] = [...sections.map(({ href, label, group, icon }) => ({ href, label, group, icon })), ...links];
  const palette: Command[] = [
    ...items.map((i) => ({ label: i.label, hint: i.group, href: i.href, icon: i.icon })),
    ...commands,
  ];

  return (
    <div data-mode={mode} className={cn("min-h-screen bg-canvas lg:grid", pro ? "lg:grid-cols-[72px_1fr]" : "lg:grid-cols-[256px_1fr]")}>
      <SideNav
        area={area}
        items={items}
        pro={pro}
        brand={
          <Link href="/" className="flex items-center gap-2.5 rounded-md text-heading" aria-label="meritNAMA home">
            <LogoMark className={pro ? "h-7 w-7" : "h-6 w-6"} />
            <Wordmark className={pro ? "lg:hidden" : undefined} />
          </Link>
        }
        bell={
          <Link
            href="/portal/inbox"
            aria-label={unread ? `Inbox, ${unread} unread` : "Inbox"}
            className="relative grid h-11 w-11 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink lg:h-9 lg:w-9"
          >
            <Icon name="bell" className="h-5 w-5" />
            {unread ? (
              <span aria-hidden className="absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-signal px-1 text-[0.6rem] font-bold text-signal-ink">
                {unread > 99 ? "99+" : unread}
              </span>
            ) : null}
          </Link>
        }
        tools={pro ? <><PaletteButton compact className="hidden lg:inline-flex" /><PaletteButton className="w-full lg:hidden" /></> : <PaletteButton className="w-full" />}
        profile={<AccountMenu session={session} mode={mode} theme={theme} verified={verified} />}
      />
      <div className="min-w-0">
        <main id="main" className="min-h-screen bg-canvas">
          {news.length ? <WhatsNew items={news} /> : null}
          {children}
        </main>
      </div>
      <CommandPalette commands={palette} />
    </div>
  );
}
