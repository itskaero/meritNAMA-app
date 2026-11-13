"use server";

import { revalidatePath } from "next/cache";
import { formText, toActionState, type ActionState } from "@/lib/action-state";
import { getSession } from "@/lib/auth/session";
import { addManualJob, setJobFlags, syncJobsNow } from "@/lib/data/jobs";
import { getDb } from "@/lib/db/client";

/** Server Actions for Admin → Jobs. The data layer checks the role on every call. */

const refresh = () => { revalidatePath("/admin/jobs"); revalidatePath("/portal/jobs"); };

export async function syncJobsAction(): Promise<ActionState> {
  try {
    const r = await syncJobsNow(getDb(), await getSession());
    refresh();
    const failed = r.sources.filter((s) => s.error).map((s) => s.source);
    return { status: "success", message: `${r.added} new, ${r.updated} updated, ${r.removed} old adverts removed.${failed.length ? ` Could not reach: ${failed.join(", ")}.` : ""}` };
  } catch (e) {
    return toActionState(e);
  }
}

export async function flagJobAction(form: FormData) {
  const flag = formText(form, "flag");
  const on = formText(form, "on") === "1";
  try {
    await setJobFlags(getDb(), await getSession(), formText(form, "id"), flag === "hidden" ? { hidden: on } : { pinned: on });
  } catch {
    // Removed meanwhile.
  }
  refresh();
}

export async function addJobAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    await addManualJob(getDb(), await getSession(), {
      title: formText(form, "title"),
      employer: formText(form, "employer"),
      city: formText(form, "city"),
      lastDate: formText(form, "lastDate"),
      link: formText(form, "link"),
      official: formText(form, "official") === "1",
    });
    refresh();
    return { status: "success", message: "Added. It shows on the Jobs page now." };
  } catch (e) {
    return toActionState(e);
  }
}
