"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { formInt, formOptionalInt, formText, proposalState, readJsonUpload, toActionState, type ActionState } from "@/lib/action-state";
import { importAllFromInbox, importFromInbox, INBOX_KINDS, listInbox, skipInboxFile, type InboxKind } from "@/lib/data/inbox";
import { requireReason } from "@/lib/data/shared";
import { getSession } from "@/lib/auth/session";
import { proposeDeleteRound, proposeMeritRound } from "@/lib/data/changes";
import { saveNameAlias } from "@/lib/data/merit";
import { getDb } from "@/lib/db/client";
import { roundNoFromFilename } from "@/lib/domain/merit-round";
import { UserFacingError } from "@/lib/errors";

/** Server Actions for merit rounds. The data layer checks the admin role. */

const MAX_FILE_BYTES = 3 * 1024 * 1024;
const MAX_FILES = 20;

/**
 * Import one or more round files. Each file's round number comes from its name
 * (round_3.json); the induction comes from the file itself. Files are imported one
 * by one, each all or nothing, and the result lists every file.
 */
export async function importRoundsAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const reason = formText(form, "reason");
  if (!files.length) return { status: "error", message: "Choose one or more round_<n>.json files." };
  if (files.length > MAX_FILES) return { status: "error", message: `Import at most ${MAX_FILES} files at a time.` };

  const done: string[] = [], failed: string[] = [], staged: string[] = [];
  for (const file of files) {
    try {
      const roundNo = roundNoFromFilename(file.name);
      if (!roundNo) throw new UserFacingError("the round number is not in the file name (expected round_<n>.json)");
      const single = new FormData();
      single.set("file", file);
      const p = await proposeMeritRound(getDb(), await getSession(), { roundNo, file: await readJsonUpload(single, "file", MAX_FILE_BYTES), reason });
      done.push(`${file.name}: ${p.message}`);
      if (!p.applied) staged.push(p.changeId);
    } catch (err) {
      const s = toActionState(err);
      failed.push(`${file.name}: ${s.message}${s.issues?.length ? ` (${s.issues.slice(0, 2).join("; ")})` : ""}`);
      if (s.message?.startsWith("You are not allowed") || /reason is required/.test(s.message ?? "")) break;
    }
  }
  revalidatePath("/admin/inductions");
  revalidatePath("/portal", "layout");
  revalidatePath("/admin/changes");
  if (!done.length) return { status: "error", message: "Nothing was imported.", issues: failed };
  const review = staged.length ? { href: staged.length === 1 ? `/admin/changes/${staged[0]}` : "/admin/changes", hrefLabel: "Review and publish" } : {};
  return { status: failed.length ? "error" : "success", message: `Processed ${done.length} of ${files.length} files.`, issues: [...done, ...failed], ...review };
}

export async function deleteRoundAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const p = await proposeDeleteRound(getDb(), await getSession(), { roundId: formInt(form, "roundId", "Round"), reason: formText(form, "reason") });
    revalidatePath("/admin/changes");
    return proposalState(p);
  } catch (err) {
    return toActionState(err);
  }
}

export async function saveAliasAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const kind = form.get("kind") === "hospital" ? "hospital" : "speciality";
    const lookupId = Number(form.get("lookupId"));
    if (!Number.isInteger(lookupId)) throw new UserFacingError("Choose what this name refers to.");
    const r = await saveNameAlias(getDb(), await getSession(), { kind, name: formText(form, "name"), lookupId, reason: formText(form, "reason") });
    revalidatePath("/admin/inductions");
    revalidatePath("/portal", "layout");
    return { status: "success", message: `Mapped to ${r.target}; ${r.updated} allocations updated.` };
  } catch (err) {
    return toActionState(err);
  }
}

export async function importInboxAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let target: string;
  try {
    const kind = formText(form, "kind") as InboxKind;
    if (!(kind in INBOX_KINDS)) throw new UserFacingError("Unknown inbox folder.");
    const name = formText(form, "name");
    const p = await importFromInbox(getDb(), await getSession(), {
      kind,
      name,
      reason: formText(form, "reason"),
      calendarYear: formOptionalInt(form, "calendarYear", "Calendar year"),
    });
    revalidatePath("/admin", "layout");
    revalidatePath("/portal", "layout");
    // The file leaves the inbox, so its row disappears: report the outcome on the page instead.
    const q = new URLSearchParams({ inbox: name, ...(p.applied ? {} : { change: p.changeId }) });
    target = `/admin/inductions?${q.toString()}#inbox`;
  } catch (err) {
    return toActionState(err);
  }
  redirect(target);
}

export async function skipInboxAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let target: string;
  try {
    const kind = formText(form, "kind") as InboxKind;
    if (!(kind in INBOX_KINDS)) throw new UserFacingError("Unknown inbox folder.");
    const name = formText(form, "name");
    await skipInboxFile(getDb(), await getSession(), { kind, name, reason: formText(form, "reason") });
    revalidatePath("/admin", "layout");
    target = `/admin/inductions?${new URLSearchParams({ skipped: name }).toString()}#inbox`;
  } catch (err) {
    return toActionState(err);
  }
  redirect(target);
}

/**
 * Import every valid new file in the inbox (policy, reference, merit, seats). It runs
 * after the response: a large batch takes minutes, longer than a proxy such as
 * Cloudflare waits for one request. Progress shows as files leave the inbox; each
 * import is in the audit history.
 */
export async function importAllInboxAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const db = getDb();
    const session = await getSession();
    const reason = formText(form, "reason");
    requireReason(reason, "imports");
    const items = await listInbox(db, session);
    const n = items.filter((i) => i.kind !== "unrecognised" && i.canImport && !i.replaces && !i.issues.length).length;
    if (!n) return { status: "error", message: "No new valid files to import." };
    after(async () => {
      const r = await importAllFromInbox(db, session, { reason });
      console.log(`bulk import: ${r.imported.length} imported, ${r.failed.length} failed, ${r.leftForReview} left for review`);
      for (const f of r.failed) console.log(`bulk import failed: ${f.name}: ${f.message}`);
    });
    return { status: "success", message: `Importing ${n} file${n === 1 ? "" : "s"} in the background. Reload this page in a minute or two: imported files leave the list; any that fail stay with their reason.` };
  } catch (err) {
    return toActionState(err);
  }
}
