import Link from "next/link";
import Image from "next/image";
import { AreaPage } from "@/components/area-page";
import { PHOTOS } from "@/components/brand-assets";
import { whenDatabaseDown } from "@/components/database-unavailable";
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
    <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
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
      {/* Photograph used once, as the search band: an illustration, not a particular hospital. */}
      <section aria-label="Search hospitals and specialities" className="relative isolate overflow-hidden rounded-xl bg-navy">
        <Image src={PHOTOS.hospital.src} alt="" fill priority sizes="(min-width: 1024px) 1100px, 100vw" className="-z-10 object-cover" style={{ objectPosition: "50% 35%" }} />
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-navy/95 via-navy/75 to-navy/25" />
        <div className="grid gap-4 p-6 sm:p-8 md:max-w-xl">
          <p className="font-serif text-2xl font-semibold leading-tight text-ivory sm:text-[1.7rem]">
            {idx.hospitals.length.toLocaleString("en-US")} hospitals and {idx.specialities.length.toLocaleString("en-US")} specialities, on the same published figures.
          </p>
          <form method="get" role="search" className="flex gap-2">
            <label htmlFor="explore-q" className="sr-only">Search hospitals and specialities</label>
            <input id="explore-q" name="q" defaultValue={q} placeholder="Search, e.g. Mayo or anaesthesia" className="h-11 min-w-0 flex-1 rounded-lg border border-ivory/30 bg-surface px-4 text-sm text-ink placeholder:text-subtle" />
            <button type="submit" className="h-11 rounded-lg bg-gold px-4 text-sm font-semibold text-navy hover:bg-ivory">Search</button>
          </form>
        </div>
      </section>
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
