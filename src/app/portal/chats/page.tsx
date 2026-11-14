import Link from "next/link";
import { ChatList } from "@/components/chats/chat-list";
import { AreaPage } from "@/components/area-page";
import { whenDatabaseDown } from "@/components/database-unavailable";
import { Card, CardHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { discoverGroups, getDmOpen, listBlocked, listChats } from "@/lib/data/chats";
import { getDb } from "@/lib/db/client";
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
      <div className="grid gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <ChatList chats={chats} />
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
