"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, fieldClass, ReasonField } from "@/components/ui/form";
import { cn } from "@/components/ui/cn";
import { idleState } from "@/lib/action-state";
import { deleteRoundAction, importRoundsAction, saveAliasAction } from "./actions";

type FileResult = { name: string; state: "waiting" | "importing" | "done" | "failed"; message?: string; href?: string };

/**
 * Uploads each selected file in its own request (round files are ~1 MB each, and
 * the request size is capped), showing progress per file. Each file is imported
 * all or nothing; one failure does not stop the others.
 */
export function ImportRoundsForm() {
  const [results, setResults] = useState<FileResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem("files") as HTMLInputElement;
    const files = [...(input.files ?? [])];
    if (!files.length) return setError("Choose one or more round_<n>.json files.");
    if (!reason.trim()) return setError("Enter a reason.");
    setError(null);
    setBusy(true);
    const list: FileResult[] = files.map((f) => ({ name: f.name, state: "waiting" }));
    setResults([...list]);
    for (let i = 0; i < files.length; i++) {
      list[i] = { ...list[i]!, state: "importing" };
      setResults([...list]);
      const fd = new FormData();
      fd.append("files", files[i]!);
      fd.set("reason", reason);
      try {
        const r = await importRoundsAction(idleState, fd);
        const detail = r.issues?.[0]?.replace(`${files[i]!.name}: `, "") ?? r.message;
        list[i] = { ...list[i]!, state: r.status === "success" ? "done" : "failed", message: detail, href: r.href };
      } catch {
        list[i] = { ...list[i]!, state: "failed", message: "Upload failed. Check the file size (3 MB at most) and try again." };
      }
      setResults([...list]);
    }
    setBusy(false);
    input.value = "";
  }

  const done = results.filter((r) => r.state === "done").length;
  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <Field
        label="Round files"
        hint="Select one or more round_<n>.json files from inductions/<n>/merit/. The induction is read from each file. Re-importing a round replaces it. Names, PMDC numbers, emails and employment details in the files are not stored."
      >
        {(id) => (
          <input
            id={id}
            name="files"
            type="file"
            multiple
            accept="application/json,.json"
            required
            disabled={busy}
            className={cn(fieldClass, "file:mr-3 file:rounded-full file:border-0 file:bg-elevated file:px-3 file:py-1 file:text-ink")}
          />
        )}
      </Field>
      <ReasonField placeholder="e.g. Round 6 published for induction 20" value={reason} onChange={setReason} />
      <div><Button type="submit" disabled={busy}>{busy ? `Importing ${done + 1} of ${results.length}…` : "Import rounds"}</Button></div>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      {results.length ? (
        <ul aria-live="polite" className="grid gap-1.5 text-sm">
          {results.map((r) => (
            <li key={r.name} className="flex items-start gap-3 rounded-xl bg-canvas px-3 py-2">
              <span aria-hidden className={cn("mt-1.5 h-2 w-2 flex-none rounded-full", r.state === "done" ? "bg-success" : r.state === "failed" ? "bg-danger" : r.state === "importing" ? "animate-pulse bg-ember motion-reduce:animate-none" : "bg-line-strong")} />
              <span className="min-w-0">
                <span className="font-mono text-xs">{r.name}</span>
                <span className="sr-only"> {r.state}</span>
                {r.message ? <span className={cn("block text-xs", r.state === "failed" ? "text-danger" : "text-muted")}>{r.message}</span> : null}
                {r.href ? <a href={r.href} className="text-xs font-semibold text-signal hover:underline">Review and publish →</a> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}

export function DeleteRoundForm({ roundId, label }: { roundId: number; label: string }) {
  const [state, action, pending] = useActionState(deleteRoundAction, idleState);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  if (!confirming) {
    return <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(true)} aria-label={`Remove ${label}`}>Remove</Button>;
  }
  return (
    <form action={action} className="flex flex-wrap items-center justify-end gap-2">
      <input type="hidden" name="roundId" value={roundId} />
      <label className="sr-only" htmlFor={`del-${roundId}`}>Reason for removing {label}</label>
      <input id={`del-${roundId}`} name="reason" required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" className={cn(fieldClass, "h-9 w-40 py-1")} />
      <Button type="submit" size="sm" variant="danger" disabled={pending || !reason.trim()}>{pending ? "…" : `Remove ${label}`}</Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
      {state.status === "error" ? <span role="alert" className="text-xs text-danger">{state.message}</span> : null}
    </form>
  );
}

export function AliasForm({ kind, name, rows, options }: { kind: "speciality" | "hospital"; name: string; rows: number; options: { id: number; name: string }[] }) {
  const [state, action, pending] = useActionState(saveAliasAction, idleState);
  const [lookupId, setLookupId] = useState("");
  const [reason, setReason] = useState("");
  return (
    <form action={action} className="grid gap-2 rounded-xl bg-canvas p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto] sm:items-center">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="name" value={name} />
      <p className="min-w-0 text-sm"><span className="font-medium">“{name}”</span> <span className="text-xs text-subtle">· {rows} allocations</span></p>
      <label className="sr-only" htmlFor={`a-${kind}-${name}`}>{kind === "speciality" ? "Speciality" : "Hospital"} for “{name}”</label>
      <select id={`a-${kind}-${name}`} name="lookupId" required value={lookupId} onChange={(e) => setLookupId(e.target.value)} className={cn(fieldClass, "h-9 py-1")}>
        <option value="">Same as…</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      <label className="sr-only" htmlFor={`r-${kind}-${name}`}>Reason</label>
      <input id={`r-${kind}-${name}`} name="reason" required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" className={cn(fieldClass, "h-9 py-1")} />
      <Button type="submit" size="sm" disabled={pending || !lookupId || !reason.trim()}>{pending ? "…" : "Map"}</Button>
      {state.status !== "idle" ? <p role={state.status === "error" ? "alert" : "status"} className={cn("text-xs sm:col-span-4", state.status === "error" ? "text-danger" : "text-success")}>{state.message}</p> : null}
    </form>
  );
}
