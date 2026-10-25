import Link from "next/link";
import type { ReactNode } from "react";
import type { Session } from "@/lib/auth/roles";
import type { Section } from "@/lib/navigation";
import { Badge } from "./ui/badge";
import { SideNav } from "./side-nav";

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

export function AppShell({ area, sections, session, children }: { area: string; sections: Section[]; session: Session; children: ReactNode }) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      <SideNav
        area={area}
        sections={sections.map(({ href, label }) => ({ href, label }))}
        brand={
          <Link href="/" className="flex items-center gap-2.5 font-extrabold tracking-tight">
            <BrandMark />
            <span>Merit<span className="text-signal">Nama</span></span>
          </Link>
        }
        footer={
          <div className="flex flex-col gap-2 text-xs text-muted">
            <span className="truncate" title={session.email}>{session.email}</span>
            <span className="flex flex-wrap gap-1.5">
              <Badge>{session.role}</Badge>
              {session.isStub ? <Badge tone="warning">Dev stub</Badge> : null}
            </span>
          </div>
        }
      />
      <main id="main" className="min-w-0 px-4 py-8 sm:px-8 lg:px-10">{children}</main>
    </div>
  );
}
