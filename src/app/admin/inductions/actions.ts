"use server";

import { revalidatePath } from "next/cache";
import { formText, readJsonUpload, toActionState, type ActionState } from "@/lib/action-state";
import { getSession } from "@/lib/auth/session";
import { deleteMeritRound, importMeritRound, saveNameAlias } from "@/lib/data/merit";
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

  const done: string[] = [], failed: string[] = [];
  for (const file of files) {
    try {
      const roundNo = roundNoFromFilename(file.name);
      if (!roundNo) throw new UserFacingError("the round number is not in the file name (expected round_<n>.json)");
      const single = new FormData();
      single.set("file", file);
      const r = await importMeritRound(getDb(), await getSession(), { roundNo, file: await readJsonUpload(single, "file", MAX_FILE_BYTES), reason });
      const unmatched = r.unmatched.specialities.length + r.unmatched.hospitals.length;
      done.push(`${file.name}: induction ${r.inductionId} round ${r.roundNo}, ${r.allocations} allocations${r.replaced ? " (replaced)" : ""}${unmatched ? `, ${unmatched} names to map` : ""}`);
    } catch (err) {
      const s = toActionState(err);
      failed.push(`${file.name}: ${s.message}${s.issues?.length ? ` (${s.issues.slice(0, 2).join("; ")})` : ""}`);
      if (s.message?.startsWith("You are not allowed") || /reason is required/.test(s.message ?? "")) break;
    }
  }
  revalidatePath("/admin/inductions");
  revalidatePath("/portal", "layout");
  if (!done.length) return { status: "error", message: "Nothing was imported.", issues: failed };
  return { status: failed.length ? "error" : "success", message: `Imported ${done.length} of ${files.length} files.`, issues: [...done, ...failed] };
}

export async function deleteRoundAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    await deleteMeritRound(getDb(), await getSession(), { roundId: Number(form.get("roundId")), reason: formText(form, "reason") });
    revalidatePath("/admin/inductions");
    revalidatePath("/portal", "layout");
    return { status: "success", message: "Round removed." };
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
