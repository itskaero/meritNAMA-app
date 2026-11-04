"use server";

import { revalidatePath } from "next/cache";
import { formInt, formOptionalInt, formText, proposalState, readJsonUpload, toActionState, type ActionState } from "@/lib/action-state";
import { proposeSeatFile } from "@/lib/data/changes";
import { getSession } from "@/lib/auth/session";
import {
  addSeatLine,
  removeSeatLine,
  saveLookup,
  saveReferenceDocument,
  updateSeatCount,
  type SeatKey,
} from "@/lib/data/reference-data";
import { getDb } from "@/lib/db/client";
import { documentKindSchema, LOOKUP_KINDS, type LookupKind } from "@/lib/domain/reference-data";
import { UserFacingError } from "@/lib/errors";

/**
 * Server Actions for the reference-data manager. Reachable by direct POST, so the
 * data layer (assertRole + zod) is the guard; these only parse form fields.
 */

const MAX_FILE_BYTES = 3 * 1024 * 1024;
const BASE = "/admin/reference-data";

const seatKey = (form: FormData): SeatKey => ({
  programId: formInt(form, "programId"),
  quotaId: formInt(form, "quotaId"),
  specialityId: formInt(form, "specialityId"),
  instituteId: formInt(form, "instituteId"),
  hospitalId: formInt(form, "hospitalId"),
});

export async function importSeatFileAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const p = await proposeSeatFile(getDb(), await getSession(), {
      induction: formInt(form, "induction"),
      calendarYear: formOptionalInt(form, "calendarYear"),
      file: await readJsonUpload(form, "file", MAX_FILE_BYTES),
      reason: formText(form, "reason"),
    });
    revalidatePath(BASE, "layout");
    revalidatePath("/admin/changes");
    return proposalState(p);
  } catch (err) {
    return toActionState(err);
  }
}

export async function updateSeatAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const r = await updateSeatCount(getDb(), await getSession(), {
      induction: formInt(form, "induction"),
      key: seatKey(form),
      seats: formInt(form, "seats"),
      reason: formText(form, "reason"),
    });
    revalidatePath(BASE, "layout");
    return { status: "success", message: r.changed ? "Saved" : "No change" };
  } catch (err) {
    return toActionState(err);
  }
}

export async function addSeatAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    await addSeatLine(getDb(), await getSession(), {
      induction: formInt(form, "induction"),
      key: seatKey(form),
      seats: formInt(form, "seats"),
      reason: formText(form, "reason"),
    });
    revalidatePath(BASE, "layout");
    return { status: "success", message: "Seat line added at the end of the matrix." };
  } catch (err) {
    return toActionState(err);
  }
}

export async function removeSeatAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    await removeSeatLine(getDb(), await getSession(), { induction: formInt(form, "induction"), key: seatKey(form), reason: formText(form, "reason") });
    revalidatePath(BASE, "layout");
    return { status: "success", message: "Removed" };
  } catch (err) {
    return toActionState(err);
  }
}

export async function saveLookupAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const kind = formText(form, "kind") as LookupKind;
    if (!LOOKUP_KINDS.includes(kind)) throw new UserFacingError("Unknown lookup");
    const r = await saveLookup(getDb(), await getSession(), { kind, id: formInt(form, "id"), name: formText(form, "name"), reason: formText(form, "reason") });
    revalidatePath(BASE, "layout");
    return { status: "success", message: r.created ? "Added" : "Saved" };
  } catch (err) {
    return toActionState(err);
  }
}

/** Import (file upload) or edit (JSON text) of a reference document: both store a new version. */
export async function saveDocumentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const kind = documentKindSchema.parse(formText(form, "kind"));
    const data = form.get("file") instanceof File ? await readJsonUpload(form, "file", MAX_FILE_BYTES) : JSON.parse(formText(form, "data"));
    const r = await saveReferenceDocument(getDb(), await getSession(), {
      kind,
      induction: formOptionalInt(form, "induction") ?? null,
      data,
      reason: formText(form, "reason"),
    });
    revalidatePath(BASE, "layout");
    return { status: "success", message: `Saved as version ${r.version}: ${r.summary}.` };
  } catch (err) {
    return toActionState(err);
  }
}
