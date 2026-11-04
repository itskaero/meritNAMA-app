import { cookies } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Session } from "@/lib/auth/roles";
import type { Section } from "@/lib/navigation";
import { whatsNew } from "@/lib/data/whats-new";
import { getDb } from "@/lib/db/client";
import { parseUiMode, UI_MODE_COOKIE, WHATS_NEW_COOKIE, type UiMode } from "@/lib/ui-mode";
import { LogoMark, Wordmark } from "./brand";
import { CommandPalette, PaletteButton, type Command } from "./command-palette";
import { ModeToggle } from "./mode-toggle";
import { WhatsNew } from "./whats-new";
import { SideNav, type NavItem } from "./side-nav";
import { Badge } from "./ui/badge";
import { cn } from "./ui/cn";

function ProfileCard({ session, mode }: { session: Session; mode: UiMode }) {
  const initials = session.email.slice(0, 2).toUpperCase();
  const pro = mode === "pro";
  return (
    <div className={cn("flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 shadow-[inset_0_1px_0_rgba(242,246,252,0.04)]", pro && "lg:justify-center lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none")}>
      <span
        title={pro ? `${session.email} · ${session.role}` : undefined}
        className="grid h-10 w-10 flex-none place-items-center rounded-full bg-gradient-to-br from-ember/40 to-elevated text-sm font-bold text-ink ring-1 ring-line-strong"
      >
        <span aria-hidden>{initials}</span>
      </span>
      <div className={cn("min-w-0", pro && "lg:sr-only")}>
        <p className="truncate text-sm font-semibold" title={session.email}>{session.email}</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-ink px-2 py-px text-[0.68rem] font-bold capitalize text-canvas">{session.role}</span>
          {session.isStub ? <Badge tone="warning" className="py-px text-[0.7rem]">Dev stub</Badge> : null}
        </div>
      </div>
    </div>
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
  // "What's new": newest events after the last dismissal; quietly empty if the database is down.
  const seen = Number(jar.get(WHATS_NEW_COOKIE)?.value ?? 0) || 0;
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
    <div data-mode={mode} className={cn("min-h-screen bg-canvas lg:grid", pro ? "lg:grid-cols-[84px_1fr]" : "lg:grid-cols-[272px_1fr]")}>
      <SideNav
        area={area}
        items={items}
        pro={pro}
        brand={
          <Link href="/" className="flex items-center gap-2.5 rounded-lg text-ink" aria-label="meritNAMA home">
            <LogoMark className={pro ? "h-8 w-8" : "h-7 w-7"} />
            <Wordmark className={pro ? "lg:hidden" : undefined} />
          </Link>
        }
        profile={<ProfileCard session={session} mode={mode} />}
        tools={
          <div className={cn("grid gap-2", pro && "lg:justify-items-center")}>
            {pro ? (
              <>
                <PaletteButton compact className="hidden lg:inline-flex" />
                <PaletteButton className="w-full lg:hidden" />
              </>
            ) : <PaletteButton className="w-full" />}
            <ModeToggle mode={mode} compact={pro} />
          </div>
        }
        footer={
          <div className="grid gap-3">
            {news.length ? <div className={cn(pro && "lg:hidden")}><WhatsNew items={news} /></div> : null}
            <p className={cn("text-xs text-subtle", pro && "lg:sr-only")}>{session.isStub ? `${area} · scaffold v0.1` : area}</p>
          </div>
        }
      />
      <div className="min-w-0 lg:py-3 lg:pr-3">
        <main id="main" className="min-h-full bg-canvas lg:min-h-[calc(100vh-1.5rem)] lg:rounded-[1.75rem] lg:border lg:border-line lg:bg-[linear-gradient(180deg,var(--mn-navy-900),var(--mn-navy-950)_40%)]">
          {children}
        </main>
      </div>
      <CommandPalette commands={palette} />
    </div>
  );
}
