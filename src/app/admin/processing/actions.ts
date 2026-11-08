"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { formInt, formText, toActionState, type ActionState } from "@/lib/action-state";
import { getSession } from "@/lib/auth/session";
import { executeRun, importConsentRounds, importSimulationDataset, publishEstimate, queueFirstRoundRun, queueNextRoundRun } from "@/lib/data/simulation";
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

export async function importConsentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const rounds = await importConsentRounds(getDb(), await getSession(), { induction: formInt(form, "induction", "Induction"), reason: formText(form, "reason") });
    revalidatePath("/admin/processing");
    return { status: "success", message: `Imported consent for round${rounds.length > 1 ? "s" : ""} ${rounds.map((r) => r.round).join(", ")} (${rounds.reduce((n, r) => n + r.replies, 0).toLocaleString("en-US")} replies).` };
  } catch (err) {
    return toActionState(err);
  }
}

export async function startRunAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let id: string;
  try {
    const db = getDb();
    const induction = formInt(form, "induction", "Induction");
    const from = formText(form, "fromRound").trim();
    id = from
      ? await queueNextRoundRun(db, await getSession(), {
          induction,
          fromRound: formInt(form, "fromRound", "Round"),
          awaitedConsent: (["vacate", "keep", "yield"] as const).find((v) => v === formText(form, "awaited")),
        })
      : await queueFirstRoundRun(db, await getSession(), { induction });
    // Runs after the response is sent; the run page shows its progress.
    after(() => executeRun(db, id));
  } catch (err) {
    return toActionState(err);
  }
  revalidatePath("/admin/processing");
  redirect(`/admin/processing/runs/${id}`);
}

/** Publish a finished run as an estimated merit list for members (or take it down). */
export async function publishEstimateAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const id = formText(form, "id");
    const publish = formText(form, "publish") === "1";
    await publishEstimate(getDb(), await getSession(), { id, publish, reason: formText(form, "reason") });
    revalidatePath(`/admin/processing/runs/${id}`);
    revalidatePath("/portal", "layout");
    return { status: "success", message: publish ? "Published. Members now see it under Merit lists as an estimate." : "Taken down. Members no longer see it." };
  } catch (err) {
    return toActionState(err);
  }
}
