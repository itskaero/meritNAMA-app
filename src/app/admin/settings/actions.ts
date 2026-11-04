"use server";

import { revalidatePath } from "next/cache";
import { formText, toActionState, type ActionState } from "@/lib/action-state";
import { getSession } from "@/lib/auth/session";
import { setUserRole } from "@/lib/data/team";
import { getDb } from "@/lib/db/client";

export async function setRoleAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const r = await setUserRole(getDb(), await getSession(), { email: formText(form, "email"), role: formText(form, "role"), reason: formText(form, "reason") });
    revalidatePath("/admin/settings");
    return { status: "success", message: r.changed ? "Role saved. It applies from their next request." : "No change." };
  } catch (err) {
    return toActionState(err);
  }
}
