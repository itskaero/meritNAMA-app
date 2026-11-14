import Link from "next/link";
import { ChatList } from "@/components/chats/chat-list";
import { AreaPage } from "@/components/area-page";
import { whenDatabaseDown } from "@/components/database-unavailable";
import { getSession } from "@/lib/auth/session";
import { mayPost } from "@/lib/data/candidates";
import { discoverGroups, getDmOpen, listBlocked, listChats } from "@/lib/data/chats";
import { getDb } from "@/lib/db/client";
import { findSection } from "@/lib/navigation";
import { BlockedList } from "./blocked";
import { DmToggle, NewGroupForm } from "./forms";

export const metadata = { title: "Chats" };
export const dynamic = "force-dynamic";

/** Chats (docs/mockups/v4/Chats.dc.html) with no chat open: the list, and starting or joining one. */
export default async function ChatsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const s = findSection("/portal/chats");
  const down = await whenDatabaseDown({ area: "portal", trail: [{ label: s.label }], title: s.label, description: s.description });
  if (down) return down;
  const db = getDb();
  const session = await getSession();
  const q = ((await searchParams).q ?? "").trim().slice(0, 60);
  const [chats, groups, dmOpen, blocked, may] = await Promise.all([listChats(db, session), discoverGroups(db, session), getDmOpen(db, session), listBlocked(db, session), mayPost(db, session)]);

  return (
    <AreaPage area="portal" trail={[{ label: s.label }]} title={s.label} bare>
      <div className="-mx-4 -mb-10 -mt-4 flex min-h-[calc(100dvh-3rem)] flex-col sm:-mx-6 sm:-mt-6 lg:flex-row">
        <div className="border-b border-white/[.06] lg:w-[270px] lg:flex-none lg:border-b-0 lg:border-r"><ChatList chats={chats} q={q} /></div>
        <main className="grid min-w-0 flex-1 content-start gap-5 p-6 [background:radial-gradient(600px_300px_at_70%_0%,rgba(110,86,255,.08),transparent_70%)]">
          <div><h2 className="text-[17px] font-semibold">Start or join a chat</h2><p className="mt-0.5 text-xs text-muted">Round rooms are on each round&apos;s page; Community has the questions.</p></div>
          <section className="mn-card-glass rounded-[20px] border border-line p-5">
            <h3 className="text-[15px] font-semibold text-heading">Start a group</h3>
            <p className="mb-3 mt-0.5 text-xs text-muted">Members of a group can read and write once they join.</p>
            {may ? <NewGroupForm /> : <p className="text-sm text-muted">Starting and joining chats opens once you <Link href="/portal/profile" className="text-[#A797FF]">link your merit record</Link>.</p>}
          </section>
          <section className="mn-card-glass rounded-[20px] border border-line p-5">
            <h3 className="text-[15px] font-semibold text-heading">Groups to join</h3>
            {groups.length === 0 ? <p className="mt-2 text-sm text-muted">No other groups yet.</p> : (
              <ul className="mt-2 grid gap-1">
                {groups.map((g) => <li key={g.id}><Link href={`/portal/chats/${g.id}`} className="flex items-center justify-between gap-3 rounded-xl px-2.5 py-2 hover:bg-white/[.04]"><span className="truncate text-sm font-medium">{g.name}</span><span className="text-xs text-muted">{g.members} people</span></Link></li>)}
              </ul>
            )}
          </section>
        </main>
        <aside aria-label="Privacy" className="grid content-start gap-4 border-t border-white/[.06] bg-[#131316] px-5 py-[26px] lg:w-[280px] lg:flex-none lg:border-l lg:border-t-0">
          <h2 className="text-[15px] font-semibold">Privacy</h2>
          <DmToggle open={dmOpen} />
          <BlockedList blocked={blocked} />
        </aside>
      </div>
    </AreaPage>
  );
}
