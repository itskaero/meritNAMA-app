"use client";

import { useId, type ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import { fieldClass } from "@/components/ui/form";

/*
 * Allocation rules as a form. It edits the same object the JSON box holds (the
 * server validates it with allocationRulesSchema either way). Every setting is one of
 * a fixed set of behaviours; the help lines say what each choice does.
 */

type Obj = Record<string, unknown>;
export type RulesValue = Obj;

const SOURCES = [
  ["certificateMarks", "Certificate marks"],
  ["computerizedMarks", "Computerised marks"],
  ["preferenceProgramMarks", "Programme marks on the preference"],
] as const;

const get = (o: Obj, path: string): unknown => path.split(".").reduce<unknown>((v, k) => (v && typeof v === "object" ? (v as Obj)[k] : undefined), o);
function set(o: Obj, path: string, value: unknown): Obj {
  const [k, ...rest] = path.split(".");
  const cur = (o[k!] && typeof o[k!] === "object" ? (o[k!] as Obj) : {}) as Obj;
  return { ...o, [k!]: rest.length ? set(cur, rest.join("."), value) : value };
}
const ints = (s: string) => s.split(/[\s,]+/).filter(Boolean).map(Number).filter((n) => Number.isInteger(n));

function Field({ label, help, children }: { label: string; help?: ReactNode; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="grid content-start gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      {children(id)}
      {help ? <p className="text-xs text-muted">{help}</p> : null}
    </div>
  );
}

function Section({ title, help, children }: { title: string; help?: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-4 rounded-lg border border-line p-4">
      <legend className="px-1 text-sm font-semibold text-heading">{title}</legend>
      {help ? <p className="-mt-2 text-xs text-muted">{help}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

export function RulesFormEditor({ value, onChange }: { value: RulesValue; onChange: (v: RulesValue) => void }) {
  const v = (p: string) => get(value, p);
  const put = (p: string, x: unknown) => onChange(set(value, p, x));

  const select = (p: string, label: string, options: [string, string][], help?: ReactNode, parse: (s: string) => unknown = (s) => s) => (
    <Field label={label} help={help}>
      {(id) => (
        <select id={id} value={String(v(p))} onChange={(e) => put(p, parse(e.target.value))} className={fieldClass}>
          {options.map(([val, l]) => <option key={val} value={val}>{l}</option>)}
        </select>
      )}
    </Field>
  );
  const enabled = (p: string, label: string) =>
    select(p, label, [["auto", "Follow the scoring policy"], ["true", "Always on"], ["false", "Always off"]], "\"Follow the scoring policy\" turns it on when the policy includes its component.", (s) => (s === "auto" ? "auto" : s === "true"));
  const text = (p: string, label: string, help?: ReactNode) => (
    <Field label={label} help={help}>{(id) => <input id={id} value={String(v(p) ?? "")} onChange={(e) => put(p, e.target.value)} className={fieldClass} />}</Field>
  );
  const num = (p: string, label: string, help?: ReactNode) => (
    <Field label={label} help={help}>{(id) => <input id={id} type="number" min={1} value={Number(v(p) ?? 0)} onChange={(e) => put(p, Math.max(1, Math.round(Number(e.target.value) || 1)))} className={cn(fieldClass, "font-mono")} />}</Field>
  );
  const intList = (p: string, label: string, help?: ReactNode) => (
    <Field label={label} help={help}>
      {(id) => <input id={id} defaultValue={((v(p) as number[]) ?? []).join(", ")} onBlur={(e) => put(p, ints(e.target.value).length ? ints(e.target.value) : [1])} className={cn(fieldClass, "font-mono")} />}
    </Field>
  );
  const check = (p: string, label: string, help?: ReactNode) => (
    <label className="flex items-start gap-2.5 text-sm">
      <input type="checkbox" checked={Boolean(v(p))} onChange={(e) => put(p, e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--mn-cyan)]" />
      <span><span className="font-medium">{label}</span>{help ? <span className="block text-xs text-muted">{help}</span> : null}</span>
    </label>
  );

  const sources = ((v("certificateBonus.sources") as string[]) ?? []).filter(Boolean);
  const tracks = ((v("tracks.separate") as { id: string; quotaContains: string[] }[]) ?? []);

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">{text("label", "Label", "Shown in the rules list, e.g. \"Induction 22, PHF notification of 3 May\".")}</div>

      <Section title="Certificate bonus" help="Extra marks on a preference for a matching postgraduate certificate.">
        {enabled("certificateBonus.enabled", "On or off")}
        {text("certificateBonus.component", "Scoring-policy component", "The component that switches this bonus on and caps its value.")}
        {select("certificateBonus.typeMatch", "Programme type must match", [["lenient", "Lenient (missing type matches)"], ["strict", "Strict (types must be equal)"]])}
        {select("certificateBonus.combine", "Several matching certificates", [["max", "Use the best one"], ["first", "Use the first in the file"]])}
        {select("certificateBonus.fallback", "No certificate gives a value", [["programMarks", "Programme marks"], ["none", "No bonus"]])}
        <Field label="Where a certificate's value comes from" help="The first of these that is a positive number. Order matters.">
          {() => (
            <ol className="grid gap-1.5">
              {sources.map((s, i) => (
                <li key={s} className="flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-sm">
                  <span className="w-5 font-mono text-xs text-subtle">{i + 1}.</span>
                  <span className="flex-1">{SOURCES.find(([k]) => k === s)?.[1] ?? s}</span>
                  <button type="button" disabled={i === 0} onClick={() => { const n = [...sources]; [n[i - 1], n[i]] = [n[i]!, n[i - 1]!]; put("certificateBonus.sources", n); }} className="rounded px-1.5 text-muted hover:bg-hover disabled:opacity-30" aria-label={`Move ${s} up`}>↑</button>
                  <button type="button" disabled={sources.length === 1} onClick={() => put("certificateBonus.sources", sources.filter((x) => x !== s))} className="rounded px-1.5 text-muted hover:bg-hover disabled:opacity-30" aria-label={`Remove ${s}`}>✕</button>
                </li>
              ))}
              {SOURCES.filter(([k]) => !sources.includes(k)).map(([k, l]) => (
                <li key={k}><button type="button" onClick={() => put("certificateBonus.sources", [...sources, k])} className="text-xs font-medium text-signal hover:underline">+ {l}</button></li>
              ))}
            </ol>
          )}
        </Field>
        <div className="grid content-start gap-3">
          {check("certificateBonus.matchByName", "Match by speciality name", "When a preference has no discipline ids.")}
          {check("certificateBonus.requirePass", "Only passed certificates count")}
        </div>
      </Section>

      <Section title="Parent-institute bonus">
        {enabled("parentBonus.enabled", "On or off")}
        {text("parentBonus.component", "Scoring-policy component")}
      </Section>

      <Section title="Tracks" help="Quotas whose name contains one of the words form their own track (e.g. Armed Forces); all others form the default track.">
        <div className="grid gap-2 sm:col-span-2">
          {tracks.map((t, i) => (
            <div key={i} className="grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-end">
              <Field label="Track id" help="Lower case, e.g. armed-forces">
                {(id) => <input id={id} value={t.id} onChange={(e) => put("tracks.separate", tracks.map((x, j) => (j === i ? { ...x, id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") } : x)))} className={cn(fieldClass, "font-mono")} />}
              </Field>
              <Field label="Quota name contains (comma-separated)">
                {(id) => <input id={id} defaultValue={t.quotaContains.join(", ")} onBlur={(e) => put("tracks.separate", tracks.map((x, j) => (j === i ? { ...x, quotaContains: e.target.value.split(",").map((w) => w.trim()).filter(Boolean) } : x)))} className={fieldClass} />}
              </Field>
              <button type="button" onClick={() => put("tracks.separate", tracks.filter((_, j) => j !== i))} className="h-10 rounded-lg px-3 text-sm text-danger hover:bg-danger/10">Remove</button>
            </div>
          ))}
          <button type="button" onClick={() => put("tracks.separate", [...tracks, { id: "new-track", quotaContains: ["word"] }])} className="justify-self-start text-sm font-medium text-signal hover:underline">+ Add a track</button>
        </div>
        {text("tracks.defaultTrack", "Default track id", "For every other quota, e.g. civilian.")}
      </Section>

      <Section title="Round 1 placement">
        {select("placement.orderBy", "Order candidates are placed in", [["bestMark", "Best mark, bonuses included"], ["bestMarkWithoutParentBonus", "Best mark, no parent bonus (legacy)"]])}
        {num("placement.maxPasses", "Maximum passes", "A safety limit; placement normally settles in a few.")}
        {intList("placement.eligibleProfileStatus", "Profile statuses that take part", "Comma-separated numbers. 1 = Accepted.")}
        {select("placement.unknownStatus", "Candidates with no known status", [["include", "Include them"], ["exclude", "Leave them out"]])}
        <p className="text-xs text-muted sm:col-span-2">A challenger takes a full seat only with strictly higher marks; on a tie the holder keeps it.</p>
      </Section>

      <Section title="Later rounds (cascade)">
        {intList("cascade.eligibleProfileStatus", "Profile statuses that keep and take seats", "Comma-separated numbers. 1 = Accepted.")}
        {select("cascade.lockAcceptedFirstPreference", "Accepting the first preference", [["programme", "Blocks other programmes"], ["none", "Locks nothing"]])}
        {select("cascade.seatHolding", "Seats held at once", [["perQuota", "One per quota"], ["perProgramme", "One per programme"]])}
        {select("cascade.awaitedConsent", "All consent replies \"Awaited\"", [["yield", "Next in line takes them (PHF)"], ["keep", "Keeps the seats"], ["vacate", "Loses the seats"]], "PHF: the seats go to whoever is next in line; a seat nobody claims stays theirs.")}
        {select("cascade.tracks", "Civilian and Armed Forces", [["phf", "Other track allowed (PHF)"], ["legacy", "Only tracks held (legacy)"]])}
        {select("cascade.programmes", "Other programmes", [["phf", "Other programmes allowed (PHF)"], ["legacy", "Only programmes held (legacy)"]])}
        {num("cascade.maxWaves", "Maximum waves per round", "A safety limit.")}
        <div className="grid content-start">{check("cascade.droppedStayOut", "Candidates who dropped off a list do not come back")}</div>
      </Section>

      <p className="text-xs text-muted">The base-marks formula is edited in its own card on this page (Base marks), with a workbench to try it.</p>
    </div>
  );
}
