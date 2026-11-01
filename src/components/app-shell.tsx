import type { ReactNode } from "react";
import type { Session } from "@/lib/auth/roles";
import type { Section } from "@/lib/navigation";
import { Badge } from "./ui/badge";
import { SideNav } from "./side-nav";

export { BrandMark } from "./brand";

function initialsOf(session: Session) {
  return session.email.slice(0, 2).toUpperCase();
}

function Avatar({ session, className = "h-10 w-10" }: { session: Session; className?: string }) {
  return (
    <span
      aria-hidden
      className={`${className} grid flex-none place-items-center rounded-full bg-gradient-to-br from-signal-deep via-signal/60 to-amber/70 text-sm font-bold text-ink ring-2 ring-canvas`}
    >
      {initialsOf(session)}
    </span>
  );
}

function ProfileCard({ session }: { session: Session }) {
  return (
    <div className="glass flex items-center gap-3 rounded-2xl p-3">
      <Avatar session={session} />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold" title={session.email}>{session.email}</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-signal/15 px-2 py-px text-[0.68rem] font-bold capitalize text-signal-strong ring-1 ring-signal/30">{session.role}</span>
          {session.isStub ? <Badge tone="warning" className="py-px text-[0.6rem]">Dev stub</Badge> : null}
        </div>
      </div>
    </div>
  );
}

function Greeting({ session }: { session: Session }) {
  const name = session.role === "admin" ? "Admin" : "Doctor";
  return (
    <div>
      <p className="text-2xl font-semibold leading-tight tracking-tight">
        Welcome back,
        <br />
        <span className="bg-gradient-to-r from-ink to-signal-strong bg-clip-text text-transparent">{name}</span>
      </p>
      <p className="mt-1.5 text-xs text-subtle">Plan smarter. Train better. Reach further.</p>
    </div>
  );
}

/**
 * Two-pane layout from the dashboard references: a collapsible sidebar with a greeting,
 * grouped menu and profile card, and the content inside a framed glass panel.
 */
export function AppShell({ area, sections, session, children }: { area: string; sections: Section[]; session: Session; children: ReactNode }) {
  return (
    <div className="relative min-h-screen bg-canvas lg:flex">
      {/* Dusk glow behind everything, echoing the journey artwork. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 bg-[radial-gradient(60%_50%_at_0%_0%,rgba(109,79,224,0.22),transparent_70%),radial-gradient(45%_40%_at_100%_100%,rgba(245,185,122,0.08),transparent_70%)]" />
      <SideNav
        area={area}
        items={sections.map(({ href, label, group, icon }) => ({ href, label, group, icon }))}
        greeting={<Greeting session={session} />}
        profile={<ProfileCard session={session} />}
        profileCompact={
          <span title={session.email}>
            <Avatar session={session} className="h-11 w-11" />
          </span>
        }
        footer={<p className="text-xs text-subtle">{area} · scaffold v0.1</p>}
      />
      <div className="relative min-w-0 flex-1 lg:py-3 lg:pr-3">
        <main
          id="main"
          className="min-h-full lg:min-h-[calc(100vh-1.5rem)] lg:rounded-[1.75rem] lg:border lg:border-line lg:bg-[linear-gradient(180deg,rgba(26,24,55,0.85),rgba(10,9,24,0.9)_45%)] lg:shadow-float"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
