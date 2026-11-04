"use server";

import { revalidatePath } from "next/cache";
import { formText, toActionState, type ActionState } from "@/lib/action-state";
import { getSession } from "@/lib/auth/session";
import { discardChange, publishChange, rollbackChange } from "@/lib/data/changes";
import { getDb } from "@/lib/db/client";
import { isUuid } from "@/lib/format";
import { UserFacingError } from "@/lib/errors";

const DECISIONS = { publish: publishChange, discard: discardChange, rollback: rollbackChange } as const;
const DONE = { publish: "Published.", discard: "Discarded.", rollback: "Rolled back to the previous data." } as const;

/** Publish, discard or roll back a staged change. The data layer checks the capability. */
export async function decideChangeAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const id = formText(form, "id");
    const decision = formText(form, "decision") as keyof typeof DECISIONS;
    if (!isUuid(id) || !(decision in DECISIONS)) throw new UserFacingError("Unknown change.");
    await DECISIONS[decision](getDb(), await getSession(), { id, reason: formText(form, "reason") });
    revalidatePath("/admin", "layout");
    revalidatePath("/portal", "layout");
    return { status: "success", message: DONE[decision] };
  } catch (err) {
    return toActionState(err);
  }
}
