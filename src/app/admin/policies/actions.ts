"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formText, proposalState, readJsonUpload, toActionState, type ActionState } from "@/lib/action-state";
import { getSession } from "@/lib/auth/session";
import { proposeActivation, proposePolicyFile } from "@/lib/data/changes";
import { createPolicyDraft } from "@/lib/data/policies";
import { getDb } from "@/lib/db/client";

/**
 * Server Actions for the scoring-policy manager. They are reachable by direct POST,
 * so authorization is enforced by the data layer (assertRole), not by the page.
 */

const MAX_FILE_BYTES = 512 * 1024;

export async function importPolicyFileAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const p = await proposePolicyFile(getDb(), await getSession(), {
      file: await readJsonUpload(form, "file", MAX_FILE_BYTES),
      reason: formText(form, "reason"),
    });
    revalidatePath("/admin/policies");
    revalidatePath("/admin/changes");
    return proposalState(p);
  } catch (err) {
    return toActionState(err);
  }
}

export async function saveDraftAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let id: string;
  try {
    const row = await createPolicyDraft(getDb(), await getSession(), {
      policyKey: formText(form, "policyKey"),
      definition: JSON.parse(formText(form, "definition")),
      reason: formText(form, "reason"),
    });
    id = row.id;
  } catch (err) {
    return toActionState(err);
  }
  revalidatePath("/admin/policies");
  redirect(`/admin/policies/${id}?saved=1`);
}

export async function activateAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const p = await proposeActivation(getDb(), await getSession(), { id: formText(form, "id"), reason: formText(form, "reason") });
    revalidatePath("/admin/changes");
    return proposalState(p);
  } catch (err) {
    return toActionState(err);
  }
}
