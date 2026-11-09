"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formText, toActionState, type ActionState } from "@/lib/action-state";
import { getSession } from "@/lib/auth/session";
import { addItem, createList, deleteList, duplicateList, removeItem, renameList, reorderList, setListMarks } from "@/lib/data/preferences";
import { getDb } from "@/lib/db/client";
import { UserFacingError } from "@/lib/errors";

const BASE = "/portal/preferences";

export async function createListAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let id: string;
  try {
    const [program, quota] = formText(form, "track").split("|");
    if (!program || !quota) throw new UserFacingError("Pick a programme and quota.");
    ({ id } = await createList(getDb(), await getSession(), { name: formText(form, "name"), program, quota, fromShortlist: formText(form, "fromShortlist") === "1" }));
  } catch (err) {
    return toActionState(err);
  }
  revalidatePath(BASE);
  redirect(`${BASE}/${id}`);
}

export async function renameListAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const id = formText(form, "id");
    await renameList(getDb(), await getSession(), { id, name: formText(form, "name") });
    revalidatePath(`${BASE}/${id}`);
    return { status: "success", message: "Renamed." };
  } catch (err) {
    return toActionState(err);
  }
}

export async function duplicateListAction(form: FormData) {
  const { id } = await duplicateList(getDb(), await getSession(), formText(form, "id"));
  revalidatePath(BASE);
  redirect(`${BASE}/${id}`);
}

export async function deleteListAction(form: FormData) {
  await deleteList(getDb(), await getSession(), formText(form, "id"));
  revalidatePath(BASE);
  redirect(BASE);
}

export async function setMarksAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const id = formText(form, "id");
    const m = formText(form, "marks"), t = formText(form, "total");
    await setListMarks(getDb(), await getSession(), { id, marks: m === "" ? null : Number(m), total: t === "" ? null : Number(t) });
    revalidatePath(`${BASE}/${id}`);
    return { status: "success", message: m === "" ? "Using your verified marks, if any." : "Marks saved." };
  } catch (err) {
    return toActionState(err);
  }
}

/** Called from the editor (not a form): add, remove, reorder. */
export async function addItemAction(id: string, speciality: string, hospital: string): Promise<ActionState> {
  try {
    await addItem(getDb(), await getSession(), { id: String(id), speciality: String(speciality), hospital: String(hospital) });
    revalidatePath(`${BASE}/${id}`);
    return { status: "success", message: "Added." };
  } catch (err) {
    return toActionState(err);
  }
}

export async function removeItemAction(id: string, speciality: string, hospital: string): Promise<ActionState> {
  try {
    await removeItem(getDb(), await getSession(), { id: String(id), speciality: String(speciality), hospital: String(hospital) });
    revalidatePath(`${BASE}/${id}`);
    return { status: "success", message: "Removed." };
  } catch (err) {
    return toActionState(err);
  }
}

export async function reorderAction(id: string, order: [string, string][]): Promise<ActionState> {
  try {
    if (!Array.isArray(order) || order.some((p) => !Array.isArray(p) || p.length !== 2 || p.some((x) => typeof x !== "string"))) {
      throw new UserFacingError("That order could not be read. Reload and try again.");
    }
    await reorderList(getDb(), await getSession(), { id: String(id), order });
    revalidatePath(`${BASE}/${id}`);
    return { status: "success", message: "Order saved." };
  } catch (err) {
    return toActionState(err);
  }
}
