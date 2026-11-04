import Link from "next/link";
import { notFound } from "next/navigation";
import { AreaPage } from "@/components/area-page";
import { BarList } from "@/components/charts/bar-list";
import { RoundBeam } from "@/components/charts/round-beam";
import { MeritDelta } from "@/components/merit-delta";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/page-header";
import { getSession } from "@/lib/auth/session";
import { getRound, inductionMaxMarks, listInductionsWithRounds, roundFacets, roundGroups, type RoundFilters } from "@/lib/data/merit";
import { getDb } from "@/lib/db/client";
import { formatMarks } from "@/lib/format";

export const metadata = { title: "Merit round" };
export const dynamic = "force-dynamic";

const LIMIT = 400;
const FILTERS = [
  ["program", "Programme"],
  ["quota", "Quota"],
  ["speciality", "Speciality"],
  ["hospital", "Hospital"],
] as const;
const selectClass = "h-10 w-full rounded-xl border border-line-strong bg-canvas px-3 text-sm text-ink";

export default async function RoundPage({ params, searchParams }: {
  params: Promise<{ induction: string; round: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { induction: ri, round: rr } = await params;
  if (!/^\d{1,3}$/.test(ri) || !/^\d{1,2}$/.test(rr)) notFound();
  const induction = Number(ri), roundNo = Number(rr);
  const db = getDb();
  const session = await getSession();
  const round = await getRound(db, session, induction, roundNo);
  if (!round) notFound();

  const sp = await searchParams;
  const facets = await roundFacets(db, session, round.id);
  const filters: RoundFilters = {};
  for (const [k] of FILTERS) {
    const v = sp[k];
    if (typeof v === "string" && (facets[k] as string[]).includes(v)) filters[k] = v;
  }
  const all = await listInductionsWithRounds(db, session);
  const ind = all.find((i) => i.id === induction)!;
  const prevNo = ind.rounds.filter((r) => r.roundNo < roundNo).at(-1)?.roundNo;
  const nextNo = ind.rounds.find((r) => r.roundNo > roundNo)?.roundNo;
  const prev = prevNo ? await getRound(db, session, induction, prevNo) : null;
  const [groups, maxMarks] = await Promise.all([roundGroups(db, session, round.id, prev?.id ?? null, filters), inductionMaxMarks(db)]);
  const max = maxMarks[induction];
  const filtered = Object.keys(filters).length > 0;

  // Busiest specialities in view, for the bar list.
  const bySpec = new Map<string, number>();
  for (const g of groups) bySpec.set(g.speciality, (bySpec.get(g.speciality) ?? 0) + g.allocations);
  const topSpecs = [...bySpec].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const base = `/portal/history/${induction}/rounds/${roundNo}`;

  return (
    <AreaPage
      area="portal"
      trail={[{ label: "Merit lists", href: "/portal/history" }, { label: `Induction ${induction}`, href: `/portal/history/${induction}` }, { label: `Round ${roundNo}` }]}
      title={`Induction ${induction} · round ${roundNo}`}
      description={`${round.cycleName} (${round.cycleCode}) · ${round.allocations.toLocaleString("en-US")} allocations. Closing merit is the lowest marks allocated in each group${max ? `, out of ${max}` : ""}.`}
      status={<StatusPill>{prev ? `Compared with round ${prev.roundNo}` : "First round"}</StatusPill>}
    >
      <Card>
        <RoundBeam rounds={ind.rounds.map((r) => r.roundNo)} current={roundNo} hrefFor={(r) => `/portal/history/${induction}/rounds/${r}`} />
        <form method="get" className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))_auto] xl:items-end">
          {FILTERS.map(([k, label]) => (
            <label key={k} className="grid gap-1.5 text-sm font-medium">
              {label}
              <select name={k} defaultValue={filters[k] ?? ""} className={selectClass}>
                <option value="">All</option>
                {(facets[k] as string[]).map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
          ))}
          <div className="flex gap-2">
            <Button type="submit" variant="secondary">Filter</Button>
            {filtered ? <ButtonLink href={base} variant="ghost">Clear</ButtonLink> : null}
          </div>
        </form>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
          <span aria-live="polite">{groups.length.toLocaleString("en-US")} groups{filtered ? " match" : ""}</span>
          <span className="flex gap-2">
            {prevNo ? <ButtonLink href={`/portal/history/${induction}/rounds/${prevNo}`} variant="ghost" size="sm">← Round {prevNo}</ButtonLink> : null}
            {nextNo ? <ButtonLink href={`/portal/history/${induction}/rounds/${nextNo}`} variant="ghost" size="sm">Round {nextNo} →</ButtonLink> : null}
            {prevNo ? <ButtonLink href={`/portal/history/${induction}/compare?from=${prevNo}&to=${roundNo}`} variant="secondary" size="sm">Compare with round {prevNo}</ButtonLink> : null}
          </span>
        </div>
      </Card>

      {groups.length === 0 ? (
        <EmptyState title="No allocations match these filters" action={<ButtonLink href={base} variant="secondary">Clear filters</ButtonLink>} />
      ) : (
        <>
          {filters.speciality ? null : (
            <Card>
              <CardHeader title="Most allocations" description={filtered ? "Within your filters. Select a speciality to filter by it." : "Select a speciality to filter by it."} />
              <BarList items={topSpecs.map(([label, value]) => ({ label, value, href: `${base}?speciality=${encodeURIComponent(label)}` }))} />
            </Card>
          )}
          <Card>
            <CardHeader title="Closing merit" description={groups.length > LIMIT ? `Showing the first ${LIMIT}; filter to narrow down.` : undefined} />
            <div className="relative overflow-x-auto rounded-2xl border border-line">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Closing merit by programme, quota, speciality and hospital</caption>
                <thead className="bg-elevated text-muted">
                  <tr>
                    <th scope="col" className="px-3 py-3 font-medium">Speciality</th>
                    <th scope="col" className="px-3 py-3 font-medium">Hospital</th>
                    <th scope="col" className="px-3 py-3 font-medium">Programme · quota</th>
                    <th scope="col" className="px-3 py-3 text-right font-medium">Allocated</th>
                    <th scope="col" className="px-3 py-3 text-right font-medium">Closing</th>
                    <th scope="col" className="px-3 py-3 text-right font-medium">vs R{prev?.roundNo ?? "–"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {groups.slice(0, LIMIT).map((g) => (
                    <tr key={`${g.program}|${g.quota}|${g.speciality}|${g.hospital}`} className="hover:bg-surface">
                      <td className="px-3 py-2.5">{g.specialityId ? <Link href={`/portal/explore/specialities/${g.specialityId}`} className="hover:text-signal hover:underline">{g.speciality}</Link> : g.speciality}</td>
                      <td className="px-3 py-2.5 text-muted">{g.hospitalId ? <Link href={`/portal/explore/hospitals/${g.hospitalId}`} className="hover:text-signal hover:underline">{g.hospital}</Link> : g.hospital}</td>
                      <td className="px-3 py-2.5 text-muted">{g.program} · {g.quota}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{g.allocations}</td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">{formatMarks(g.closing)}</td>
                      <td className="px-3 py-2.5 text-right">{prev ? <MeritDelta value={g.prevClosing == null ? null : (g.closing ?? 0) - g.prevClosing} /> : <span className="text-subtle">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </AreaPage>
  );
}
