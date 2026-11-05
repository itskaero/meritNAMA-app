import { AreaPage } from "@/components/area-page";
import { whenDatabaseDown } from "@/components/database-unavailable";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getSession } from "@/lib/auth/session";
import { computeOptions, finderOptions, listShortlist, type FinderOption } from "@/lib/data/finder";
import { myMerit } from "@/lib/data/candidates";
import { ChanceDial } from "@/components/charts/chance-dial";
import { Button } from "@/components/ui/button";
import { selectClass } from "@/components/ui/styles";
import { getDb } from "@/lib/db/client";
import { findSection } from "@/lib/navigation";
import { toggleShortlistAction } from "../finder/actions";

export const metadata = { title: "Workspace" };
export const dynamic = "force-dynamic";

export default async function WorkspacePage({ searchParams }: { searchParams: Promise<{ marks?: string; total?: string }> }) {
  const s = findSection("/portal/workspace");
  const frame = { area: "portal" as const, trail: [{ label: s.label }], title: s.label, description: s.description };
  const down = await whenDatabaseDown(frame);
  if (down) return down;
  const db = getDb();
  const session = await getSession();
  const [items, opts, mine] = await Promise.all([listShortlist(db, session), finderOptions(db, session), myMerit(db, session).catch(() => null)]);
  const sp = await searchParams;
  // Marks for the dials: typed here, else the verified record's latest marks.
  const latestInd = opts.inductions[0];
  const own = mine?.rows[0];
  const typed = Number(sp.marks), typedTotal = Number(sp.total);
  const marks = Number.isFinite(typed) && typed > 0 ? typed : own?.marks ?? null;
  const total = Number.isFinite(typed) && typed > 0
    ? (Number.isFinite(typedTotal) && typedTotal > 0 ? typedTotal : opts.defaultTotal ?? latestInd?.total ?? null)
    : own ? opts.inductions.find((i) => i.id === own.induction)?.total ?? null : null;
  const fromRecord = !(Number.isFinite(typed) && typed > 0) && own;
  // One finder calculation per programme·quota on the shortlist, against the latest induction.
  const chances = new Map<string, FinderOption>();
  if (marks !== null && total && latestInd) {
    const trackKeys = [...new Set(items.map((x) => `${x.program}|${x.quota}`))];
    await Promise.all(trackKeys.map(async (k) => {
      const [program, quota] = k.split("|") as [string, string];
      const r = await computeOptions(db, { induction: latestInd.id, program, quota, marks, total }).catch(() => null);
      for (const o of r?.options ?? []) chances.set(`${k}|${o.speciality}|${o.hospital}`, o);
    }));
  }
  const mePct = marks !== null && total ? (marks / total) * 100 : null;
  const groups = new Map<string, typeof items>();
  for (const x of items) {
    const k = `${x.program} · ${x.quota}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(x);
  }

  return (
    <AreaPage {...frame}>
      {items.length ? (
        <Card>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1.5 text-sm font-medium">Your marks
              <span className="flex items-center gap-2">
                <input name="marks" inputMode="decimal" defaultValue={marks ?? ""} placeholder="e.g. 22.5" className={`${selectClass} w-28 font-mono`} />
                <span className="text-sm text-muted">of</span>
                <input name="total" inputMode="decimal" defaultValue={total ?? ""} aria-label="Out of (total marks)" className={`${selectClass} w-20 font-mono`} />
              </span>
            </label>
            <Button type="submit" variant="secondary">Show my chances</Button>
            <p className="min-w-0 flex-1 text-xs text-subtle">
              {mePct === null ? "Enter your marks to see a chance dial for each saved option." : `${fromRecord ? "From your verified record. " : ""}Each option is compared with induction ${latestInd?.id} (out of ${latestInd?.total}), in percent of total.`}
            </p>
          </form>
        </Card>
      ) : null}
      {items.length === 0 ? (
        <EmptyState title="Your shortlist is empty" action={<ButtonLink href="/portal/finder">Open the score finder</ButtonLink>}>
          Star options in the score finder to save them here. The shortlist will feed the preference planner.
        </EmptyState>
      ) : (
        [...groups].map(([track, rows]) => {
          const [program, quota] = track.split(" · ");
          return (
            <Card key={track}>
              <CardHeader
                title={track}
                description={`${rows.length} saved ${rows.length === 1 ? "option" : "options"}`}
                action={<ButtonLink href={`/portal/finder?track=${encodeURIComponent(`${program}|${quota}`)}`} variant="ghost" size="sm">Check in the finder</ButtonLink>}
              />
              <ul className="divide-y divide-line rounded-2xl border border-line">
                {rows.map((x) => {
                  const o = chances.get(`${program}|${quota}|${x.speciality}|${x.hospital}`);
                  return (
                  <li key={`${x.speciality}|${x.hospital}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-sm md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)_auto]">
                    <span className="min-w-0">
                      <span className="block font-medium">{x.speciality}</span>
                      <span className="block truncate text-muted">{x.hospital}</span>
                    </span>
                    {mePct !== null ? (
                      <div className="col-span-2 row-start-2 min-w-0 md:col-span-1 md:row-start-auto">
                        {o ? <ChanceDial compact mePct={mePct} firstPct={o.firstPct} lastPct={o.lastPct} firstRound={o.firstRound} lastRound={o.lastRound} /> : <p className="text-xs text-subtle">Not offered in induction {latestInd?.id}.</p>}
                      </div>
                    ) : null}
                    <form action={toggleShortlistAction}>
                      <input type="hidden" name="program" value={x.program} />
                      <input type="hidden" name="quota" value={x.quota} />
                      <input type="hidden" name="speciality" value={x.speciality} />
                      <input type="hidden" name="hospital" value={x.hospital} />
                      <button type="submit" className="rounded-full px-3 py-1.5 text-xs text-muted hover:bg-hover hover:text-ink">Remove</button>
                    </form>
                  </li>
                  );
                })}
              </ul>
            </Card>
          );
        })
      )}
    </AreaPage>
  );
}
