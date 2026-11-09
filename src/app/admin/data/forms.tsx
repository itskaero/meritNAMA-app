"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { ActionResult, Field, fieldClass, ReasonField } from "@/components/ui/form";
import { idleState, type ActionState } from "@/lib/action-state";
import { applyAllAction, applyFileAction, buildEstimateAction, removeFileAction, saveSettingsAction, scanAction, syncAction } from "./actions";

/** Pending state around a Server Action that takes no form. */
function useOneShot(action: () => Promise<ActionState>) {
  const [state, setState] = useState<ActionState>(idleState);
  const [pending, start] = useTransition();
  return { state, pending, run: () => start(async () => setState(await action())) };
}

// ── Drop zone ──────────────────────────────────────────────────────────────────

type Item = { file: File; path: string };
type Row = { path: string; state: "waiting" | "sending" | "done" | "failed"; message?: string };

/** Keep the part of a dropped path that follows the old repository's layout. */
function repoPath(raw: string) {
  const p = raw.replace(/\\/g, "/").replace(/^\/+/, "");
  const at = p.toLowerCase().indexOf("inductions/");
  return at > 0 ? p.slice(at) : p;
}

async function entriesOf(entry: FileSystemEntry, into: Item[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
    into.push({ file, path: repoPath(entry.fullPath) });
  } else if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
      if (!batch.length) break;
      for (const e of batch) await entriesOf(e, into);
    }
  }
}

/**
 * Drag JSON files, or a whole folder, onto the box. Each file goes up in its own
 * request with the path it had inside the dropped folder, so inductions/21/merit/
 * round_8.json lands where the old repository kept it. Afterwards the folder is
 * rescanned and, with auto-publish on, new data goes live straight away.
 */
