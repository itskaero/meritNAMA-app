import { AreaPage } from "@/components/area-page";
import { whenDatabaseDown } from "@/components/database-unavailable";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getSession } from "@/lib/auth/session";
import { listShortlist } from "@/lib/data/finder";
import { getDb } from "@/lib/db/client";
import { findSection } from "@/lib/navigation";
import { toggleShortlistAction } from "../finder/actions";

export const metadata = { title: "Workspace" };
export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const s = findSection("/portal/workspace");
  const frame = { area: "portal" as const, trail: [{ label: s.label }], title: s.label, description: s.description };
  const down = await whenDatabaseDown(frame);
  if (down) return down;
  const items = await listShortlist(getDb(), await getSession());
  const groups = new Map<string, typeof items>();
  for (const x of items) {
    const k = `${x.program} · ${x.quota}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(x);
  }

  return (
    <AreaPage {...frame}>
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
                {rows.map((x) => (
                  <li key={`${x.speciality}|${x.hospital}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <span className="min-w-0">
                      <span className="block font-medium">{x.speciality}</span>
                      <span className="block truncate text-muted">{x.hospital}</span>
                    </span>
                    <form action={toggleShortlistAction}>
                      <input type="hidden" name="program" value={x.program} />
                      <input type="hidden" name="quota" value={x.quota} />
                      <input type="hidden" name="speciality" value={x.speciality} />
                      <input type="hidden" name="hospital" value={x.hospital} />
                      <button type="submit" className="rounded-full px-3 py-1.5 text-xs text-muted hover:bg-hover hover:text-ink">Remove</button>
                    </form>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })
      )}
    </AreaPage>
  );
}
