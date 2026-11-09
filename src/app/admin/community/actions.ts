"use server";

import { revalidatePath } from "next/cache";
import { formText, toActionState, type ActionState } from "@/lib/action-state";
import { getSession } from "@/lib/auth/session";
import { dismissReports, markDuplicate, moderate, searchThreads, type ContentKind, type ModerationAction } from "@/lib/data/community";
import { getDb } from "@/lib/db/client";
import { isUuid } from "@/lib/format";
import { UserFacingError } from "@/lib/errors";

const ACTIONS: ModerationAction[] = ["hide", "show", "lock", "unlock", "pin", "unpin"];

export async function moderateAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const id = formText(form, "id");
    const action = formText(form, "action") as ModerationAction;
    if (!isUuid(id) || !ACTIONS.includes(action)) throw new UserFacingError("Unknown moderation request.");
    const kind = (["thread", "post", "review", "message"].includes(String(form.get("kind"))) ? form.get("kind") : "post") as ContentKind;
    await moderate(getDb(), await getSession(), { kind, id, action, reason: formText(form, "reason") });
    revalidatePath("/admin/community");
    revalidatePath("/portal", "layout");
    return { status: "success", message: `Done: ${action}.` };
  } catch (err) {
    return toActionState(err);
  }
}

export async function dismissAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const id = formText(form, "id");
    if (!isUuid(id)) throw new UserFacingError("Unknown report.");
    await dismissReports(getDb(), await getSession(), { kind: (["thread", "post", "review", "message"].includes(String(form.get("kind"))) ? form.get("kind") : "post") as ContentKind, id, reason: formText(form, "reason") });
    revalidatePath("/admin/community");
    return { status: "success", message: "Reports dismissed." };
  } catch (err) {
    return toActionState(err);
  }
}

export async function duplicateAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const threadId = formText(form, "threadId"), originalId = formText(form, "originalId");
    if (!isUuid(threadId) || !isUuid(originalId)) throw new UserFacingError("Pick the original question from the list.");
    await markDuplicate(getDb(), await getSession(), { threadId, originalId, reason: formText(form, "reason") });
    revalidatePath("/portal/community", "layout");
    return { status: "success", message: "Closed as a duplicate." };
  } catch (err) {
    return toActionState(err);
  }
}

/** Title search for the duplicate picker. */
export async function searchThreadsAction(q: string, excludeId: string) {
  try {
    return await searchThreads(getDb(), await getSession(), String(q), isUuid(excludeId) ? excludeId : undefined);
  } catch {
    return [];
  }
}
