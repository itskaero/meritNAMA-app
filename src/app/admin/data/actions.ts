"use server";

import { revalidatePath } from "next/cache";
import { formInt, formText, proposalState, toActionState, type ActionState } from "@/lib/action-state";
import { getSession } from "@/lib/auth/session";
import { applyAllDataFiles, applyDataFile, removeDataFile, saveDataSettings, scanDataFolder } from "@/lib/data/datastore";
import { importSimulationDataset } from "@/lib/data/simulation";
import { syncDataFromRepo } from "@/lib/data/sync";
import { getDb } from "@/lib/db/client";
import { isUuid } from "@/lib/format";
import { UserFacingError } from "@/lib/errors";

/** Server Actions for the Data page. The data layer checks the role on every call. */

const refresh = () => {
  revalidatePath("/admin/data");
  revalidatePath("/admin/changes");
  revalidatePath("/admin/inductions");
  revalidatePath("/portal", "layout");
};

const fileId = (form: FormData) => {
  const id = formText(form, "id");
  if (!isUuid(id)) throw new UserFacingError("That file is not in the list.");
  return id;
};

/** Look at the folder again. Run after files were dropped, or copied in on the NAS. */
export async function scanAction(): Promise<ActionState> {
  try {
    const r = await scanDataFolder(getDb(), await getSession());
    refresh();
    return { status: "success", message: `${r.files} file${r.files === 1 ? "" : "s"} in the folder: ${r.added} new, ${r.changed} changed${r.missing ? `, ${r.missing} no longer there` : ""}.` };
  } catch (e) {
    return toActionState(e);
  }
}

/** The click on one row: publish a new file, or stage a replacement for review. */
export async function applyFileAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const p = await applyDataFile(getDb(), await getSession(), { id: fileId(form) });
    refresh();
    return proposalState(p);
  } catch (e) {
    refresh();
    return toActionState(e);
  }
}

/** Publish every new file, in a safe order. Replacements are left for their own click. */
export async function applyAllAction(): Promise<ActionState> {
  try {
    const r = await applyAllDataFiles(getDb(), await getSession());
    refresh();
    const issues = [...r.staged.map((p) => `${p}: replaces live data, staged for review`), ...r.failed.map((f) => `${f.path}: ${f.message}`)];
    const done = r.applied.length;
    return {
      status: r.failed.length ? "error" : "success",
      message: done || r.staged.length ? `${done} file${done === 1 ? "" : "s"} published${r.staged.length ? `, ${r.staged.length} staged for review` : ""}.` : r.failed.length ? "Nothing was published." : "Nothing new to publish.",
      issues,
      ...(r.staged.length ? { href: "/admin/changes", hrefLabel: "Review staged changes" } : {}),
    };
  } catch (e) {
    return toActionState(e);
  }
}

export async function removeFileAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    await removeDataFile(getDb(), await getSession(), { id: fileId(form), reason: formText(form, "reason") });
    refresh();
    return { status: "success", message: "Removed from the folder. Data it already brought stays live." };
  } catch (e) {
    return toActionState(e);
  }
}

export async function syncAction(): Promise<ActionState> {
  try {
    const r = await syncDataFromRepo(getDb(), await getSession());
    refresh();
    return { status: "success", message: `Synced ${r.repo}@${r.branch}: ${r.message}` };
  } catch (e) {
    refresh();
    return toActionState(e);
  }
}

export async function saveSettingsAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    await saveDataSettings(getDb(), await getSession(), {
      autoPublish: form.get("autoPublish") === "on",
      repo: formText(form, "repo"),
      branch: formText(form, "branch"),
      reason: formText(form, "reason"),
    });
    refresh();
    return { status: "success", message: "Saved." };
  } catch (e) {
    return toActionState(e);
  }
}

/** Build an induction's estimate dataset from the estimate inputs in the folder. */
export async function buildEstimateAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const induction = formInt(form, "induction", "Induction");
    const summary = await importSimulationDataset(getDb(), await getSession(), { induction, reason: formText(form, "reason") || `Data folder: estimate inputs for induction ${induction}` });
    refresh();
    revalidatePath("/admin/processing");
    return { status: "success", message: `Estimate dataset built for induction ${induction}: ${summary.candidates.toLocaleString("en-US")} candidates.`, href: "/admin/processing", hrefLabel: "Open Processing & simulation" };
  } catch (e) {
    return toActionState(e);
  }
}
