"use client";

import { useState, useTransition } from "react";
import { blockAction } from "./actions";

export function BlockedList({ blocked }: { blocked: { id: string; name: string | null }[] }) {
  const [gone, setGone] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const shown = blocked.filter((b) => !gone.includes(b.id));
  if (!shown.length) return <p className="text-xs text-muted">You have not blocked anyone. Block someone from their message in a group.</p>;
  return (
    <div className="grid gap-1.5">
      <p className="text-sm font-medium text-heading">Blocked</p>
      <ul className="grid gap-1">
        {shown.map((b) => (
          <li key={b.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate text-muted">{b.name ?? "Member"}</span>
            <button type="button" disabled={pending} onClick={() => start(async () => { const r = await blockAction(b.id, false); if (r.ok) setGone((g) => [...g, b.id]); })} className="text-xs text-signal hover:underline">Unblock</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
