"use client";

import { useActionState, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { ActionResult, Field, fieldClass, FileField, JsonField, ReasonField } from "@/components/ui/form";
import { idleState, type ActionState } from "@/lib/action-state";
import {
  addSeatAction,
  importSeatFileAction,
  removeSeatAction,
  saveDocumentAction,
  saveLookupAction,
  updateSeatAction,
} from "./actions";

type Option = { id: number; name: string };
export type SeatLine = {
  programId: number; program: string;
  quotaId: number; quota: string;
  specialityId: number; speciality: string;
  instituteId: number; institute: string;
  hospitalId: number; hospital: string;
  seats: number;
};

// ── Imports ─────────────────────────────────────────────────────────────────

export function SeatImportForm({ defaultInduction }: { defaultInduction?: number }) {
  const [state, action, pending] = useActionState(importSeatFileAction, idleState);
  const [induction, setInduction] = useState(defaultInduction ? String(defaultInduction) : "");
  const [year, setYear] = useState("");
  return (
    <form action={action} className="grid gap-4">
      <FileField label="Seat file (induction<n>_seats.json)" hint="Replaces that induction's whole seat matrix. Validated in full first; nothing is written if any row is wrong." />
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <Field label="Induction number">
          {(id) => <input id={id} name="induction" inputMode="numeric" required className={fieldClass} value={induction} onChange={(e) => setInduction(e.target.value)} placeholder="21" />}
        </Field>
        <Field label="Calendar year" hint="Only needed when the induction does not exist yet.">
          {(id) => <input id={id} name="calendarYear" inputMode="numeric" className={fieldClass} value={year} onChange={(e) => setYear(e.target.value)} placeholder="2026" />}
        </Field>
      </div>
      <ReasonField placeholder="e.g. Seat matrix from the induction 21 advertisement" />
      <div><Button type="submit" disabled={pending}>{pending ? "Importing…" : "Import seats"}</Button></div>
      <ActionResult state={state} fileReset />
    </form>
  );
}

export function DocumentImportForm({ kind, file, perInduction }: { kind: string; file: string; perInduction: boolean }) {
  const [state, action, pending] = useActionState(saveDocumentAction, idleState);
  const [induction, setInduction] = useState("");
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="kind" value={kind} />
      <FileField label={file} hint="Stored as a new version; earlier versions are kept." />
      {perInduction ? (
        <Field label="Induction number">
          {(id) => <input id={id} name="induction" inputMode="numeric" required className={fieldClass} value={induction} onChange={(e) => setInduction(e.target.value)} placeholder="21" />}
        </Field>
      ) : null}
      <ReasonField placeholder="e.g. Imported from the public site" />
      <div><Button type="submit" disabled={pending}>{pending ? "Importing…" : "Import"}</Button></div>
      <ActionResult state={state} fileReset />
    </form>
  );
}

export function DocumentEditForm({ kind, induction, initial }: { kind: string; induction: number | null; initial: string }) {
  const [state, action, pending] = useActionState(saveDocumentAction, idleState);
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="kind" value={kind} />
      {induction ? <input type="hidden" name="induction" value={induction} /> : null}
      <JsonField label="Data (JSON)" initial={initial} hint="Saving creates a new version. The same validation as an import applies; unknown fields are rejected." />
      <ReasonField placeholder="e.g. Add the new Cardiology unit" />
      <div><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save as new version"}</Button></div>
      <ActionResult state={state} />
    </form>
  );
}

// ── Inline editors (one shared reason per page) ─────────────────────────────

function SharedReason({ value, onChange, children }: { value: string; onChange: (v: string) => void; children?: ReactNode }) {
  return (
    <div className="sticky top-16 z-10 -mx-1 mb-4 rounded-2xl border border-line bg-surface/95 p-4 backdrop-blur lg:top-3">
      <ReasonField value={value} onChange={onChange} placeholder="Why are you changing these rows? Applies to every save below." />
      {children}
      {!value.trim() ? <p className="mt-2 text-xs text-amber">Enter a reason to enable saving.</p> : null}
    </div>
  );
}

function InlineStatus({ state }: { state: ActionState }) {
  if (state.status === "idle") return null;
  return (
    <span role={state.status === "error" ? "alert" : "status"} className={cn("text-xs", state.status === "error" ? "text-danger" : "text-success")}>
      {state.message}
    </span>
  );
}

function KeyInputs({ induction, line }: { induction: number; line: SeatLine }) {
  return (
    <>
      <input type="hidden" name="induction" value={induction} />
      <input type="hidden" name="programId" value={line.programId} />
      <input type="hidden" name="quotaId" value={line.quotaId} />
      <input type="hidden" name="specialityId" value={line.specialityId} />
      <input type="hidden" name="instituteId" value={line.instituteId} />
      <input type="hidden" name="hospitalId" value={line.hospitalId} />
    </>
  );
}

