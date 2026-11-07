"use server";

import { revalidatePath } from "next/cache";
import { formInt, formText, toActionState, type ActionState } from "@/lib/action-state";
import { getSession } from "@/lib/auth/session";
import { applyRetention, setFeatures, setRetention } from "@/lib/data/settings";
import { setUserRole } from "@/lib/data/team";
import { FEATURES, RETENTION, type Feature, type RetentionKey } from "@/lib/domain/settings";
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

export async function setFeaturesAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const flags = Object.fromEntries((Object.keys(FEATURES) as Feature[]).map((k) => [k, form.get(`f_${k}`) === "1"]));
    await setFeatures(getDb(), await getSession(), { flags, reason: formText(form, "reason") });
    revalidatePath("/", "layout");
    return { status: "success", message: "Saved. Candidates see the change on their next page." };
  } catch (err) {
    return toActionState(err);
  }
}

export async function setRetentionAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const days = Object.fromEntries((Object.keys(RETENTION) as RetentionKey[]).map((k) => [k, formInt(form, `r_${k}`, RETENTION[k].label)]));
    await setRetention(getDb(), await getSession(), { days, reason: formText(form, "reason") });
    revalidatePath("/admin/settings");
    return { status: "success", message: "Saved. The next daily run uses these periods." };
  } catch (err) {
    return toActionState(err);
  }
}

export async function applyRetentionAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const r = await applyRetention(getDb(), await getSession(), { reason: formText(form, "reason") });
    const total = Object.values(r).reduce((a, b) => a + b, 0);
    revalidatePath("/admin/settings");
    return { status: "success", message: total ? `Removed ${total.toLocaleString("en-US")} item${total === 1 ? "" : "s"}.` : "Nothing was past its retention period." };
  } catch (err) {
    return toActionState(err);
  }
}
