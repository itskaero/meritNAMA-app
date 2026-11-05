"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formText, toActionState, type ActionState } from "@/lib/action-state";
import { getSession } from "@/lib/auth/session";
import { reviewLink } from "@/lib/data/candidates";
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
