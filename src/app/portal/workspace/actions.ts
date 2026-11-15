"use server";

import { revalidatePath } from "next/cache";
import { formText, toActionState, type ActionState } from "@/lib/action-state";
import { getSession } from "@/lib/auth/session";
import { setShortlistAlerts } from "@/lib/data/notifications";
import { setMyPrivacy } from "@/lib/data/privacy";
import { isPrivacySwitch } from "@/lib/domain/settings";
import { deleteView, saveView } from "@/lib/data/workspace";
import { getDb } from "@/lib/db/client";
import { isUuid } from "@/lib/format";

export async function saveViewAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    await saveView(getDb(), await getSession(), { label: formText(form, "label"), href: formText(form, "href") });
    revalidatePath("/portal/workspace");
    return { status: "success", message: "Saved to your workspace.", href: "/portal/workspace", hrefLabel: "Open the workspace" };
  } catch (err) {
    return toActionState(err);
  }
}

export async function deleteViewAction(form: FormData) {
  const id = formText(form, "id");
  if (isUuid(id)) await deleteView(getDb(), await getSession(), id);
  revalidatePath("/portal/workspace");
}

export async function setPrivacyAction(form: FormData) {
  // Only the switches the page showed: the others keep their value.
  const shown = form.getAll("shown").map(String).filter(isPrivacySwitch);
  await setMyPrivacy(getDb(), await getSession(), Object.fromEntries(shown.map((k) => [k, form.get(k) === "on"])));
  revalidatePath("/portal", "layout");
}

export async function setAlertsAction(form: FormData) {
  await setShortlistAlerts(getDb(), await getSession(), formText(form, "on") === "1");
  revalidatePath("/portal/workspace");
}
