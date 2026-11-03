"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AuthorizationError } from "@/lib/auth/roles";
import { getSession } from "@/lib/auth/session";
import { activatePolicyVersion, createPolicyDraft, importScoringPolicyFile } from "@/lib/data/policies";
import { getDb } from "@/lib/db/client";

/**
 * Server Actions for the scoring-policy manager. They are reachable by direct POST,
 * so authorization is enforced by the data layer (assertRole), not by the page.
 */

export type ActionState = { status: "idle" | "error" | "success"; message?: string; issues?: string[] };

const MAX_FILE_BYTES = 512 * 1024;

function toState(err: unknown): ActionState {
  if (err instanceof z.ZodError) {
    return {
      status: "error",
      message: "The data did not pass validation. Nothing was saved.",
      issues: err.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    };
  }
  if (err instanceof AuthorizationError) return { status: "error", message: "You are not allowed to change scoring policies." };
  if (err instanceof SyntaxError) return { status: "error", message: `Not valid JSON: ${err.message}` };
  if (err instanceof Error && /reason is required/.test(err.message)) return { status: "error", message: err.message };
  console.error(err);
  return { status: "error", message: "Saving failed. Check that the database is reachable and try again." };
}

export async function importPolicyFileAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const upload = form.get("file");
  if (!(upload instanceof File) || upload.size === 0) return { status: "error", message: "Choose a scoring_policy.json file." };
  if (upload.size > MAX_FILE_BYTES) return { status: "error", message: "The file is larger than 512 KB; that is not a scoring policy file." };
  try {
    const result = await importScoringPolicyFile(getDb(), await getSession(), {
      file: JSON.parse(await upload.text()),
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
