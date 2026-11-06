"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { formInt, formText, toActionState, type ActionState } from "@/lib/action-state";
import { getSession } from "@/lib/auth/session";
import { executeRun, importSimulationDataset, queueFirstRoundRun } from "@/lib/data/simulation";
import { getDb } from "@/lib/db/client";

/** Reachable by direct POST: the data layer checks the caller's capability. */

export async function importDatasetAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const s = await importSimulationDataset(getDb(), await getSession(), { induction: formInt(form, "induction", "Induction"), reason: formText(form, "reason") });
    revalidatePath("/admin/processing");
    return {
      status: "success",
      message: `Imported ${s.candidates.toLocaleString("en-US")} candidates and ${s.preferences.toLocaleString("en-US")} preferences (${s.eligible.toLocaleString("en-US")} with an accepted profile). Personal fields were not stored.`,
    };
  } catch (err) {
    return toActionState(err);
  }
}

export async function startRunAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let id: string;
  try {
    const db = getDb();
    id = await queueFirstRoundRun(db, await getSession(), { induction: formInt(form, "induction", "Induction") });
    // Runs after the response is sent; the run page shows its progress.
    after(() => executeRun(db, id));
  } catch (err) {
    return toActionState(err);
  }
  revalidatePath("/admin/processing");
  redirect(`/admin/processing/runs/${id}`);
}
