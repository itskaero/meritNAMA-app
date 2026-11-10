"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { blockAction, chatUpdatesAction, muteAction, reactAction, readAction, reportChatAction, sendChatAction, startDmAction } from "@/app/portal/chats/actions";
import type { ChatMessage } from "@/lib/data/chats";
import { CHAT_MESSAGE_MAX, CHAT_REACTIONS, CHAT_REPORT_REASONS } from "@/lib/domain/chats";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { cn } from "../ui/cn";

function ago(iso: string, now: number) {
  const s = Math.max(1, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d} d` : iso.slice(0, 10);
}

function Row({ m, now, kind, onChange }: { m: ChatMessage; now: number; kind: "group" | "dm"; onChange: (m: ChatMessage) => void }) {
  const [menu, setMenu] = useState<null | "react" | "report">(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const react = (emoji: string) =>
    start(async () => {
      const res = await reactAction(m.id, emoji);
      setMenu(null);
      if (!res.ok) { setNote(res.message); return; }
      const has = m.reactions.find((r) => r.emoji === emoji);
      const next = has
        ? m.reactions.map((r) => (r.emoji === emoji ? { ...r, count: r.count + (r.mine ? -1 : 1), mine: !r.mine } : r)).filter((r) => r.count > 0)
        : [...m.reactions, { emoji, count: 1, mine: true }];
      onChange({ ...m, reactions: next });
    });
  if (m.kind === "system") {
    return <li className="px-3 py-2 text-center text-xs text-muted">{m.body}</li>;
  }
  return (
    <li className={cn("group flex flex-col gap-1 rounded-xl px-3 py-2", m.mine ? "items-end" : "items-start", m.hidden && "opacity-60")}>
      <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
        <span className="font-semibold text-heading">{m.mine ? "You" : m.author ?? "Member"}</span>
        {m.team ? <Badge tone="official">Team</Badge> : null}
        <time dateTime={m.at}>{ago(m.at, now)}</time>
        {m.hidden ? <Badge tone="warning">Hidden</Badge> : null}
      </p>
      <p className={cn("max-w-[34rem] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm", m.mine ? "bg-action text-action-ink" : "bg-hover text-ink")}>{m.body}</p>
      {m.reactions.length ? (
        <p className="flex flex-wrap gap-1" aria-label="Reactions">
          {m.reactions.map((r) => (
            <button key={r.emoji} type="button" disabled={pending} onClick={() => react(r.emoji)} aria-pressed={r.mine}
              className={cn("rounded-full border px-2 py-0.5 text-xs", r.mine ? "border-action bg-tint text-heading" : "border-line text-muted hover:border-line-strong")}>
              {r.emoji} {r.count}
            </button>
          ))}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3 text-xs text-subtle opacity-70 group-hover:opacity-100 focus-within:opacity-100">
        <button type="button" onClick={() => setMenu(menu === "react" ? null : "react")} aria-expanded={menu === "react"} className="hover:text-heading">React</button>
        {!m.mine ? <button type="button" onClick={() => setMenu(menu === "report" ? null : "report")} aria-expanded={menu === "report"} className="hover:text-danger">Report</button> : null}
        {!m.mine && m.authorId && kind === "group" && !m.team ? (
          <>
            <button type="button" onClick={() => start(async () => { const r = await startDmAction(m.authorId!); if (r && !r.ok) setNote(r.message); })} className="hover:text-heading">Message</button>
            <button type="button" onClick={() => start(async () => { const r = await blockAction(m.authorId!, true); setNote(r.ok ? "Blocked. You will not see their messages." : r.message); })} className="hover:text-danger">Block</button>
          </>
        ) : null}
      </div>
      {menu === "react" ? (
        <div className="flex gap-1" role="group" aria-label="Pick a reaction">
          {CHAT_REACTIONS.map((e) => <button key={e} type="button" disabled={pending} onClick={() => react(e)} className="rounded-lg border border-line px-2 py-1 hover:bg-hover">{e}</button>)}
        </div>
      ) : null}
      {menu === "report" ? (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Why are you reporting this message?">
          {CHAT_REPORT_REASONS.map((r) => (
            <button key={r} type="button" disabled={pending}
              onClick={() => start(async () => { const res = await reportChatAction(m.id, r); setNote(res.ok ? "Reported. Thank you." : res.message); setMenu(null); })}
              className="rounded-full border border-line-strong px-2.5 py-1 text-xs text-muted hover:border-danger/50 hover:text-danger">{r}</button>
          ))}
        </div>
      ) : null}
      {note ? <p className="text-xs text-muted" role="status">{note}</p> : null}
    </li>
  );
}

/**
 * A chat. New messages arrive over a server-sent stream (/api/chats/stream); when the
 * stream cannot stay open the room polls instead, only while the tab is visible.
 */
export function ChatRoom({
  roomId, kind, initial, mayPost, muted, otherId, iBlocked,
}: {
  roomId: string; kind: "group" | "dm"; initial: ChatMessage[]; mayPost: boolean; muted: boolean; otherId: string | null; iBlocked: boolean;
}) {
  const [messages, setMessages] = useState(initial);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [isMuted, setMuted] = useState(muted);
  const [blocked, setBlocked] = useState(iBlocked);
  const [sending, startSend] = useTransition();
  const listRef = useRef<HTMLOListElement>(null);
  const lastSeq = useRef(initial.at(-1)?.seq ?? 0);

  const merge = useCallback((fresh: ChatMessage[]) => {
    if (!fresh.length) return;
    setNow(Date.now());
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const add = fresh.filter((m) => !seen.has(m.id));
      return add.length ? [...prev, ...add] : prev;
    });
    lastSeq.current = Math.max(lastSeq.current, ...fresh.map((m) => m.seq));
  }, []);

  useEffect(() => {
    let es: EventSource | null = null;
    let poll: number | null = null;
    const startPolling = () => {
      if (poll != null) return;
      poll = window.setInterval(async () => { if (document.visibilityState === "visible") merge(await chatUpdatesAction(roomId, lastSeq.current)); }, 6000);
    };
    if (typeof EventSource === "undefined") startPolling();
    else {
      const open = () => {
        es = new EventSource(`/api/chats/stream?room=${roomId}&after=${lastSeq.current}`);
        es.addEventListener("messages", (ev) => { try { merge(JSON.parse((ev as MessageEvent).data)); } catch { /* ignore a bad frame */ } });
        es.onerror = () => { es?.close(); es = null; startPolling(); };
      };
      open();
    }
    return () => { es?.close(); if (poll != null) window.clearInterval(poll); };
  }, [roomId, merge]);

  useEffect(() => {
    const el = listRef.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 200) el.scrollTop = el.scrollHeight;
    const seq = messages.at(-1)?.seq;
    if (seq) void readAction(roomId, seq);
  }, [messages, roomId]);

  const send = () =>
    startSend(async () => {
      setError(null);
      const res = await sendChatAction(roomId, draft);
      if (!res.ok) { setError(res.message); return; }
      setDraft("");
      merge(await chatUpdatesAction(roomId, lastSeq.current));
    });

  const left = CHAT_MESSAGE_MAX - draft.length;

  return (
    <section aria-label="Conversation" className="min-w-0 rounded-xl border border-line bg-surface shadow-[var(--mn-shadow-1)]">
      <div role="log" aria-live="polite">
        <ol ref={listRef} tabIndex={0} aria-label="Messages" className="grid max-h-[30rem] min-h-[14rem] content-start gap-1 overflow-y-auto px-3 py-3">
          {messages.length === 0 ? <li className="px-2 py-10 text-center text-sm text-muted">No messages yet. Say hello.</li> : messages.map((m) => (
            <Row key={m.id} m={m} now={now} kind={kind} onChange={(n) => setMessages((p) => p.map((x) => (x.id === n.id ? n : x)))} />
          ))}
        </ol>
      </div>
      <footer className="grid gap-2 border-t border-line px-4 py-3">
        {mayPost ? (
          <form onSubmit={(e) => { e.preventDefault(); if (draft.trim()) send(); }} className="grid gap-2">
            <div className="flex gap-2">
              <label htmlFor="chat-draft" className="sr-only">Message</label>
              <textarea id="chat-draft" value={draft} rows={1} maxLength={CHAT_MESSAGE_MAX} placeholder="Write a message"
                onChange={(e) => setDraft(e.target.value.slice(0, CHAT_MESSAGE_MAX))}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (draft.trim() && !sending) send(); } }}
                className="min-h-10 min-w-0 flex-1 resize-none rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-subtle hover:border-decor" />
              <Button type="submit" disabled={sending || !draft.trim()}>{sending ? "Sending" : "Send"}</Button>
            </div>
            <p className={cn("text-right text-xs text-subtle", left < 40 && "text-amber")} aria-live="polite">{left} left</p>
            {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
          </form>
        ) : (
          <p className="text-sm text-muted">
            {blocked ? "You blocked this person. Unblock them to write again." : <>Writing opens once you <Link href="/portal/profile" className="text-signal hover:underline">link your merit record</Link>.</>}
          </p>
        )}
        <div className="flex flex-wrap gap-4 text-xs text-muted">
          <button type="button" className="hover:text-heading" onClick={async () => { const r = await muteAction(roomId, !isMuted); if (r.ok) setMuted(!isMuted); }}>
            {isMuted ? "Unmute notifications" : "Mute notifications"}
          </button>
          {kind === "dm" && otherId ? (
            <button type="button" className="hover:text-danger" onClick={async () => { const r = await blockAction(otherId, !blocked); if (r.ok) setBlocked(!blocked); else setError(r.message); }}>
              {blocked ? "Unblock" : "Block this person"}
            </button>
          ) : null}
        </div>
      </footer>
    </section>
  );
}
