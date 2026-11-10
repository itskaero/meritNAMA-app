"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { formText, toActionState, type ActionState } from "@/lib/action-state";
import { SESSION_COOKIE } from "@/lib/auth/login";
import { getSession } from "@/lib/auth/session";
import { deleteMyAccount } from "@/lib/data/account";
import { getDb } from "@/lib/db/client";

/** Delete the signed-in account after the person types their email. Signs them out. */
export async function deleteAccountAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    await deleteMyAccount(getDb(), await getSession(), { confirmEmail: formText(form, "confirmEmail") });
  } catch (err) {
    return toActionState(err);
  }
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/sign-in?deleted=1");
}