export function DropZone({ autoPublish }: { autoPublish: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [after, setAfter] = useState<ActionState>(idleState);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  async function send(items: Item[]) {
    const json = items.filter((i) => /\.json$/i.test(i.file.name));
    const skipped = items.length - json.length;
    if (!json.length) {
      setAfter({ status: "error", message: items.length ? "Only .json files are accepted." : "Nothing to upload." });
      return;
    }
    setBusy(true);
    setAfter(idleState);
    const list: Row[] = json.map((i) => ({ path: i.path, state: "waiting" }));
    setRows([...list]);
    let ok = 0;
    for (let n = 0; n < json.length; n++) {
      list[n] = { ...list[n]!, state: "sending" };
      setRows([...list]);
      const fd = new FormData();
      fd.set("file", json[n]!.file);
      fd.set("path", json[n]!.path);
      try {
        const res = await fetch("/api/admin/data/upload", { method: "POST", body: fd });
        const body = (await res.json().catch(() => ({}))) as { path?: string; error?: string };
        if (res.ok) { list[n] = { path: body.path ?? json[n]!.path, state: "done" }; ok++; }
        else list[n] = { ...list[n]!, state: "failed", message: res.status === 401 || res.status === 403 ? "You are not allowed to add data." : (body.error ?? `Upload failed (${res.status}).`) };
      } catch {
        list[n] = { ...list[n]!, state: "failed", message: "Upload failed. Check your connection and the file size (200 MB at most)." };
      }
      setRows([...list]);
    }
    if (ok) {
      const scanned = await scanAction();
      if (scanned.status === "success" && autoPublish) setAfter(await applyAllAction());
      else setAfter(scanned);
    }
    if (skipped) setAfter((a) => ({ ...a, issues: [...(a.issues ?? []), `${skipped} file${skipped === 1 ? "" : "s"} skipped: not .json.`] }));
    setBusy(false);
    router.refresh();
  }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setOver(false);
    const items: Item[] = [];
    const entries = [...e.dataTransfer.items].map((i) => i.webkitGetAsEntry?.()).filter((x): x is FileSystemEntry => Boolean(x));
    if (entries.length) for (const en of entries) await entriesOf(en, items);
    else for (const f of e.dataTransfer.files) items.push({ file: f, path: f.name });
    void send(items);
  }

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const items = [...(e.target.files ?? [])].map((f) => ({ file: f, path: repoPath((f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name) }));
    e.target.value = "";
    void send(items);
  };

  return (
    <div className="grid gap-3">
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cn(
          "mn-dots grid place-items-center gap-3 rounded-xl border-2 border-dashed px-4 py-10 text-center transition-colors",
          over ? "border-signal bg-tint" : "border-line-strong bg-canvas",
        )}
      >
        <p className="text-base font-semibold">Drop JSON files or a whole data folder here</p>
        <p className="max-w-xl text-sm text-muted">
          Merit lists, seat files, the scoring policy, the gazette, reference files. Old file names work as they are. {autoPublish ? "New data goes live by itself; anything that replaces live data waits for your click." : "Nothing goes live until you press Publish."}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button type="button" variant="secondary" disabled={busy} onClick={() => fileInput.current?.click()}>Choose files</Button>
          <Button type="button" variant="secondary" disabled={busy} onClick={() => folderInput.current?.click()}>Choose a folder</Button>
        </div>
        <input ref={fileInput} type="file" multiple accept="application/json,.json" className="sr-only" tabIndex={-1} aria-label="Choose JSON files" onChange={pick} />
        <input ref={folderInput} type="file" multiple className="sr-only" tabIndex={-1} aria-label="Choose a data folder" onChange={pick}
          {...({ webkitdirectory: "", directory: "" } as Record<string, string>)} />
      </div>
      {rows.length ? (
        <ul aria-live="polite" className="grid max-h-72 gap-1 overflow-auto text-sm">
          {rows.map((r, i) => (
            <li key={`${r.path}-${i}`} className="flex items-start gap-3 rounded-lg bg-canvas px-3 py-1.5">
              <span aria-hidden className={cn("mt-1.5 h-2 w-2 flex-none rounded-full", r.state === "done" ? "bg-success" : r.state === "failed" ? "bg-danger" : r.state === "sending" ? "mn-pulse bg-ember" : "bg-line-strong")} />
              <span className="min-w-0">
                <span className="font-mono text-xs">{r.path}</span>
                <span className="sr-only"> {r.state}</span>
                {r.message ? <span className="block text-xs text-danger">{r.message}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <ActionResult state={after} />
    </div>
  );
}

// ── Whole-folder actions ───────────────────────────────────────────────────────

export function RescanButton() {
  const { state, pending, run } = useOneShot(scanAction);
  return (
    <div className="grid gap-2">
      <div><Button type="button" variant="secondary" size="sm" disabled={pending} onClick={run}>{pending ? "Looking…" : "Rescan the folder"}</Button></div>
      <ActionResult state={state} />
    </div>
  );
}

export function PublishAllButton({ count }: { count: number }) {
  const { state, pending, run } = useOneShot(applyAllAction);
  return (
    <div className="grid gap-2">
      <div><Button type="button" disabled={pending || count === 0} onClick={run}>{pending ? "Publishing… keep this page open" : count ? `Publish ${count} new file${count === 1 ? "" : "s"}` : "Nothing new to publish"}</Button></div>
      <ActionResult state={state} />
    </div>
  );
}

export function SyncButton({ ready }: { ready: boolean }) {
  const { state, pending, run } = useOneShot(syncAction);
  return (
    <div className="grid gap-2">
      <div><Button type="button" variant="secondary" disabled={pending || !ready} onClick={run}>{pending ? "Syncing…" : "Sync now"}</Button></div>
      <ActionResult state={state} />
    </div>
  );
}

// ── One file ───────────────────────────────────────────────────────────────────

export function FileActions({ id, status, canApply, changeId }: { id: string; status: string; canApply: boolean; changeId: string | null }) {
  const [state, action, pending] = useActionState(applyFileAction, idleState);
  const [removing, setRemoving] = useState(false);
  const [rm, rmAction, rmPending] = useActionState(removeFileAction, idleState);
  const [reason, setReason] = useState("");
  const staged = status === "replaces" && changeId;
  return (
    <div className="grid justify-items-end gap-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {staged ? (
          <a href={`/admin/changes/${changeId}`} className="inline-flex h-9 items-center rounded-lg border border-line-strong px-3.5 text-sm font-medium hover:bg-hover">Review the change</a>
        ) : canApply ? (
          <form action={action}>
            <input type="hidden" name="id" value={id} />
            <Button type="submit" size="sm" disabled={pending}>{pending ? "…" : status === "replaces" ? "Show what changes" : "Publish"}</Button>
          </form>
        ) : null}
        <a href={`/api/admin/data/file/${id}`} className="inline-flex h-9 items-center rounded-lg px-3 text-sm text-muted hover:bg-hover hover:text-ink" download>Download</a>
        {removing ? null : <Button type="button" size="sm" variant="ghost" onClick={() => setRemoving(true)}>Remove</Button>}
      </div>
      {removing ? (
        <form action={rmAction} className="flex flex-wrap items-center justify-end gap-2">
          <input type="hidden" name="id" value={id} />
          <label className="sr-only" htmlFor={`rm-${id}`}>Reason for removing this file</label>
          <input id={`rm-${id}`} name="reason" required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" className={cn(fieldClass, "h-9 w-40 py-1")} />
          <Button type="submit" size="sm" variant="danger" disabled={rmPending || !reason.trim()}>{rmPending ? "…" : "Remove file"}</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setRemoving(false)}>Cancel</Button>
        </form>
      ) : null}
      {state.status === "error" ? <p role="alert" className="max-w-sm text-right text-xs text-danger">{state.message}</p> : null}
      {state.status === "success" ? (
        <p role="status" className="max-w-sm text-right text-xs text-success">
          {state.message} {state.href ? <a href={state.href} className="font-semibold text-signal hover:underline">{state.hrefLabel} →</a> : null}
        </p>
      ) : null}
      {rm.status === "error" ? <p role="alert" className="max-w-sm text-right text-xs text-danger">{rm.message}</p> : null}
    </div>
  );
}

// ── Estimates and settings ─────────────────────────────────────────────────────

export function BuildEstimateForm({ induction }: { induction: number }) {
  const [state, action, pending] = useActionState(buildEstimateAction, idleState);
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="induction" value={induction} />
      <div><Button type="submit" size="sm" disabled={pending}>{pending ? "Building… this can take a minute" : `Build the estimate dataset for induction ${induction}`}</Button></div>
      <ActionResult state={state} />
    </form>
  );
}

export function SettingsForm({ initial, tokenSet }: { initial: { autoPublish: boolean; repo: string; branch: string }; tokenSet: boolean }) {
  const [state, action, pending] = useActionState(saveSettingsAction, idleState);
  const [reason, setReason] = useState("");
  return (
    <form action={action} className="grid gap-4">
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="autoPublish" defaultChecked={initial.autoPublish} className="mt-1 h-4 w-4 accent-[var(--mn-action)]" />
        <span><span className="font-medium">Publish new data automatically.</span> <span className="text-muted">Files that are new and pass the checks go live within a minute. A file that replaces live data always waits for your click.</span></span>
      </label>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Field label="Data repository on GitHub" hint={tokenSet ? "A GitHub token is set on the server, so private repositories work." : "Public repositories only: for a private one, set GITHUB_TOKEN on the server."}>
          {(id) => <input id={id} name="repo" defaultValue={initial.repo} placeholder="owner/name" autoComplete="off" spellCheck={false} className={fieldClass} />}
        </Field>
        <Field label="Branch">
          {(id) => <input id={id} name="branch" defaultValue={initial.branch} autoComplete="off" spellCheck={false} className={fieldClass} />}
        </Field>
      </div>
      <ReasonField placeholder="e.g. Pull the data from the private repository" value={reason} onChange={setReason} />
      <div><Button type="submit" disabled={pending || !reason.trim()}>{pending ? "Saving…" : "Save settings"}</Button></div>
      <ActionResult state={state} />
    </form>
  );
}
