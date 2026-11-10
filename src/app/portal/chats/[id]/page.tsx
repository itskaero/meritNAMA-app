import { notFound } from "next/navigation";
import { AreaPage } from "@/components/area-page";
import { ChatRoom } from "@/components/chats/chat-room";
import { whenDatabaseDown } from "@/components/database-unavailable";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { getChat, listMessages } from "@/lib/data/chats";
import { getDb } from "@/lib/db/client";
import { isUuid } from "@/lib/format";
import { findSection } from "@/lib/navigation";
import { JoinButton, LeaveButton } from "../forms";

export const metadata = { title: "Chat" };
export const dynamic = "force-dynamic";

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
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
  const messages = chat.isMember ? await listMessages(db, session, id) : [];

  return (
    <AreaPage
      area="portal"
      trail={[{ label: s.label, href: s.href }, { label: chat.title }]}
      title={chat.title}
      description={chat.kind === "dm" ? "A private chat between two people." : `${chat.members} ${chat.members === 1 ? "person" : "people"} in this group.`}
      status={chat.kind === "group" ? <Badge tone="historical">Group</Badge> : <Badge tone="official">Direct</Badge>}
    >
      {chat.isMember ? (
        <>
          <ChatRoom roomId={chat.id} kind={chat.kind} initial={messages} mayPost={chat.mayPost} muted={chat.muted} otherId={chat.otherId} iBlocked={chat.iBlocked} />
          {chat.kind === "group" ? <p><LeaveButton roomId={chat.id} /></p> : null}
        </>
      ) : (
        <Card>
          <p className="mb-3 text-sm text-muted">Join this group to read and write in it.</p>
          <JoinButton roomId={chat.id} />
        </Card>
      )}
    </AreaPage>
  );
}
