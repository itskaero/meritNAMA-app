import Link from "next/link";
import { notFound } from "next/navigation";
import { AreaPage } from "@/components/area-page";
import { ChatList } from "@/components/chats/chat-list";
import { ChatRoom } from "@/components/chats/chat-room";
import { whenDatabaseDown } from "@/components/database-unavailable";
import { getSession } from "@/lib/auth/session";
import { getChat, listChats, listMessages } from "@/lib/data/chats";
import { getDb } from "@/lib/db/client";
import { isUuid } from "@/lib/format";
import { findSection } from "@/lib/navigation";
import { JoinButton, LeaveButton } from "../forms";

export const metadata = { title: "Chat" };
export const dynamic = "force-dynamic";

const initials = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");

/** One chat (docs/mockups/v4/Chats.dc.html): list, conversation, and who it is with. */
export default async function ChatPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const s = findSection("/portal/chats");
  const down = await whenDatabaseDown({ area: "portal", trail: [{ label: s.label, href: s.href }, { label: "Chat" }], title: "Chat", description: s.description });
  if (down) return down;
  const db = getDb();
  const session = await getSession();
  const chat = await getChat(db, session, id);
  if (!chat) notFound();
  // A direct chat is private to its two people.
  if (chat.kind === "dm" && !chat.isMember) notFound();
  const q = ((await searchParams).q ?? "").trim().slice(0, 60);
  const [messages, chats] = await Promise.all([chat.isMember ? listMessages(db, session, id) : Promise.resolve([]), listChats(db, session)]);

  return (
    <AreaPage area="portal" trail={[{ label: s.label, href: s.href }, { label: chat.title }]} title={chat.title} bare>
      <div className="-mx-4 -mb-10 -mt-4 flex min-h-[calc(100dvh-3rem)] flex-col sm:-mx-6 sm:-mt-6 lg:flex-row">
        <div className="hidden border-r border-white/[.06] lg:block lg:w-[270px] lg:flex-none"><ChatList chats={chats} current={chat.id} q={q} /></div>
        <main className="flex min-w-0 flex-1 flex-col [background:radial-gradient(600px_300px_at_70%_0%,rgba(110,86,255,.08),transparent_70%)]">
          <header className="flex items-center justify-between gap-3 border-b border-white/[.06] px-[22px] py-4">
            <div className="min-w-0">
              <h2 className="truncate text-[17px] font-semibold">{chat.title}</h2>
              <p className="mt-0.5 text-xs text-muted">{chat.kind === "dm" ? "Direct · private to the two of you" : <><span className="mn-live text-[#3DDC97]">●</span> {chat.members} {chat.members === 1 ? "member" : "members"}</>}</p>
            </div>
            <span className="lg:hidden"><Link href="/portal/chats" className="mn-ob">All chats</Link></span>
          </header>
          {chat.isMember ? (
            <ChatRoom roomId={chat.id} kind={chat.kind} initial={messages} mayPost={chat.mayPost} muted={chat.muted} otherId={chat.otherId} iBlocked={chat.iBlocked} />
          ) : (
            <div className="m-6 rounded-[20px] border border-line bg-[#17171C] p-5">
              <p className="mb-3 text-sm text-muted">Join this group to read and write in it.</p>
              <JoinButton roomId={chat.id} />
            </div>
          )}
        </main>
        <aside aria-label={chat.kind === "dm" ? "Member" : "Group"} className="hidden flex-col items-center gap-2.5 bg-[#131316] px-5 py-[26px] text-center xl:flex xl:w-[280px] xl:flex-none xl:border-l xl:border-white/[.06]">
          <span aria-hidden className="mn-av !h-[78px] !w-[78px] !text-2xl" style={{ background: chat.kind === "dm" ? "#5B3FF5" : "rgba(61,220,151,.18)", color: chat.kind === "dm" ? "#fff" : "#3DDC97", boxShadow: "0 0 0 4px rgba(110,86,255,.25), 0 0 30px rgba(110,86,255,.5)" }}>{chat.kind === "dm" ? initials(chat.title) : "#"}</span>
          <h2 className="mt-1.5 text-lg font-semibold">{chat.title}</h2>
          <p className="text-xs text-muted">{chat.kind === "dm" ? "Direct chat" : `${chat.members} ${chat.members === 1 ? "member" : "members"}`}</p>
          <div className="mt-3.5 grid w-full gap-3 border-t border-white/[.06] pt-3.5 text-left text-[13px]">
            <p className="text-muted">Mute and block are under the conversation; report beside each message.</p>
            {chat.kind === "group" && chat.isMember ? <LeaveButton roomId={chat.id} /> : null}
          </div>
        </aside>
      </div>
    </AreaPage>
  );
}
