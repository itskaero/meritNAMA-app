"use server";

import { revalidatePath } from "next/cache";
import { readJsonUpload, toActionState, type ActionState } from "@/lib/action-state";
import { getSession } from "@/lib/auth/session";
import {
  addSeatLine,
  importSeatFile,
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

const str = (form: FormData, k: string) => String(form.get(k) ?? "");
const int = (form: FormData, k: string) => {
  const v = str(form, k).trim();
  if (!/^-?\d+$/.test(v)) throw new UserFacingError(`${k} must be a whole number`);
  return Number(v);
};
const optionalInt = (form: FormData, k: string) => (str(form, k).trim() ? int(form, k) : undefined);
const seatKey = (form: FormData): SeatKey => ({
  programId: int(form, "programId"),
  quotaId: int(form, "quotaId"),
  specialityId: int(form, "specialityId"),
  instituteId: int(form, "instituteId"),
  hospitalId: int(form, "hospitalId"),
});

export async function importSeatFileAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const induction = int(form, "induction");
    const r = await importSeatFile(getDb(), await getSession(), {
      induction,
      calendarYear: optionalInt(form, "calendarYear"),
      file: await readJsonUpload(form, "file", MAX_FILE_BYTES),
      reason: str(form, "reason"),
    });
    revalidatePath(BASE, "layout");
    const renamed = Object.values(r.renames).flat().length;
    return {
      status: "success",
      message:
        `Induction ${induction}: ${r.lines} seat lines, ${r.seats} seats imported` +
        (r.createdInduction ? " (induction created)" : "") +
        (r.addedLookups ? `; ${r.addedLookups} new lookup entries` : "") +
        (renamed ? `; ${renamed} names updated from the file` : "") +
        ".",
    };
  } catch (err) {
    return toActionState(err);
  }
}

export async function updateSeatAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const r = await updateSeatCount(getDb(), await getSession(), {
      induction: int(form, "induction"),
      key: seatKey(form),
      seats: int(form, "seats"),
      reason: str(form, "reason"),
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
      induction: int(form, "induction"),
      key: seatKey(form),
      seats: int(form, "seats"),
      reason: str(form, "reason"),
    });
    revalidatePath(BASE, "layout");
    return { status: "success", message: "Seat line added at the end of the matrix." };
  } catch (err) {
    return toActionState(err);
  }
}

export async function removeSeatAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    await removeSeatLine(getDb(), await getSession(), { induction: int(form, "induction"), key: seatKey(form), reason: str(form, "reason") });
    revalidatePath(BASE, "layout");
    return { status: "success", message: "Removed" };
  } catch (err) {
    return toActionState(err);
  }
}

export async function saveLookupAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const kind = str(form, "kind") as LookupKind;
    if (!LOOKUP_KINDS.includes(kind)) throw new UserFacingError("Unknown lookup");
    const r = await saveLookup(getDb(), await getSession(), { kind, id: int(form, "id"), name: str(form, "name"), reason: str(form, "reason") });
    revalidatePath(BASE, "layout");
    return { status: "success", message: r.created ? "Added" : "Saved" };
  } catch (err) {
    return toActionState(err);
  }
}

/** Import (file upload) or edit (JSON text) of a reference document: both store a new version. */
export async function saveDocumentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const kind = documentKindSchema.parse(str(form, "kind"));
    const data = form.get("file") instanceof File ? await readJsonUpload(form, "file", MAX_FILE_BYTES) : JSON.parse(str(form, "data"));
    const r = await saveReferenceDocument(getDb(), await getSession(), {
      kind,
      induction: optionalInt(form, "induction") ?? null,
      data,
      reason: str(form, "reason"),
    });
    revalidatePath(BASE, "layout");
    return { status: "success", message: `Saved as version ${r.version}: ${r.summary}.` };
  } catch (err) {
    return toActionState(err);
  }
}
