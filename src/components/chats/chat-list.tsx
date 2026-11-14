import Link from "next/link";
import type { listChats } from "@/lib/data/chats";
import { cn } from "../ui/cn";

type Chat = Awaited<ReturnType<typeof listChats>>[number];

const initials = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");

/** The left pane of Chats (v4 mockup): groups, then direct chats, the open one lit. */
export function ChatList({ chats, current }: { chats: Chat[]; current?: string }) {
  const groups = chats.filter((c) => c.kind === "group");
  const direct = chats.filter((c) => c.kind !== "group");
  const section = (label: string, list: Chat[]) => (list.length ? (
    <div className="grid gap-1">
      <p className="px-2 pt-2 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-subtle">{label}</p>
      {list.map((c) => {
        const on = c.id === current;
        return (
          <Link key={c.id} href={`/portal/chats/${c.id}`} aria-current={on ? "page" : undefined}
            className={cn("flex items-center gap-3 rounded-xl px-2 py-2", on ? "border border-violet-soft/50 bg-[var(--mn-violet-fill)] shadow-[0_0_18px_var(--mn-violet-glow)]" : "hover:bg-hover")}>
            <span aria-hidden className={cn("grid h-9 w-9 flex-none place-items-center rounded-full text-xs font-semibold", c.kind === "group" ? "bg-success/15 text-success" : "bg-violet text-white")}>{c.kind === "group" ? "#" : initials(c.title)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-heading">{c.title}</span>
              <span className="block truncate text-xs text-muted">{c.lastBody ?? (c.kind === "group" ? `${c.members} ${c.members === 1 ? "person" : "people"}` : "No messages yet")}</span>
            </span>
            {c.unread > 0 && !c.muted ? <span className="grid h-5 min-w-5 place-items-center rounded-full bg-violet px-1.5 text-[0.65rem] font-semibold text-white" aria-label={`${c.unread} unread`}>{c.unread > 99 ? "99+" : c.unread}</span> : null}
          </Link>
        );
      })}
    </div>
  ) : null);
  return (
    <nav aria-label="Your chats" className="grid content-start gap-2 rounded-2xl border border-line bg-card p-3">
      <div className="flex items-center justify-between px-2">
        <h2 className="text-lg font-semibold text-heading">Chats</h2>
        <Link href="/portal/chats" aria-label="Start or join a chat" className="mn-btn-ghost grid h-8 w-8 place-items-center rounded-lg text-lg">+</Link>
      </div>
      {chats.length ? <>{section("Groups", groups)}{section("Direct", direct)}</> : <p className="px-2 py-4 text-sm text-muted">No chats yet. Start a group, or join one.</p>}
    </nav>
  );
}
