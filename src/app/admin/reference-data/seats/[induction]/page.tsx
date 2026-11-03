import { notFound } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getSession } from "@/lib/auth/session";
import { listAllLookups, listSeats, type SeatFilters } from "@/lib/data/reference-data";
import { getDb } from "@/lib/db/client";
import { SeatEditor, SeatImportForm } from "../../forms";

export const metadata = { title: "Seat matrix" };
export const dynamic = "force-dynamic";

const FILTERS = [
  ["programId", "Programme", "programs"],
  ["specialityId", "Speciality", "specialities"],
  ["quotaId", "Quota", "quotas"],
  ["hospitalId", "Hospital", "hospitals"],
] as const;

const selectClass = "w-full rounded-xl border border-line-strong bg-canvas px-3 py-2.5 text-sm text-ink";

export default async function SeatMatrixPage({ params, searchParams }: {
  params: Promise<{ induction: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { induction: raw } = await params;
  if (!/^\d{1,3}$/.test(raw)) notFound();
  const induction = Number(raw);
  const sp = await searchParams;

  const filters: SeatFilters = {};
  for (const [key] of FILTERS) {
    const v = sp[key];
    if (typeof v === "string" && /^\d+$/.test(v)) filters[key] = Number(v);
  }

  const db = getDb();
  const session = await getSession();
  const [all, lines, lookups] = await Promise.all([
    listSeats(db, session, induction),
    listSeats(db, session, induction, filters),
    listAllLookups(db, session),
  ]);
  if (all.length === 0) notFound();

  // Filter choices come from what is actually in this induction's matrix.
  const present = {
    programs: new Set(all.map((r) => r.programId)),
    specialities: new Set(all.map((r) => r.specialityId)),
    quotas: new Set(all.map((r) => r.quotaId)),
    hospitals: new Set(all.map((r) => r.hospitalId)),
  };
  const filtered = Object.keys(filters).length > 0;
  const total = lines.reduce((s, r) => s + r.seats, 0);

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: "Admin workspace", href: "/admin" },
          { label: "Reference data", href: "/admin/reference-data" },
          { label: `Induction ${induction} seats` },
        ]}
        title={`Induction ${induction} seat matrix`}
        description={`${all.length} seat lines · ${all.reduce((s, r) => s + r.seats, 0)} seats. Changes apply immediately and are audited; export to update the public site's file.`}
      />
      <div className="grid gap-5 px-4 pb-10 sm:px-8">
        <Card>
          <form method="get" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))_auto] xl:items-end">
            {FILTERS.map(([key, label, kind]) => (
              <div key={key} className="grid gap-1.5">
                <label htmlFor={`f-${key}`} className="text-sm font-medium">{label}</label>
                <select id={`f-${key}`} name={key} defaultValue={filters[key]?.toString() ?? ""} className={selectClass}>
                  <option value="">All</option>
                  {lookups[kind].filter((o) => present[kind].has(o.id)).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
            ))}
            <div className="flex gap-2">
              <Button type="submit" variant="secondary">Filter</Button>
              {filtered ? <ButtonLink href={`/admin/reference-data/seats/${induction}`} variant="ghost">Clear</ButtonLink> : null}
            </div>
          </form>
          <p className="mt-4 text-sm text-muted" aria-live="polite">
            {filtered ? `${lines.length} of ${all.length} lines match · ${total} seats` : `Showing all ${lines.length} lines`}
          </p>
        </Card>

        {lines.length === 0 ? (
          <EmptyState title="No seat lines match these filters" />
        ) : (
          <SeatEditor induction={induction} lines={lines} lookups={lookups}>
            <div className="mt-3 flex flex-wrap gap-2">
              <ButtonLink href={`/admin/reference-data/export?dataset=seats&induction=${induction}`} variant="secondary" size="sm" prefetch={false}>
                Export induction{induction}_seats.json
              </ButtonLink>
            </div>
          </SeatEditor>
        )}

        <details className="rounded-[1.5rem] border border-line bg-surface p-5">
          <summary className="cursor-pointer font-semibold">Replace this matrix from a file</summary>
          <div className="mt-4"><SeatImportForm defaultInduction={induction} /></div>
        </details>
      </div>
    </>
  );
}
