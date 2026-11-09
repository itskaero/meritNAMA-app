"use client";

import { useState, useTransition } from "react";
import { snippetChoicesAction } from "@/app/portal/community/actions";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { selectClass } from "@/components/ui/styles";
import type { Snippet } from "@/lib/domain/community";

type Choices = NonNullable<Awaited<ReturnType<typeof snippetChoicesAction>>>;

/**
 * "Attach a merit card": pick induction → round → programme·quota → speciality →
 * hospital from the imported data. Writes the choice to a hidden `snippet` field;
 * the numbers are read from the database when the post is shown.
 */
export function SnippetPicker({ initial = null }: { initial?: Snippet | null }) {
  const [attached, setAttached] = useState<Snippet | null>(initial);
  const [choices, setChoices] = useState<Choices | null>(null);
  const [hospital, setHospital] = useState<string>("");
  const [pending, start] = useTransition();

  const load = (input: Parameters<typeof snippetChoicesAction>[0]) =>
    start(async () => {
      const c = await snippetChoicesAction(input);
      setChoices(c);
      setHospital(c?.hospitals[0] ?? "");
    });

  const attach = () => {
    if (!choices?.induction || !choices.round || !choices.track || !choices.speciality || !hospital) return;
    const [program, quota] = choices.track.split("|") as [string, string];
    setAttached({ induction: choices.induction, round: choices.round, program, quota, speciality: choices.speciality, hospital });
    setChoices(null);
  };

  if (attached) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-signal/40 bg-signal/5 p-3 text-sm">
        <input type="hidden" name="snippet" value={JSON.stringify(attached)} />
        <Icon name="trend" className="h-4 w-4 text-signal" />
        <span className="min-w-0 flex-1">
          Merit card: <strong>{attached.speciality}</strong> at {attached.hospital} · I{attached.induction} R{attached.round} · {attached.program} {attached.quota}
        </span>
        <Button type="button" size="sm" variant="ghost" onClick={() => setAttached(null)}>Remove</Button>
      </div>
    );
  }
  if (!choices) {
    return (
      <div>
        <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => load({})}>
          {pending ? "Loading…" : "Attach a merit card"}
        </Button>
        <p className="mt-1.5 text-xs text-subtle">Shows the real closing merit of one speciality at one hospital, read from the merit list.</p>
      </div>
    );
  }
  const sel = (label: string, value: string | number | null, options: (string | number)[], onChange: (v: string) => void, show: (o: string | number) => string = String) => (
    <label className="grid min-w-0 gap-1 text-xs font-medium text-muted">
      {label}
      <select value={value ?? ""} disabled={pending || options.length === 0} onChange={(e) => onChange(e.target.value)} className={selectClass}>
        {options.map((o) => <option key={o} value={o}>{show(o)}</option>)}
      </select>
    </label>
  );
  return (
    <div className="grid gap-3 rounded-2xl border border-line-strong p-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {sel("Induction", choices.induction, choices.inductions, (v) => load({ induction: Number(v) }))}
        {sel("Round", choices.round, choices.rounds, (v) => load({ induction: choices.induction ?? undefined, round: Number(v) }))}
        {sel("Programme · quota", choices.track, choices.tracks, (v) => load({ induction: choices.induction ?? undefined, round: choices.round ?? undefined, track: v }), (o) => String(o).replace("|", " · "))}
        {sel("Speciality", choices.speciality, choices.specialities, (v) => load({ induction: choices.induction ?? undefined, round: choices.round ?? undefined, track: choices.track ?? undefined, speciality: v }))}
        <div className="col-span-2 min-w-0">{sel("Hospital", hospital, choices.hospitals, setHospital)}</div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={pending || !hospital} onClick={attach}>Attach</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setChoices(null)}>Cancel</Button>
      </div>
    </div>
  );
}
