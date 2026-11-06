import Link from "next/link";
import { AreaPage } from "@/components/area-page";
import { whenDatabaseDown } from "@/components/database-unavailable";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { selectClass } from "@/components/ui/styles";
import { getSession } from "@/lib/auth/session";
import { finderOptions, listShortlist } from "@/lib/data/finder";
import { listMyLists } from "@/lib/data/preferences";
import { getDb } from "@/lib/db/client";
import { LIST_LIMITS } from "@/lib/domain/preferences";
import { formatUtc } from "@/lib/format";
import { findSection } from "@/lib/navigation";
import { NewListForm } from "./forms";

export const metadata = { title: "Preference planner" };
export const dynamic = "force-dynamic";

export default async function PreferencesPage() {
  const s = findSection("/portal/preferences");
  const frame = { area: "portal" as const, trail: [{ label: s.label }], title: s.label, description: s.description };
  const down = await whenDatabaseDown(frame);
  if (down) return down;
  const db = getDb();
  const session = await getSession();
  const [lists, opts, shortlist] = await Promise.all([listMyLists(db, session), finderOptions(db, session), listShortlist(db, session)]);
  const tracks = (opts.inductions[0]?.tracks ?? []).map((t) => ({ value: `${t.program}|${t.quota}`, label: `${t.program} · ${t.quota}` }));
  const counts: Record<string, number> = {};
  for (const x of shortlist) counts[`${x.program}|${x.quota}`] = (counts[`${x.program}|${x.quota}`] ?? 0) + 1;
  const defaultTrack = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? tracks[0]?.value ?? "";

  return (
    <AreaPage {...frame}>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card className="min-w-0">
          <CardHeader title="Your lists" description={`Private drafts, up to ${LIST_LIMITS.lists}. Each is checked against the latest induction's closing merit.`} />
          {lists.length === 0 ? (
            <p className="text-sm text-muted">No lists yet. Create one, starting from your shortlist if you have one.</p>
          ) : (
            <ul className="divide-y divide-line">
              {lists.map((l) => (
                <li key={l.id}>
                  <Link href={`/portal/preferences/${l.id}`} className="flex items-center justify-between gap-3 rounded-xl px-2 py-3 hover:bg-hover">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{l.name}</span>
                      <span className="block text-xs text-muted">{l.program} · {l.quota} · {l.items} {l.items === 1 ? "option" : "options"}</span>
                    </span>
                    <span className="flex-none text-xs text-subtle">{formatUtc(l.updatedAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {lists.length >= 2 ? (
            <form method="get" action="/portal/preferences/compare" className="mt-5 flex flex-wrap items-end gap-2 border-t border-line pt-4">
              <label className="grid min-w-0 flex-1 gap-1.5 text-sm font-medium">Compare
                <select name="a" defaultValue={lists[0]!.id} className={selectClass}>{lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
              </label>
              <label className="grid min-w-0 flex-1 gap-1.5 text-sm font-medium">with
                <select name="b" defaultValue={lists[1]!.id} className={selectClass}>{lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
              </label>
              <Button type="submit" variant="secondary">Compare</Button>
            </form>
          ) : null}
        </Card>
        <Card className="min-w-0 content-start">
          <CardHeader title="New list" description="One list per programme and quota, in the order you would submit to PHF." />
          {tracks.length ? <NewListForm tracks={tracks} defaultTrack={defaultTrack} shortlistCounts={counts} /> : <p className="text-sm text-muted">Needs imported merit rounds first.</p>}
        </Card>
      </div>
      <Card>
        <CardHeader title="How the planner reads a list" />
        <ul className="grid list-disc gap-1.5 pl-5 text-sm text-muted">
          <li>PHF places candidates in merit order, each into the highest preference whose closing their merit reaches.</li>
          <li>So the first <strong className="text-success">Safe</strong> option is where you most likely land. <strong className="text-amber">Borderline</strong> options above it can still come in later rounds.</li>
          <li>Options below the first Safe one are unlikely to be used, and a list with no Safe option risks no placement at all.</li>
          <li>Closings change every cycle, so treat this as a planning aid. It is not an official submission.</li>
        </ul>
      </Card>
    </AreaPage>
  );
}
