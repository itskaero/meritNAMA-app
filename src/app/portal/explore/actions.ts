"use server";

import { revalidatePath } from "next/cache";
import { formInt, formText, toActionState, type ActionState } from "@/lib/action-state";
import { getSession } from "@/lib/auth/session";
import { saveReview } from "@/lib/data/reviews";
import { getDb } from "@/lib/db/client";

export async function saveReviewAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const hospitalId = formInt(form, "hospitalId");
    const spec = formText(form, "specialityId");
    const r = await saveReview(getDb(), await getSession(), {
      hospitalId,
      specialityId: spec ? Number(spec) : null,
      induction: formInt(form, "induction", "Induction"),
      training: Number(formText(form, "training")),
      workload: Number(formText(form, "workload")),
      hostel: Number(formText(form, "hostel")),
      stipend: Number(formText(form, "stipend")),
      body: formText(form, "body"),
    });
    revalidatePath(`/portal/explore/hospitals/${hospitalId}`);
    revalidatePath("/portal/explore/specialities", "layout");
    return { status: "success", message: r.created ? "Thanks. Your review is up." : "Your review is updated." };
  } catch (err) {
    return toActionState(err);
  }
}
