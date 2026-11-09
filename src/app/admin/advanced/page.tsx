import Link from "next/link";
import { AreaPage } from "@/components/area-page";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/icon";
import { requireSection } from "@/lib/auth/session";
import { pendingChangeCount } from "@/lib/data/changes";
import { getDb } from "@/lib/db/client";
import { adminSections, findSection, sectionsFor } from "@/lib/navigation";

export const metadata = { title: "Advanced" };
export const dynamic = "force-dynamic";

/**
 * Simple mode keeps the admin menu short. The pages that most people use rarely (scoring
 * policies, allocation rules, simulation runs, staged changes, the audit history) live
 * here, one click away. Pro mode lists them in the menu instead.
 */
export default async function AdvancedPage() {
  const session = await requireSection("/admin/advanced");
  const s = findSection("/admin/advanced");
  const pages = sectionsFor(session, adminSections).filter((x) => x.proOnly && x.group === "Advanced");
  const pending = await pendingChangeCount(getDb(), session).catch(() => null);

  return (
    <AreaPage area="admin" trail={[{ label: s.label }]} title={s.label} description={s.description}>
      <ul className="grid gap-4 md:grid-cols-2">
        {pages.map((p) => (
          <li key={p.href}>
            <Link href={p.href} className="mn-lift group flex h-full gap-4 rounded-xl border border-line bg-surface p-5">
              <span aria-hidden className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-tint text-signal"><Icon name={p.icon} /></span>
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2 font-semibold text-heading group-hover:underline">
                  {p.label}
                  {p.href === "/admin/changes" && pending ? <Badge tone="warning">{pending} waiting</Badge> : null}
                </span>
                <span className="mt-1 block text-sm text-muted">{p.description}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Card>
        <p className="text-sm text-muted">Prefer these in the menu? Switch to <span className="font-semibold text-ink">Pro</span> mode from your account menu: the menu then lists every page, in a compact rail.</p>
      </Card>
    </AreaPage>
  );
}
