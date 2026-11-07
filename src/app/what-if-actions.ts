"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { formInt, formText, toActionState, type ActionState } from "@/lib/action-state";
import { getSession } from "@/lib/auth/session";
import { executeRun } from "@/lib/data/simulation";
import { parseBase, queueWhatIfRun, resetSimulatedConsent, setSimulatedConsent } from "@/lib/data/what-if";
import { getDb } from "@/lib/db/client";
import { isConsentStatus } from "@/lib/domain/what-if";
import { UserFacingError } from "@/lib/errors";

/**
 * What-if (simulated consent) actions, for the candidate portal and the admin workspace.
 * Reachable by direct POST: the data layer checks who may change what.
 */

/** Only paths inside the app, so a form cannot redirect elsewhere. */
const back = (form: FormData) => {
  const p = formText(form, "back");
  return /^\/(portal|admin)\/[\w/?=&:%.-]*$/.test(p) ? p : "/portal/simulation";
};
const baseOf = (form: FormData) => {
  const b = parseBase(formText(form, "base"));
  if (!b) throw new UserFacingError("Unknown list.");
  return b;
};

export async function setConsentAction(form: FormData) {
  const status = formText(form, "status");
  await setSimulatedConsent(getDb(), await getSession(), {
    induction: formInt(form, "induction", "Induction"),
    base: baseOf(form),
    applicantId: formText(form, "applicantId"),
    seatKey: formText(form, "seatKey"),
    status: status === "" ? null : isConsentStatus(status) ? status : null,
  });
  revalidatePath(back(form).split("?")[0]!);
}

export async function resetConsentAction(form: FormData) {
  await resetSimulatedConsent(getDb(), await getSession(), { induction: formInt(form, "induction", "Induction"), base: baseOf(form) });
  revalidatePath(back(form).split("?")[0]!);
}

export async function runWhatIfAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let target: string;
  try {
    const db = getDb();
    const id = await queueWhatIfRun(db, await getSession(), { induction: formInt(form, "induction", "Induction"), base: baseOf(form) });
    after(() => executeRun(db, id));
    const to = back(form);
    target = to.startsWith("/admin") ? `/admin/processing/runs/${id}` : `${to}${to.includes("?") ? "&" : "?"}run=${id}`;
  } catch (err) {
    return toActionState(err);
  }
  redirect(target);
}
