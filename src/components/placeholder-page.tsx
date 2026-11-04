import type { ReactNode } from "react";
import { findSection } from "@/lib/navigation";
import { Icon } from "./icon";
import { AreaPage } from "./area-page";
import { StatusPill } from "./ui/page-header";

/** Honest placeholder: states what is planned and that nothing here is live yet. */
export function PlaceholderPage({ href, children }: { href: string; children?: ReactNode }) {
  const s = findSection(href);
  const area = href.startsWith("/admin") ? "admin" : "portal";
  return (
    <AreaPage
      area={area}
      trail={[{ label: s.label }]}
      isRoot={href === `/${area}`}
      title={s.label}
      description={s.description}
      status={
        <>
          <StatusPill tone="warning">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-amber" />
            Not yet integrated
          </StatusPill>
          <StatusPill>{s.milestone}</StatusPill>
        </>
      }
    >
      {children}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <section className="rounded-[1.5rem] border border-line bg-surface p-6">
          <h2 className="text-lg font-semibold">
            Planned scope <span className="text-muted">({s.planned.length})</span>
          </h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {s.planned.map((item) => (
              <li key={item} className="flex items-center gap-2 rounded-lg bg-elevated px-3 py-1.5 text-xs text-muted">
                <span aria-hidden className="h-1 w-1 rounded-full bg-subtle" />
                {item}
              </li>
            ))}
          </ul>
        </section>
        <section className="relative overflow-hidden rounded-[1.5rem] border border-signal/20 bg-[linear-gradient(135deg,#14253a_0%,#14404e_55%,#155f62_100%)] p-6">
          <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-signal/10 blur-3xl" />
          <div className="relative">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-white/10 ring-1 ring-white/20">
              <Icon name="spark" className="h-5 w-5 text-signal-strong" />
            </span>
            <h2 className="mt-4 text-lg font-semibold">Placeholder — no live data</h2>
            <p className="mt-2 max-w-prose text-sm text-ink/90">
              This screen is part of the scaffold. It shows no candidate or induction data until {s.milestone} connects it
              to the validated data layer.
            </p>
          </div>
        </section>
      </div>
    </AreaPage>
  );
}
