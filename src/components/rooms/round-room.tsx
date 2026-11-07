"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { postRoomAction, reportRoomMessageAction, roomUpdatesAction, socialPrefsAction } from "@/app/portal/rooms/actions";
import type { RoomMessage } from "@/lib/data/rooms";
import { ROOM_MESSAGE_MAX } from "@/lib/domain/social";
import { RepBadge } from "../community/rep-badge";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { cn } from "../ui/cn";

const REASONS = ["Spam or advertising", "Rude or abusive", "Shares someone's personal details", "Misleading figures"];

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

/** The round's own figures, posted on import: the "round day" card at the top of the conversation. */
function SystemCard({ m, now, pinned = false }: { m: RoomMessage; now: number; pinned?: boolean }) {
  const Tag = pinned ? "div" : "li";
  return (
    <Tag className={cn("rounded-lg border border-teal/30 bg-tint px-3.5 py-3", pinned && "mx-3 mt-3")}>
      <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5 font-semibold text-signal-strong">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-teal" /> meritNAMA · round day
        </span>
        <Badge tone="calculated">calculated</Badge>
        <time dateTime={m.at}>{ago(m.at, now)}</time>
      </p>
      <p className="mt-1.5 text-sm text-ink">{m.body}</p>
    </Tag>
  );
}

function MessageRow({ m, now, canReport }: { m: RoomMessage; now: number; canReport: boolean }) {
  const [reporting, setReporting] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <li className={cn("group rounded-lg px-3 py-2", m.mine ? "bg-[var(--mn-cyan-soft)]" : "hover:bg-hover/60", m.hidden && "opacity-60")}>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        <span className="font-semibold text-heading">{m.mine ? "You" : m.author ?? "Member"}</span>
        {m.team ? <Badge tone="official">Team</Badge> : m.verified ? <Badge tone="success">Verified</Badge> : null}
        <RepBadge level={m.level} />
        {m.band ? <span className="rounded border border-line px-1.5 font-mono text-[0.7rem] text-muted">{m.band}</span> : null}
        <time dateTime={m.at} className={m.mine ? "text-muted" : "text-subtle"}>{ago(m.at, now)}</time>
        {m.hidden ? <Badge tone="warning">Hidden</Badge> : null}
        {canReport && !m.mine && !note ? (
          <button type="button" onClick={() => setReporting((v) => !v)} className="ml-auto text-subtle hover:text-danger focus-visible:text-danger" aria-expanded={reporting}>
            Report
          </button>
        ) : null}
      </p>
      <p className="mt-0.5 break-words text-sm text-ink">{m.body}</p>
      {reporting && !note ? (
        <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Why are you reporting this message?">
          {REASONS.map((r) => (
            <button
              key={r}
              type="button"
              disabled={pending}
              onClick={() => start(async () => { const res = await reportRoomMessageAction(m.id, r); setNote(res.message); setReporting(false); })}
              className="rounded-full border border-line-strong px-2.5 py-1 text-xs text-muted hover:border-danger/50 hover:text-danger"
            >
              {r}
            </button>
          ))}
        </div>
      ) : null}
      {note ? <p className="mt-1 text-xs text-muted" role="status">{note}</p> : null}
    </li>
  );
}

/**
 * A round's room: a short-message log, not a messenger. The newest round polls every
 * 8 seconds while the tab is visible (round day is when people talk); older rooms
 * every minute. Posting needs a verified record; reading is open.
 */
