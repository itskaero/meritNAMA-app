"use server";

import { revalidatePath } from "next/cache";
import { formText, toActionState, type ActionState } from "@/lib/action-state";
import { getSession } from "@/lib/auth/session";
import { grantAccess, reviewAccessRequest, revokeAccess, saveAccessSettings } from "@/lib/data/access";
import { getDb } from "@/lib/db/client";
import { UserFacingError } from "@/lib/errors";
import { isUuid } from "@/lib/format";

/** Access (paywall) Server Actions. The data layer checks who may do what. */

const done = (message: string): ActionState => {
  revalidatePath("/admin/access");
  revalidatePath("/admin", "layout");
  return { status: "success", message };
};

export async function reviewAccessAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const id = formText(form, "id");
    if (!isUuid(id)) throw new UserFacingError("That request no longer exists.");
    const decision = formText(form, "decision") === "approve" ? "approve" : "reject";
    const r = await reviewAccessRequest(getDb(), await getSession(), { id, decision, note: formText(form, "note") });
    return done(decision === "approve" ? `Approved ${r.email}. They were emailed.` : `Rejected ${r.email}.`);
  } catch (err) {
    return toActionState(err);
  }
}

export async function grantAccessAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const r = await grantAccess(getDb(), await getSession(), { email: formText(form, "email"), note: formText(form, "note") });
    return done(`${r.email} now has access. They were emailed.`);
  } catch (err) {
    return toActionState(err);
  }
}

export async function revokeAccessAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const id = formText(form, "id");
    if (!isUuid(id)) throw new UserFacingError("That request no longer exists.");
    await revokeAccess(getDb(), await getSession(), { id, note: formText(form, "note") });
    return done("Access removed.");
  } catch (err) {
    return toActionState(err);
  }
}

const num = (form: FormData, k: string) => Number(formText(form, k).replace(/,/g, "")) || 0;
const on = (form: FormData, k: string) => form.get(k) === "on";

export async function saveAccessSettingsAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    await saveAccessSettings(getDb(), await getSession(), {
      paywall: on(form, "paywall"),
      requestsOpen: on(form, "requestsOpen"),
      paymentRequired: on(form, "paymentRequired"),
      keepExisting: on(form, "keepExisting"),
      priceMinPkr: num(form, "priceMinPkr"),
      priceMaxPkr: num(form, "priceMaxPkr"),
      bankName: formText(form, "bankName"),
      accountNumber: formText(form, "accountNumber"),
      accountTitle: formText(form, "accountTitle"),
      raastId: formText(form, "raastId"),
      note: formText(form, "note"),
      closedMessage: formText(form, "closedMessage"),
      reason: formText(form, "reason"),
    });
    return done("Saved.");
  } catch (err) {
    return toActionState(err);
  }
}
