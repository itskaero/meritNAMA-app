"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { readJsonUpload, toActionState as toState, type ActionState } from "@/lib/action-state";
import { getSession } from "@/lib/auth/session";
import { activatePolicyVersion, createPolicyDraft, importScoringPolicyFile } from "@/lib/data/policies";
import { getDb } from "@/lib/db/client";

/**
 * Server Actions for the scoring-policy manager. They are reachable by direct POST,
 * so authorization is enforced by the data layer (assertRole), not by the page.
 */

const MAX_FILE_BYTES = 512 * 1024;

export async function importPolicyFileAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const result = await importScoringPolicyFile(getDb(), await getSession(), {
      file: await readJsonUpload(form, "file", MAX_FILE_BYTES),
      reason: String(form.get("reason") ?? ""),
    });
    revalidatePath("/admin/policies");
    return {
      status: "success",
      message: `Imported ${result.created.length} policies as new versions; "${result.activePolicy}" is now active.`,
    };
  } catch (err) {
    return toState(err);
  }
}

export async function saveDraftAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let id: string;
  try {
    const row = await createPolicyDraft(getDb(), await getSession(), {
      policyKey: String(form.get("policyKey") ?? ""),
      definition: JSON.parse(String(form.get("definition") ?? "")),
      reason: String(form.get("reason") ?? ""),
    });
    id = row.id;
  } catch (err) {
    return toState(err);
  }
  revalidatePath("/admin/policies");
  redirect(`/admin/policies/${id}?saved=1`);
}

export async function activateAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    await activatePolicyVersion(getDb(), await getSession(), {
      id: String(form.get("id") ?? ""),
      reason: String(form.get("reason") ?? ""),
    });
  } catch (err) {
    return toState(err);
  }
  revalidatePath("/admin/policies");
  return { status: "success", message: "This version is now the active scoring policy." };
}
