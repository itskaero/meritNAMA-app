"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formInt, formText, proposalState, toActionState, type ActionState } from "@/lib/action-state";
import { getSession } from "@/lib/auth/session";
import { createRulesDraft, getRulesVersion } from "@/lib/data/allocation-rules";
import { UserFacingError } from "@/lib/errors";
import { proposeRulesActivation } from "@/lib/data/changes";
import { getDb } from "@/lib/db/client";

/**
 * Server Actions for allocation rules. Reachable by direct POST, so authorization is
 * enforced by the data layer, not by the page.
 */

export async function saveRulesDraftAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let id: string;
  try {
    const row = await createRulesDraft(getDb(), await getSession(), {
      induction: formInt(form, "induction", "Induction"),
      definition: JSON.parse(formText(form, "definition")),
      reason: formText(form, "reason"),
    });
    id = row.id;
  } catch (err) {
    return toActionState(err);
  }
  revalidatePath("/admin/rules");
  redirect(`/admin/rules/${id}?saved=1`);
}

export async function activateRulesAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const p = await proposeRulesActivation(getDb(), await getSession(), { id: formText(form, "id"), reason: formText(form, "reason") });
    revalidatePath("/admin/changes");
    return proposalState(p);
  } catch (err) {
    return toActionState(err);
  }
}

/** Save a version's rules again, with a base-marks formula (or none), as a new draft. */
export async function saveFormulaDraftAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let id: string;
  try {
    const db = getDb();
    const session = await getSession();
    const base = await getRulesVersion(db, session, formText(form, "id"));
    if (!base) throw new UserFacingError("That rules version no longer exists.");
    const formula = formText(form, "formula").trim();
    const definition = { ...(base.definition as object), baseMarks: { formula: formula || null, onMissing: formText(form, "onMissing") === "zero" ? "zero" : "imported" } };
    const row = await createRulesDraft(db, session, { induction: base.inductionId, definition, reason: formText(form, "reason") });
    id = row.id;
  } catch (err) {
    return toActionState(err);
  }
  revalidatePath("/admin/rules");
  redirect(`/admin/rules/${id}?saved=1`);
}
