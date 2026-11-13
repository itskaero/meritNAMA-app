"use server";

import { revalidatePath } from "next/cache";
import { formText } from "@/lib/action-state";
import { getSession } from "@/lib/auth/session";
import { setJobSaved } from "@/lib/data/jobs";
import { getDb } from "@/lib/db/client";

/** Save or unsave a job (the star on a job card). A plain form post. */
export async function saveJobAction(form: FormData) {
  try {
    await setJobSaved(getDb(), await getSession(), formText(form, "id"), formText(form, "on") === "1");
  } catch {
    // The job was removed meanwhile: nothing to change.
  }
  revalidatePath("/portal/jobs");
}
