import Link from "next/link";
import { AreaPage } from "@/components/area-page";
import { whenDatabaseDown } from "@/components/database-unavailable";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getSession } from "@/lib/auth/session";
import { discoverGroups, getDmOpen, listBlocked, listChats } from "@/lib/data/chats";
import { getDb } from "@/lib/db/client";
import { unreadLabel } from "@/lib/domain/chats";
import { findSection } from "@/lib/navigation";
import { mayPost } from "@/lib/data/candidates";
import { DmToggle, NewGroupForm } from "./forms";
import { BlockedList } from "./blocked";

export const metadata = { title: "Chats" };
export const dynamic = "force-dynamic";

export default async function ChatsPage() {
  const s = findSection("/portal/chats");
  const down = await whenDatabaseDown({ area: "portal", trail: [{ label: s.label }], title: s.label, description: s.description });
  if (down) return down;
  const db = getDb();
  const session = await getSession();
  const [chats, groups, dmOpen, blocked, may] = await Promise.all([
    listChats(db, session),
    discoverGroups(db, session),
    getDmOpen(db, session),
    listBlocked(db, session),
    mayPost(db, session),
  ]);

  return (
    <AreaPage area="portal" trail={[{ label: s.label }]} title={s.label} description={s.description}>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card className="min-w-0">
          <CardHeader title="Your chats" description="Round rooms are on each round's page; Community has the questions." />
          {chats.length === 0 ? (
            <EmptyState title="No chats yet">Start a group, join one from the list, or press Message beside someone&apos;s name in a group.</EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {chats.map((c) => (
                <li key={c.id}>
                  <Link href={`/portal/chats/${c.id}`} className="mn-lift flex items-center gap-3 rounded-lg px-2 py-3 hover:bg-hover">
                    <span aria-hidden className="grid h-10 w-10 flex-none place-items-center rounded-full bg-tint font-semibold text-signal">{c.title.slice(0, 1).toUpperCase()}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-semibold text-heading">{c.title}</span>
                        {c.kind === "group" ? <Badge tone="historical">{c.members} people</Badge> : null}
                      </span>
                      <span className="block truncate text-sm text-muted">{c.lastBody ?? "No messages yet"}</span>
                    </span>
                    {c.unread > 0 && !c.muted ? <span className="grid h-6 min-w-6 place-items-center rounded-full bg-action px-1.5 text-xs font-semibold text-action-ink" aria-label={`${c.unread} unread`}>{unreadLabel(c.unread)}</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="grid content-start gap-5">
          <Card>
            <CardHeader title="Start a group" description="Members of a group can read and write once they join." />
            {may ? <NewGroupForm /> : <p className="text-sm text-muted">Starting and joining chats opens once you <Link href="/portal/profile" className="text-signal hover:underline">link your merit record</Link>.</p>}
          </Card>
          <Card>
            <CardHeader title="Groups to join" />
            {groups.length === 0 ? <p className="text-sm text-muted">No other groups yet.</p> : (
              <ul className="grid gap-1">
                {groups.map((g) => (
                  <li key={g.id}><Link href={`/portal/chats/${g.id}`} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-hover"><span className="truncate text-sm font-medium text-heading">{g.name}</span><span className="text-xs text-muted">{g.members} people</span></Link></li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Privacy" />
            <div className="grid gap-4">
              <DmToggle open={dmOpen} />
              <BlockedList blocked={blocked} />
            </div>
          </Card>
        </div>
      </div>
    </AreaPage>
  );
}
