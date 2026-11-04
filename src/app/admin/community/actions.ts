"use server";

import { revalidatePath } from "next/cache";
import { toActionState, type ActionState } from "@/lib/action-state";
import { getSession } from "@/lib/auth/session";
import { dismissReports, moderate, type ModerationAction } from "@/lib/data/community";
import { getDb } from "@/lib/db/client";
import { isUuid } from "@/lib/format";
import { UserFacingError } from "@/lib/errors";

const ACTIONS: ModerationAction[] = ["hide", "show", "lock", "unlock", "pin", "unpin"];

export async function moderateAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const id = String(form.get("id") ?? "");
    const action = String(form.get("action") ?? "") as ModerationAction;
    if (!isUuid(id) || !ACTIONS.includes(action)) throw new UserFacingError("Unknown moderation request.");
    const kind = form.get("kind") === "thread" ? "thread" : "post";
    await moderate(getDb(), await getSession(), { kind, id, action, reason: String(form.get("reason") ?? "") });
    revalidatePath("/admin/community");
    revalidatePath("/portal/community", "layout");
    return { status: "success", message: `Done: ${action}.` };
  } catch (err) {
    return toActionState(err);
  }
}

export async function dismissAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const id = String(form.get("id") ?? "");
    if (!isUuid(id)) throw new UserFacingError("Unknown report.");
    await dismissReports(getDb(), await getSession(), { kind: form.get("kind") === "thread" ? "thread" : "post", id, reason: String(form.get("reason") ?? "") });
    revalidatePath("/admin/community");
    return { status: "success", message: "Reports dismissed." };
  } catch (err) {
    return toActionState(err);
  }
}
