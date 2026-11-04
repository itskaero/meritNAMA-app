"use server";

import { revalidatePath } from "next/cache";
import { formText } from "@/lib/action-state";
import { getSession } from "@/lib/auth/session";
import { toggleShortlist } from "@/lib/data/finder";
import { getDb } from "@/lib/db/client";

/** Star or unstar an option. Plain form post, so it works without JavaScript. */
export async function toggleShortlistAction(form: FormData) {
  try {
    await toggleShortlist(getDb(), await getSession(), {
      program: formText(form, "program"),
      quota: formText(form, "quota"),
      speciality: formText(form, "speciality"),
      hospital: formText(form, "hospital"),
    });
  } catch {
    // A full shortlist or a removed option leaves the star unchanged.
  }
  revalidatePath("/portal/finder");
  revalidatePath("/portal/workspace");
}
