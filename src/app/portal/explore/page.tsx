import Link from "next/link";
import { AreaPage } from "@/components/area-page";
import { whenDatabaseDown } from "@/components/database-unavailable";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { exploreIndex } from "@/lib/data/merit";
import { getDb } from "@/lib/db/client";
import { nameKey } from "@/lib/domain/merit-round";
import { findSection } from "@/lib/navigation";

export const metadata = { title: "Hospitals & specialities" };
export const dynamic = "force-dynamic";

function List({ items, base, empty }: { items: { id: number; name: string; allocations: number }[]; base: string; empty: string }) {
  if (!items.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="grid gap-1.5 sm:grid-cols-2">
      {items.map((i) => (
        <li key={i.id}>
          <Link href={`${base}/${i.id}`} className="flex items-baseline justify-between gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-elevated">
            <span className="min-w-0 truncate">{i.name}</span>
            <span className="flex-none font-mono text-xs text-subtle">{i.allocations ? i.allocations.toLocaleString("en-US") : "—"}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function ExplorePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const s = findSection("/portal/explore");
  const { q = "" } = await searchParams;
  const down = await whenDatabaseDown({ area: "portal", trail: [{ label: s.label }], title: s.label, description: s.description });
  if (down) return down;
  const idx = await exploreIndex(getDb(), await getSession());
  const key = nameKey(q);
  const match = (n: string) => !key || nameKey(n).includes(key);

  return (
    <AreaPage area="portal" trail={[{ label: s.label }]} title={s.label} description={s.description}>
      <form method="get" role="search" className="flex max-w-xl gap-2">
        <label htmlFor="explore-q" className="sr-only">Search hospitals and specialities</label>
        <input id="explore-q" name="q" defaultValue={q} placeholder="Search, e.g. Mayo or anaesthesia" className="h-11 flex-1 rounded-full border border-line-strong bg-canvas px-4 text-sm text-ink placeholder:text-subtle" />
        <Button type="submit" variant="secondary">Search</Button>
      </form>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Specialities" description="Number = allocations across all imported rounds." />
          <List items={idx.specialities.filter((x) => match(x.name))} base="/portal/explore/specialities" empty="No speciality matches." />
        </Card>
        <Card>
          <CardHeader title="Hospitals" />
          <List items={idx.hospitals.filter((x) => match(x.name))} base="/portal/explore/hospitals" empty="No hospital matches." />
        </Card>
      </div>
    </AreaPage>
  );
}
