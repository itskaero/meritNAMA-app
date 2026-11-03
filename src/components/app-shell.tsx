import Link from "next/link";
import type { ReactNode } from "react";
import type { Session } from "@/lib/auth/roles";
import type { Section } from "@/lib/navigation";
import { Badge } from "./ui/badge";
import { SideNav, type NavItem } from "./side-nav";

export function BrandMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" aria-hidden className={`${className} text-signal`}>
      <rect x="3" y="18" width="5" height="10" rx="1.5" opacity=".55" />
      <rect x="10" y="12" width="5" height="16" rx="1.5" opacity=".75" />
      <rect x="17" y="7" width="5" height="21" rx="1.5" />
      <path d="M24 4h5v5M29 4l-6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ProfileCard({ session }: { session: Session }) {
  const initials = session.email.slice(0, 2).toUpperCase();
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 shadow-[inset_0_1px_0_rgba(242,246,252,0.04)]">
      <span aria-hidden className="grid h-10 w-10 flex-none place-items-center rounded-full bg-gradient-to-br from-signal/30 to-elevated text-sm font-bold text-ink ring-1 ring-line-strong">
        {initials}
      </span>
      <div className="min-w-0">
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
 * Two-pane layout from the dashboard references: a quiet sidebar with a profile
 * card and grouped menu, and the content inside a framed panel with a breadcrumb bar.
 */
export function AppShell({ area, sections, links = [], session, children }: {
  area: string;
  sections: Section[];
  /** Extra sidebar links that are not sections of this area (e.g. admin → candidate portal). */
  links?: NavItem[];
  session: Session;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-canvas lg:grid lg:grid-cols-[272px_1fr]">
      <SideNav
        area={area}
        items={[...sections.map(({ href, label, group, icon }) => ({ href, label, group, icon })), ...links]}
        brand={
          <Link href="/" className="flex items-center gap-2.5 font-extrabold tracking-tight">
            <BrandMark />
            <span>Merit<span className="text-signal">Nama</span></span>
          </Link>
        }
        profile={<ProfileCard session={session} />}
        footer={<p className="text-xs text-subtle">{session.isStub ? `${area} · scaffold v0.1` : area}</p>}
      />
      <div className="min-w-0 lg:py-3 lg:pr-3">
        <main id="main" className="min-h-full bg-canvas lg:min-h-[calc(100vh-1.5rem)] lg:rounded-[1.75rem] lg:border lg:border-line lg:bg-[linear-gradient(180deg,var(--mn-navy-900),var(--mn-navy-950)_40%)]">
          {children}
        </main>
      </div>
    </div>
  );
}
