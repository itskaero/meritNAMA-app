"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addItemAction } from "@/app/portal/preferences/actions";
import { StatusPill } from "@/components/finder/status";
import { fieldClass } from "@/components/ui/form";
import type { FinderStatus } from "@/lib/domain/finder";

type Option = { speciality: string; hospital: string; status: FinderStatus | null; lastPct: number | null; shortlisted: boolean; onList: boolean };

/** Find a speciality or hospital and add it to the end of the list. Shortlisted options come first. */
export function OptionSearch({ listId, options }: { listId: string; options: Option[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = options
    .filter((o) => !o.onList && terms.every((t) => `${o.speciality} ${o.hospital}`.toLowerCase().includes(t)))
    .sort((a, b) => Number(b.shortlisted) - Number(a.shortlisted))
    .slice(0, terms.length ? 20 : 8);
  const add = (o: Option) =>
    start(async () => {
      const r = await addItemAction(listId, o.speciality, o.hospital);
      setMsg(r.status === "error" ? r.message ?? "Could not add it." : `Added ${o.speciality} at ${o.hospital}.`);
      router.refresh();
    });
  return (
    <div className="grid gap-3">
      <label className="grid gap-1.5 text-sm font-medium" htmlFor="opt-search">
        Add an option
        <input id="opt-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a speciality or hospital, e.g. anaesthesia lahore" className={fieldClass} autoComplete="off" />
      </label>
      <ul className="grid gap-1.5">
        {matches.map((o) => (
          <li key={`${o.speciality}|${o.hospital}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-line px-3 py-2 text-sm">
            <span className="min-w-0">
              <span className="block truncate">{o.speciality}{o.shortlisted ? <span className="ml-2 text-[0.7rem] text-ember-hot">★ shortlisted</span> : null}</span>
              <span className="block truncate text-xs text-muted">{o.hospital}{o.lastPct != null ? ` · closed at ${o.lastPct.toFixed(1)}%` : ""}</span>
            </span>
            <span className="flex items-center gap-2">
              {o.status ? <span className="hidden sm:inline"><StatusPill status={o.status} /></span> : null}
              <button type="button" disabled={pending} onClick={() => add(o)} className="rounded-full border border-line-strong px-3 py-1 text-xs font-semibold hover:border-signal hover:text-signal disabled:opacity-50">Add</button>
            </span>
          </li>
        ))}
        {matches.length === 0 ? <li className="text-sm text-subtle">{terms.length ? "Nothing matches." : "Everything offered is already on the list."}</li> : null}
      </ul>
      {msg ? <p role="status" className="text-xs text-muted">{msg}</p> : null}
    </div>
  );
}
