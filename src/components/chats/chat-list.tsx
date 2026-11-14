import Link from "next/link";
import type { listChats } from "@/lib/data/chats";
import { cn } from "../ui/cn";

type Chat = Awaited<ReturnType<typeof listChats>>[number];

const initials = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
const AV = ["#5B3FF5", "#176B67", "#8C5426", "#263C4D"];
const GROUP = [["rgba(61,220,151,.18)", "#3DDC97"], ["rgba(155,135,255,.18)", "#C4B8FF"], ["rgba(92,225,230,.14)", "#5CE1E6"]] as const;

/** The chat list pane (docs/mockups/v4/Chats.dc.html): rooms, then direct chats, the open one lit. */
export function ChatList({ chats, current, q = "" }: { chats: Chat[]; current?: string; q?: string }) {
  const shown = q ? chats.filter((c) => c.title.toLowerCase().includes(q.toLowerCase())) : chats;
  const groups = shown.filter((c) => c.kind === "group");
  const direct = shown.filter((c) => c.kind !== "group");
  const row = (c: Chat, i: number) => {
    const on = c.id === current;
    const tone = GROUP[i % GROUP.length]!;
    return (
      <Link key={c.id} href={`/portal/chats/${c.id}`} aria-current={on ? "page" : undefined}
        className={cn("flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition-colors", on ? "text-white [background:linear-gradient(90deg,rgba(255,255,255,.05)_40%,rgba(110,86,255,.38))] shadow-[inset_-3px_0_0_#7B61FF,0_0_24px_rgba(110,86,255,.18)]" : "text-[#B9B9C2] hover:bg-white/[.04]")}>
        <span aria-hidden className="mn-av" style={c.kind === "group" ? { background: tone[0], color: tone[1] } : { background: AV[i % AV.length] }}>{c.kind === "group" ? "#" : initials(c.title)}</span>
        <span className="min-w-0 flex-1">
          <b className={cn("block truncate", !on && "font-medium")}>{c.title}</b>
          <span className="block truncate text-xs text-muted">{c.lastBody ?? (c.kind === "group" ? `${c.members} ${c.members === 1 ? "person" : "people"}` : "No messages yet")}</span>
        </span>
        {c.unread > 0 && !c.muted ? <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#6E56FF] px-1 text-[11px] font-bold text-white shadow-[0_0_12px_rgba(110,86,255,.7)]" aria-label={`${c.unread} unread`}>{c.unread > 99 ? "99+" : c.unread}</span> : null}
      </Link>
    );
  };
  const label = (t: string) => <p className="mx-3 mb-1.5 mt-4 text-[11px] uppercase tracking-[.06em] text-muted">{t}</p>;
  return (
    <nav aria-label="Your chats" className="flex h-full flex-col bg-[#131316] px-3 py-5">
      <div className="flex items-center justify-between px-2 pb-3">
        <h1 className="text-xl font-bold">Chats</h1>
        <Link href="/portal/chats" aria-label="Start or join a chat" className="mn-ob !w-[34px] !px-0">+</Link>
      </div>
      <form method="get" action={current ? `/portal/chats/${current}` : "/portal/chats"} role="search" className="mx-1 flex h-[38px] items-center gap-2 rounded-[11px] border border-white/10 px-2.5 text-muted">
        <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input name="q" defaultValue={q} aria-label="Search chats" placeholder="Search chats" className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none" />
      </form>
      {groups.length ? <>{label("Rooms")}{groups.map(row)}</> : null}
      {direct.length ? <>{label("Direct")}{direct.map(row)}</> : null}
      {!shown.length ? <p className="px-3 py-6 text-sm text-muted">{q ? "No chat matches." : "No chats yet. Start a group, or join one."}</p> : null}
    </nav>
  );
}
