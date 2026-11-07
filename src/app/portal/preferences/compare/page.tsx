import { SaveView } from "@/components/workspace/save-view";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AreaPage } from "@/components/area-page";
import { StatusPill } from "@/components/finder/status";
import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { getSession } from "@/lib/auth/session";
import { getList } from "@/lib/data/preferences";
import { getDb } from "@/lib/db/client";
import { UserFacingError } from "@/lib/errors";
import { isUuid } from "@/lib/format";

export const metadata = { title: "Compare preference lists" };
export const dynamic = "force-dynamic";

/** Two of your lists side by side: likely outcome of each, and where shared options sit. */
export default async function ComparePage({ searchParams }: { searchParams: Promise<{ a?: string; b?: string }> }) {
  const { a, b } = await searchParams;
  if (!isUuid(a) || !isUuid(b)) notFound();
  const db = getDb(), session = await getSession();
  const load = (id: string) => getList(db, session, id).catch((e) => (e instanceof UserFacingError ? null : Promise.reject(e)));
  const [A, B] = await Promise.all([load(a), load(b)]);
  if (!A || !B) notFound();
  const k = (r: { speciality: string; hospital: string }) => `${r.speciality}|${r.hospital}`;
  const rankIn = (v: NonNullable<typeof A>) => new Map(v.rows.map((r) => [k(r), r.position]));
  const ra = rankIn(A), rb = rankIn(B);

  const column = (v: NonNullable<typeof A>, other: Map<string, number>) => (
    <Card className="min-w-0 content-start">
      <CardHeader title={<Link href={`/portal/preferences/${v.list.id}`} className="hover:underline">{v.list.name}</Link>} description={`${v.list.program} · ${v.list.quota}`} />
      <p className="mb-4 rounded-xl border border-signal/30 bg-signal/[0.05] p-3 text-sm font-semibold">{v.summary}</p>
      <ol className="grid gap-1.5">
        {v.rows.map((r) => {
          const there = other.get(k(r));
          return (
            <li key={k(r)} className={cn("grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-2 rounded-xl border px-2.5 py-2 text-sm", v.analysis.likely === r.position ? "border-success/60" : "border-line", v.analysis.unreached.includes(r.position) && "opacity-55")}>
              <span className="font-mono text-xs font-semibold">{r.position}</span>
              <span className="min-w-0">
                <span className="block truncate">{r.speciality}</span>
                <span className="block truncate text-xs text-muted">{r.hospital}{there ? <span className="ml-1 text-signal">· #{there} in the other list</span> : <span className="ml-1 text-subtle">· only here</span>}</span>
              </span>
              {r.status ? <StatusPill status={r.status} /> : <span className="text-xs text-subtle">—</span>}
            </li>
          );
        })}
      </ol>
    </Card>
  );

  return (
    <AreaPage area="portal" trail={[{ label: "Preference planner", href: "/portal/preferences" }, { label: "Compare" }]} title="Compare lists" description="Each list's likely outcome, and where the same option sits in the other list.">
      <div><SaveView href={`/portal/preferences/compare?a=${A.list.id}&b=${B.list.id}`} label={`${A.list.name} vs ${B.list.name}`} /></div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">{column(A, rb)}{column(B, ra)}</div>
    </AreaPage>
  );
}
