"use server";

import { revalidatePath } from "next/cache";
import { formText, toActionState, type ActionState } from "@/lib/action-state";
import { getSession } from "@/lib/auth/session";
import { postAnnouncement, removeAnnouncement } from "@/lib/data/announcements";
import { getDb } from "@/lib/db/client";

/** Notification bar posts. The data layer checks the role. */

export async function postNoticeAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    await postAnnouncement(getDb(), await getSession(), {
      text: formText(form, "text"),
      href: formText(form, "href"),
      tone: formText(form, "tone") || "info",
      audience: formText(form, "audience") || "all",
      days: Number(formText(form, "days")) || 0,
    });
    revalidatePath("/", "layout");
    return { status: "success", message: "Posted. It shows at the top of every page now." };
  } catch (e) {
    return toActionState(e);
  }
}

export async function removeNoticeAction(form: FormData) {
  try {
    await removeAnnouncement(getDb(), await getSession(), formText(form, "id"));
  } catch {
    // Already removed.
  }
  revalidatePath("/", "layout");
}
