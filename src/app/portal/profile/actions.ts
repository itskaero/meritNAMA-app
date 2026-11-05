"use server";

import { revalidatePath } from "next/cache";
import { formText, toActionState, type ActionState } from "@/lib/action-state";
import { getSession } from "@/lib/auth/session";
import { EVIDENCE_MAX_BYTES, requestLink } from "@/lib/data/candidates";
import { getDb } from "@/lib/db/client";
import { UserFacingError } from "@/lib/errors";

export async function requestLinkAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const doc = form.get("evidence");
    if (!(doc instanceof File) || doc.size === 0) throw new UserFacingError("Attach a document that shows your applicant ID (PDF, JPG or PNG).");
    if (doc.size > EVIDENCE_MAX_BYTES) throw new UserFacingError("The document is larger than 5 MB.");
    await requestLink(getDb(), await getSession(), {
      applicantId: formText(form, "applicantId"),
      pmdcNo: formText(form, "pmdcNo"),
      evidence: new Uint8Array(await doc.arrayBuffer()),
    });
  } catch (err) {
    return toActionState(err);
  }
  revalidatePath("/portal/profile");
  return { status: "success", message: "Sent. A verifier will review it; this page shows the decision." };
}
