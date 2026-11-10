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
import Link from "next/link";
import { shortlistAlerts } from "@/lib/data/notifications";
import { peerInterest, peerKey } from "@/lib/data/social";
import { PeerCount } from "@/components/rooms/peer-count";
import { followedPlaces, listSavedViews } from "@/lib/data/workspace";
import { formatUtc } from "@/lib/format";
import { listInbox as listNotices } from "@/lib/data/notifications";
import { buildJourney, seatFlow } from "@/lib/domain/journey";
import { JourneyTimeline } from "@/components/me/journey-timeline";
import { SeatFlowGraph } from "@/components/me/seat-flow";
import { MeRail } from "@/components/me/me-rail";
import { deleteViewAction, setAlertsAction } from "./actions";

export const metadata = { title: "Me" };
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
  const [notes, views, places, alerts, peers] = await Promise.all([
    listNotices(db, session, 12).catch(() => null),listSavedViews(db, session), followedPlaces(db, session), shortlistAlerts(db, session), peerInterest(db, session, { limit: 200 })]);
  const peerOf = new Map(peers.seats.map((p) => [peerKey(p), p.peers]));
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
  const journey = buildJourney(mine?.rows ?? [], (notes?.items ?? []).map((n) => ({ id: n.id, title: n.title, href: n.href, at: n.createdAt, read: n.readAt != null })));
  const flow = seatFlow(mine?.rows ?? []);
  const mePct = marks !== null && total ? (marks / total) * 100 : null;
  const groups = new Map<string, typeof items>();
  for (const x of items) {
    const k = `${x.program} · ${x.quota}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(x);
  }

  return (
    <AreaPage {...frame}>
      <div className="grid gap-5 lg:grid-cols-[13rem_minmax(0,1fr)]">
      <MeRail items={[
        { href: "#seat", label: "My seat", icon: "target" },
        { href: "#journey", label: "My journey", icon: "history", count: journey.rounds.length ? Math.ceil(journey.rounds.length / 2) : undefined },
        { href: "#shortlist", label: "Shortlist", icon: "list", count: items.length || undefined },
        { href: "#saved", label: "Saved views", icon: "folder", count: views.length || undefined },
        { href: "#following", label: "Following", icon: "heart" },
        { href: "#alerts", label: "Alerts", icon: "inbox" },
        { href: "/portal/preferences", label: "Preference list", icon: "calculator" },
        { href: "/portal/profile", label: "My record", icon: "user" },
      ]} />
      <div className="grid min-w-0 content-start gap-5">
      <Card id="seat" className="mn-glow">
        <CardHeader title="My seat" description={flow ? "Your latest allocation, and how close it was." : "Your latest allocation shows here once your account is linked to your merit record."} />
        {flow ? <SeatFlowGraph flow={flow} /> : (
          <ButtonLink href="/portal/profile" size="sm">Link your merit record</ButtonLink>
        )}
      </Card>
      <Card id="journey">
        <CardHeader title="My journey" description="Your rounds, your consent replies and what the app told you, newest first." />
        <div className="grid gap-6 md:grid-cols-2">
          <JourneyTimeline events={journey.rounds} empty="No rounds yet. You will see each round you appear in here." />
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">Notices</p>
            <JourneyTimeline events={journey.notices} empty="No notices yet." />
          </div>
        </div>
      </Card>
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
            <Card key={track} id={track === [...groups.keys()][0] ? "shortlist" : undefined}>
              <CardHeader
                title={track}
                description={`${rows.length} saved ${rows.length === 1 ? "option" : "options"}`}
                action={
                  <div className="flex flex-wrap gap-2">
                    <ButtonLink href={`/portal/finder?track=${encodeURIComponent(`${program}|${quota}`)}`} variant="ghost" size="sm">Check in the finder</ButtonLink>
                    <ButtonLink href="/portal/preferences" size="sm">Make a preference list</ButtonLink>
                  </div>
                }
              />
              <ul className="divide-y divide-line rounded-2xl border border-line">
                {rows.map((x) => {
                  const o = chances.get(`${program}|${quota}|${x.speciality}|${x.hospital}`);
                  return (
                  <li key={`${x.speciality}|${x.hospital}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-sm md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)_auto]">
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">{x.speciality}<PeerCount n={peerOf.get(peerKey(x))} /></span>
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
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card id="saved">
          <CardHeader title={`Saved views${views.length ? ` · ${views.length}` : ""}`} description="Comparisons and finder results you saved, with their filters. Only you see them." />
          {views.length ? (
            <ul className="divide-y divide-line text-sm">
              {views.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="grid min-w-0 gap-0.5">
                    <Link href={v.href} className="truncate font-medium text-signal hover:underline">{v.label}</Link>
                    <span className="text-xs text-subtle">saved {formatUtc(v.createdAt).slice(0, 10)}</span>
                  </span>
                  <form action={deleteViewAction}>
                    <input type="hidden" name="id" value={v.id} />
                    <button type="submit" className="rounded-full px-3 py-1.5 text-xs text-muted hover:bg-hover hover:text-ink">Remove</button>
                  </form>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">Use “Save this view” on the score finder, a round comparison or your preference comparison to keep it here.</p>}
        </Card>
        <Card id="following">
          <CardHeader title="Hospitals and specialities you follow" description="Follow one from its page to see it here and hear about new rounds and questions." />
          {places.hospitals.length || places.specialities.length ? (
            <div className="grid gap-3 text-sm">
              {([["Hospitals", places.hospitals, "hospitals"], ["Specialities", places.specialities, "specialities"]] as const).map(([title, list, path]) => list.length ? (
                <div key={title} className="grid gap-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-subtle">{title}</p>
                  <ul className="flex flex-wrap gap-2">
                    {list.map((x) => <li key={x.id}><Link href={`/portal/explore/${path}/${x.id}`} className="inline-block rounded-full px-3 py-1.5 ring-1 ring-line-strong hover:text-signal">{x.name}</Link></li>)}
                  </ul>
                </div>
              ) : null)}
            </div>
          ) : <p className="text-sm text-muted">You follow none yet. Open a hospital or speciality under Hospitals &amp; specialities and choose Follow.</p>}
        </Card>
      </div>
      <Card id="alerts">
        <CardHeader title="Shortlist alerts" description={alerts ? "When a new merit round is published, your inbox gets the closing merit of every shortlisted seat in it, and how it moved." : "Alerts are off: new rounds will not message you about your shortlist."} />
        <form action={setAlertsAction}>
          <input type="hidden" name="on" value={alerts ? "0" : "1"} />
          <Button type="submit" variant="secondary" size="sm">{alerts ? "Turn alerts off" : "Turn alerts on"}</Button>
        </form>
      </Card>
      </div>
      </div>
    </AreaPage>
  );
}
