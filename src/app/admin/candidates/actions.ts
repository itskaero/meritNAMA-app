"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formInt, formText, proposalState, toActionState, type ActionState } from "@/lib/action-state";
import { getSession } from "@/lib/auth/session";
import { revokeCorrection } from "@/lib/data/candidate-records";
import { reviewLink } from "@/lib/data/candidates";
import { proposeCorrections } from "@/lib/data/changes";
import { parseCorrectionsCsv } from "@/lib/domain/corrections";
import { getDb } from "@/lib/db/client";
import { isUuid } from "@/lib/format";
import { UserFacingError } from "@/lib/errors";

export async function reviewLinkAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let status: string;
  try {
    const id = formText(form, "id");
    if (!isUuid(id)) throw new UserFacingError("That request no longer exists.");
    const decision = formText(form, "decision") === "approve" ? "approve" : "reject";
    status = await reviewLink(getDb(), await getSession(), { id, decision, reason: formText(form, "reason") });
  } catch (err) {
    return toActionState(err);
  }
  // The request leaves the queue, so the confirmation is shown by the page.
  revalidatePath("/admin", "layout");
  redirect(`/admin/candidates?decided=${status}`);
}

// ── Candidate records: corrections ─────────────────────────────────────────────

const MAX_CSV_BYTES = 512 * 1024;

/** One correction from the record page; always staged for review. */
export async function proposeCorrectionAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const field = formText(form, "field");
    const raw = formText(form, "value").trim();
    const p = await proposeCorrections(getDb(), await getSession(), {
      induction: formInt(form, "induction", "Induction"),
      corrections: [{ applicantId: formText(form, "applicantId"), field, program: field === "program_marks" ? formText(form, "program") || null : null, value: raw === "" ? Number.NaN : Number(raw) }],
      reason: formText(form, "reason"),
      source: "record",
    });
    revalidatePath("/admin", "layout");
    return proposalState(p);
  } catch (err) {
    return toActionState(err);
  }
}

/** A corrections CSV for one induction; every line is checked, then the whole file is staged as one change. */
export async function importCorrectionsAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const upload = form.get("file");
    if (!(upload instanceof File) || upload.size === 0) throw new UserFacingError("Choose a CSV file to import.");
    if (upload.size > MAX_CSV_BYTES) throw new UserFacingError(`The file is larger than ${MAX_CSV_BYTES / 1024} KB.`);
    const { corrections, errors } = parseCorrectionsCsv(await upload.text());
    if (errors.length) return { status: "error", message: "The file has problems. Nothing was staged.", issues: errors };
    const p = await proposeCorrections(getDb(), await getSession(), { induction: formInt(form, "induction", "Induction"), corrections, reason: formText(form, "reason"), source: "file" });
    revalidatePath("/admin", "layout");
    return proposalState(p);
  } catch (err) {
    return toActionState(err);
  }
}

export async function revokeCorrectionAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const id = formText(form, "id");
    if (!isUuid(id)) throw new UserFacingError("That correction does not exist.");
    await revokeCorrection(getDb(), await getSession(), { id, reason: formText(form, "reason") });
    revalidatePath("/admin/candidates", "layout");
    return { status: "success", message: "Withdrawn. The simulation uses the imported value from its next run." };
  } catch (err) {
    return toActionState(err);
  }
}