export function RoundRoom({
  induction,
  roundNo,
  initial,
  mayPost,
  live,
  showBand,
  myBand,
  signedInAs,
}: {
  induction: number;
  roundNo: number;
  initial: RoomMessage[];
  mayPost: boolean;
  live: boolean;
  showBand: boolean;
  myBand: string | null;
  signedInAs: string | null;
}) {
  const [messages, setMessages] = useState(initial);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [band, setBand] = useState(showBand);
  const [now, setNow] = useState(() => Date.now());
  const [sending, startSend] = useTransition();
  const listRef = useRef<HTMLOListElement>(null);
  const last = messages.at(-1)?.seq ?? 0;
  const key = { induction, roundNo };

  const pull = useCallback(async () => {
    const res = await roomUpdatesAction({ induction, roundNo }, last);
    setNow(Date.now());
    if (res?.messages.length) setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      return [...prev, ...res.messages.filter((m) => !seen.has(m.id))];
    });
  }, [induction, roundNo, last]);

  useEffect(() => {
    const every = live ? 8000 : 60000;
    const tick = () => { if (document.visibilityState === "visible") void pull(); };
    const id = window.setInterval(tick, every);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(id); document.removeEventListener("visibilitychange", tick); };
  }, [live, pull]);

  // Keep the newest message in view when the reader is already near the bottom.
  useEffect(() => {
    const el = listRef.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 160) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const send = () => {
    setError(null);
    startSend(async () => {
      const res = await postRoomAction(key, draft);
      if (!res.ok) { setError(res.message); return; }
      setDraft("");
      await pull();
    });
  };

  // The latest round-day post stays pinned above the log; earlier ones stay in place.
  const pinned = [...messages].reverse().find((m) => m.kind === "system") ?? null;
  const people = new Set(messages.filter((m) => m.kind === "message").map((m) => m.author)).size;
  const left = ROOM_MESSAGE_MAX - draft.length;

  return (
    <section id="room" aria-labelledby="room-title" className="min-w-0 scroll-mt-20 rounded-xl border border-line bg-surface shadow-[var(--mn-shadow-1)]">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-5 py-3.5">
        <h2 id="room-title" className="text-[0.98rem] font-semibold text-heading">Round room</h2>
        {live ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--mn-cyan-soft)] px-2 py-0.5 text-xs font-medium text-signal-strong">
            <span aria-hidden className="mn-pulse h-1.5 w-1.5 rounded-full bg-teal" /> Live
          </span>
        ) : (
          <Badge tone="historical">Archive</Badge>
        )}
        <p className="text-xs text-muted">
          {people ? `${people} ${people === 1 ? "person" : "people"} talking about induction ${induction}, round ${roundNo}` : `Induction ${induction}, round ${roundNo}`}
        </p>
      </header>

      {pinned ? <SystemCard m={pinned} now={now} pinned /> : null}
      <div role="log" aria-live="polite" aria-label={`Messages about round ${roundNo}`}>
      <ol ref={listRef} tabIndex={0} aria-label="Messages" className="grid max-h-[26rem] content-start gap-1 overflow-y-auto px-3 py-3">
        {messages.filter((m) => m !== pinned).length === 0 ? (
          <li className="px-2 py-6 text-center text-sm text-muted">
            {live ? "Quiet so far. Ask what moved, or say where you landed." : "No one talked about this round here."}
          </li>
        ) : (
          messages.filter((m) => m !== pinned).map((m) => (m.kind === "system" ? <SystemCard key={m.id} m={m} now={now} /> : <MessageRow key={m.id} m={m} now={now} canReport={Boolean(signedInAs)} />))
        )}
      </ol>
      </div>

      <footer className="border-t border-line px-5 py-3.5">
        {mayPost ? (
          <form
            onSubmit={(e) => { e.preventDefault(); if (draft.trim()) send(); }}
            className="grid gap-2"
          >
            <div className="flex gap-2">
              <label htmlFor="room-draft" className="sr-only">Message</label>
              <input
                id="room-draft"
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, ROOM_MESSAGE_MAX))}
                maxLength={ROOM_MESSAGE_MAX}
                autoComplete="off"
                placeholder={live ? "What moved for you this round?" : "Add to this round's notes"}
                className="h-10 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-subtle hover:border-decor"
              />
              <Button type="submit" disabled={sending || !draft.trim()}>{sending ? "Sending" : "Send"}</Button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={band}
                  onChange={(e) => { const v = e.target.checked; setBand(v); void socialPrefsAction({ showBand: v }); }}
                  className="h-4 w-4 accent-[var(--mn-cyan)]"
                />
                {myBand ? <>Show my band, <span className="font-mono">{myBand}</span>, beside my name</> : "Show my merit band beside my name"}
              </label>
              <span aria-live="polite" className={cn(left < 30 && "text-amber")}>{left} left</span>
            </div>
            {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
            <p className="text-xs text-subtle">One line at a time. No phone numbers or personal details; members can report a message.</p>
          </form>
        ) : (
          <p className="text-sm text-muted">
            Reading is open to everyone. To post, <Link href="/portal/profile" className="text-signal hover:underline">link your merit record</Link>.
          </p>
        )}
      </footer>
    </section>
  );
}