function SeatRow({ induction, line, reason }: { induction: number; line: SeatLine; reason: string }) {
  const [saveState, save, saving] = useActionState(updateSeatAction, idleState);
  const [removeState, remove, removing] = useActionState(removeSeatAction, idleState);
  const [seats, setSeats] = useState(String(line.seats));
  const dirty = seats !== String(line.seats);
  const label = `${line.program} ${line.speciality}, ${line.quota}, ${line.hospital}`;
  return (
    <tr className="align-middle hover:bg-surface">
      <td className="px-3 py-2">{line.program}</td>
      <td className="px-3 py-2">{line.speciality}</td>
      <td className="px-3 py-2 text-muted">{line.quota}</td>
      <td className="px-3 py-2">{line.hospital}{line.instituteId ? <span className="text-muted"> · {line.institute}</span> : null}</td>
      <td className="px-3 py-2">
        <form action={save} className="flex items-center justify-end gap-2">
          <KeyInputs induction={induction} line={line} />
          <input type="hidden" name="reason" value={reason} />
          <input
            name="seats"
            inputMode="numeric"
            aria-label={`Seats for ${label}`}
            className={cn(fieldClass, "w-20 py-1.5 text-right tabular-nums", dirty && "border-signal")}
            value={seats}
            onChange={(e) => setSeats(e.target.value)}
          />
          <Button type="submit" size="sm" variant={dirty ? "primary" : "ghost"} disabled={!dirty || !reason.trim() || saving} aria-label={`Save seats for ${label}`}>
            {saving ? "…" : "Save"}
          </Button>
        </form>
      </td>
      <td className="px-3 py-2">
        <form
          action={remove}
          onSubmit={(e) => {
            if (!window.confirm(`Remove the seat line ${label}?`)) e.preventDefault();
          }}
        >
          <KeyInputs induction={induction} line={line} />
          <input type="hidden" name="reason" value={reason} />
          <Button type="submit" size="sm" variant="ghost" disabled={!reason.trim() || removing} aria-label={`Remove ${label}`}>Remove</Button>
        </form>
      </td>
      <td className="min-w-24 px-3 py-2"><InlineStatus state={removeState.status !== "idle" ? removeState : saveState} /></td>
    </tr>
  );
}

function Select({ name, label, options, value, onChange }: { name: string; label: string; options: Option[]; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      {(id) => (
        <select id={id} name={name} required className={fieldClass} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Choose…</option>
          {options.map((o) => <option key={o.id} value={o.id}>{o.name || "(none)"} · {o.id}</option>)}
        </select>
      )}
    </Field>
  );
}

function AddSeatLine({ induction, lookups, reason }: { induction: number; lookups: Record<"programs" | "quotas" | "specialities" | "institutes" | "hospitals", Option[]>; reason: string }) {
  const [state, action, pending] = useActionState(addSeatAction, idleState);
  const [v, setV] = useState({ programId: "", quotaId: "", specialityId: "", instituteId: "0", hospitalId: "", seats: "1" });
  const set = (k: keyof typeof v) => (x: string) => setV((p) => ({ ...p, [k]: x }));
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="induction" value={induction} />
      <input type="hidden" name="reason" value={reason} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Select name="programId" label="Programme" options={lookups.programs} value={v.programId} onChange={set("programId")} />
        <Select name="specialityId" label="Speciality" options={lookups.specialities} value={v.specialityId} onChange={set("specialityId")} />
        <Select name="quotaId" label="Quota" options={lookups.quotas} value={v.quotaId} onChange={set("quotaId")} />
        <Select name="hospitalId" label="Hospital" options={lookups.hospitals} value={v.hospitalId} onChange={set("hospitalId")} />
        <Select name="instituteId" label="Institute" options={lookups.institutes} value={v.instituteId} onChange={set("instituteId")} />
        <Field label="Seats">
          {(id) => <input id={id} name="seats" inputMode="numeric" required className={fieldClass} value={v.seats} onChange={(e) => set("seats")(e.target.value)} />}
        </Field>
      </div>
      <p className="text-xs text-subtle">A hospital or speciality that is not listed must be added under Lookups first.</p>
      <div><Button type="submit" disabled={pending || !reason.trim()}>{pending ? "Adding…" : "Add seat line"}</Button></div>
      <ActionResult state={state} />
    </form>
  );
}

