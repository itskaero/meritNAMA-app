"use server";

import { revalidatePath } from "next/cache";
import { formText, toActionState, type ActionState } from "@/lib/action-state";
import { getSession } from "@/lib/auth/session";
import { bulkReviewAccess, createVouchers, grantAccess, importPayments, reviewAccessRequest, revokeAccess, revokeVoucher, saveAccessSettings } from "@/lib/data/access";
import { CHANNELS, type Channel } from "@/lib/payments/parse";
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
      easypaisaNumber: formText(form, "easypaisaNumber"),
      jazzcashNumber: formText(form, "jazzcashNumber"),
      walletTitle: formText(form, "walletTitle"),
      perInduction: on(form, "perInduction"),
      note: formText(form, "note"),
      closedMessage: formText(form, "closedMessage"),
      refundNote: formText(form, "refundNote"),
      reason: formText(form, "reason"),
    });
    return done("Saved.");
  } catch (err) {
    return toActionState(err);
  }
}

export async function bulkReviewAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const ids = form.getAll("ids").map(String).filter(isUuid);
    const decision = formText(form, "decision") === "reject" ? "reject" : "approve";
    const n = await bulkReviewAccess(getDb(), await getSession(), { ids, decision, note: formText(form, "note") });
    return done(`${decision === "approve" ? "Approved" : "Rejected"} ${n}. Each was emailed.`);
  } catch (err) {
    return toActionState(err);
  }
}

export async function importPaymentsAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const ch = formText(form, "channel");
    const channel: Channel = (CHANNELS as string[]).includes(ch) ? (ch as Channel) : "bank";
    const file = form.get("file");
    const text = file instanceof File && file.size ? await file.text() : formText(form, "text");
    const r = await importPayments(getDb(), await getSession(), { text, channel });
    return done(`Read ${r.found} payment${r.found === 1 ? "" : "s"}: ${r.added} new, ${r.already} already in${r.skipped ? `, ${r.skipped} part${r.skipped === 1 ? "" : "s"} skipped (not a received payment)` : ""}. ${r.approved} request${r.approved === 1 ? "" : "s"} approved automatically.`);
  } catch (err) {
    return toActionState(err);
  }
}

export async function createVouchersAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const codes = await createVouchers(getDb(), await getSession(), { count: Number(formText(form, "count")) || 0, note: formText(form, "note") });
    revalidatePath("/admin/access");
    return { status: "success", message: ["Copy these now; they are not shown again:", ...codes].join("\n") };
  } catch (err) {
    return toActionState(err);
  }
}

export async function revokeVoucherAction(form: FormData) {
  const id = formText(form, "id");
  if (isUuid(id)) await revokeVoucher(getDb(), await getSession(), { id }).catch(() => {});
  revalidatePath("/admin/access");
}
