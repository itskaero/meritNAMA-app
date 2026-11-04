"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { toActionState, type ActionState } from "@/lib/action-state";
import { getSession } from "@/lib/auth/session";
import { createThread, reportContent, replyToThread, setDisplayName, toggleHelpful } from "@/lib/data/community";
import { getDb } from "@/lib/db/client";
import { isUuid } from "@/lib/format";
import { UserFacingError } from "@/lib/errors";

/** Community Server Actions. The data layer checks the session and validates content. */

const str = (f: FormData, k: string) => String(f.get(k) ?? "");
const kindOf = (f: FormData) => (str(f, "kind") === "thread" ? "thread" : "post") as "thread" | "post";
const idOf = (f: FormData, k = "id") => {
  const v = str(f, k);
  if (!isUuid(v)) throw new UserFacingError("That post no longer exists.");
  return v;
};

export async function createThreadAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let id: string;
  try {
    const [kind, key = ""] = str(form, "topic").split("|");
    const t = await createThread(getDb(), await getSession(), {
      topic: { kind: kind as never, key },
      title: str(form, "title"),
      body: str(form, "body"),
    });
    id = t.id;
  } catch (err) {
    return toActionState(err);
  }
  revalidatePath("/portal", "layout");
  redirect(`/portal/community/${id}`);
}

export async function replyAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const threadId = idOf(form, "threadId");
    await replyToThread(getDb(), await getSession(), { threadId, body: str(form, "body") });
    revalidatePath(`/portal/community/${threadId}`);
    revalidatePath("/portal/community");
    return { status: "success", message: "Reply posted." };
  } catch (err) {
    return toActionState(err);
  }
}

export async function helpfulAction(form: FormData) {
  try {
    await toggleHelpful(getDb(), await getSession(), { kind: kindOf(form), id: idOf(form) });
  } catch {
    // Voting for your own post or a removed one is a no-op in the UI.
  }
  revalidatePath(`/portal/community/${str(form, "threadId")}`);
}

export async function reportAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    await reportContent(getDb(), await getSession(), { kind: kindOf(form), id: idOf(form), reason: str(form, "reason") });
    return { status: "success", message: "Thanks. A moderator will review it." };
  } catch (err) {
    return toActionState(err);
  }
}

export async function displayNameAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const name = await setDisplayName(getDb(), await getSession(), str(form, "displayName"));
    revalidatePath("/portal/community", "layout");
    return { status: "success", message: `You now post as ${name}.` };
  } catch (err) {
    return toActionState(err);
  }
}