export function SeatEditor({ induction, lines, lookups, children }: {
  induction: number;
  lines: SeatLine[];
  lookups: Record<"programs" | "quotas" | "specialities" | "institutes" | "hospitals", Option[]>;
  children?: ReactNode;
}) {
  const [reason, setReason] = useState("");
  return (
    <>
      <SharedReason value={reason} onChange={setReason}>{children}</SharedReason>
      <div tabIndex={0} role="region" aria-label="Seat lines" className="relative overflow-x-auto rounded-2xl border border-line">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Seat lines for induction {induction}</caption>
          <thead className="bg-elevated text-muted">
            <tr>
              <th scope="col" className="px-3 py-3 font-medium">Programme</th>
              <th scope="col" className="px-3 py-3 font-medium">Speciality</th>
              <th scope="col" className="px-3 py-3 font-medium">Quota</th>
              <th scope="col" className="px-3 py-3 font-medium">Hospital</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Seats</th>
              <th scope="col" className="px-3 py-3 font-medium"><span className="sr-only">Remove</span></th>
              <th scope="col" className="px-3 py-3 font-medium"><span className="sr-only">Status</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {lines.map((l) => (
              <SeatRow
                key={`${l.programId}-${l.quotaId}-${l.specialityId}-${l.instituteId}-${l.hospitalId}`}
                induction={induction}
                line={l}
                reason={reason}
              />
            ))}
          </tbody>
        </table>
      </div>
      <section id="add-line" className="mt-6 scroll-mt-20 rounded-[1.5rem] border border-line bg-surface p-5">
        <h2 className="mb-4 text-base font-semibold">Add a seat line</h2>
        <AddSeatLine induction={induction} lookups={lookups} reason={reason} />
      </section>
    </>
  );
}

function LookupRow({ kind, row, reason }: { kind: string; row: { id: number; name: string; lines: number; seats: number }; reason: string }) {
  const [state, action, pending] = useActionState(saveLookupAction, idleState);
  const [name, setName] = useState(row.name);
  const dirty = name !== row.name;
  return (
    <tr className="align-middle hover:bg-surface">
      <td className="px-3 py-2 font-mono text-xs text-muted">{row.id}</td>
      <td className="px-3 py-2">
        <form action={action} className="flex items-center gap-2">
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="id" value={row.id} />
          <input type="hidden" name="reason" value={reason} />
          <input name="name" aria-label={`Name for id ${row.id}`} className={cn(fieldClass, "py-1.5", dirty && "border-signal")} value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" size="sm" variant={dirty ? "primary" : "ghost"} disabled={!dirty || !reason.trim() || pending}>{pending ? "…" : "Save"}</Button>
        </form>
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-muted">{row.lines}</td>
      <td className="px-3 py-2 text-right tabular-nums text-muted">{row.seats}</td>
      <td className="min-w-24 px-3 py-2"><InlineStatus state={state} /></td>
    </tr>
  );
}

function AddLookup({ kind, reason }: { kind: string; reason: string }) {
  const [state, action, pending] = useActionState(saveLookupAction, idleState);
  const [v, setV] = useState({ id: "", name: "" });
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="reason" value={reason} />
      <Field label="PHF id">
        {(id) => <input id={id} name="id" inputMode="numeric" required className={fieldClass} value={v.id} onChange={(e) => setV({ ...v, id: e.target.value })} />}
      </Field>
      <Field label="Name">
        {(id) => <input id={id} name="name" required className={fieldClass} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />}
      </Field>
      <Button type="submit" disabled={pending || !reason.trim()}>{pending ? "Adding…" : "Add"}</Button>
      <div className="sm:col-span-3"><ActionResult state={state} /></div>
    </form>
  );
}

export function LookupEditor({ kind, label, rows }: { kind: string; label: string; rows: { id: number; name: string; lines: number; seats: number }[] }) {
  const [reason, setReason] = useState("");
  return (
    <>
      <SharedReason value={reason} onChange={setReason} />
      <div tabIndex={0} role="region" aria-label={label} className="relative overflow-x-auto rounded-2xl border border-line">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{label}</caption>
          <thead className="bg-elevated text-muted">
            <tr>
              <th scope="col" className="px-3 py-3 font-medium">Id</th>
              <th scope="col" className="px-3 py-3 font-medium">Name</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Seat lines</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Seats</th>
              <th scope="col" className="px-3 py-3 font-medium"><span className="sr-only">Status</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => <LookupRow key={r.id} kind={kind} row={r} reason={reason} />)}
          </tbody>
        </table>
      </div>
      <section className="mt-6 rounded-[1.5rem] border border-line bg-surface p-5">
        <h2 className="mb-4 text-base font-semibold">Add an entry</h2>
        <AddLookup kind={kind} reason={reason} />
      </section>
    </>
  );
}
