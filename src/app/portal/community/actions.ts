"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formText, toActionState, type ActionState } from "@/lib/action-state";
import { getSession } from "@/lib/auth/session";
import { acceptAnswer, createThread, reportContent, replyToThread, setDisplayName, toggleHelpful } from "@/lib/data/community";
import { parseFollowTarget, setFollow } from "@/lib/data/notifications";
import { snippetChoices } from "@/lib/data/snippets";
import { parseSnippetParam } from "@/lib/domain/community";
import { getDb } from "@/lib/db/client";
import { isUuid } from "@/lib/format";
import { UserFacingError } from "@/lib/errors";

/** Community Server Actions. The data layer checks the session and validates content. */

/** The optional merit card from the composer's hidden field. */
const snippetOf = (f: FormData) => {
  const raw = formText(f, "snippet");
  if (!raw) return null;
  const s = parseSnippetParam(raw);
  if (!s) throw new UserFacingError("The merit card is not valid. Pick it again.");
  return s;
};

const kindOf = (f: FormData) => (formText(f, "kind") === "thread" ? "thread" : "post") as "thread" | "post";
const idOf = (f: FormData, k = "id") => {
  const v = formText(f, k);
  if (!isUuid(v)) throw new UserFacingError("That post no longer exists.");
  return v;
};

export async function createThreadAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let id: string;
  try {
    const [kind, key = ""] = formText(form, "topic").split("|");
    const t = await createThread(getDb(), await getSession(), {
      topic: { kind: kind as never, key },
      title: formText(form, "title"),
      body: formText(form, "body"),
      snippet: snippetOf(form),
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
    await replyToThread(getDb(), await getSession(), { threadId, body: formText(form, "body"), snippet: snippetOf(form) });
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
  revalidatePath(`/portal/community/${formText(form, "threadId")}`);
}

export async function reportAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    await reportContent(getDb(), await getSession(), { kind: kindOf(form), id: idOf(form), reason: formText(form, "reason") });
    return { status: "success", message: "Thanks. A moderator will review it." };
  } catch (err) {
    return toActionState(err);
  }
}

export async function displayNameAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const name = await setDisplayName(getDb(), await getSession(), formText(form, "displayName"));
    revalidatePath("/portal/community", "layout");
    return { status: "success", message: `You now post as ${name}.` };
  } catch (err) {
    return toActionState(err);
  }
}

export async function acceptAction(form: FormData) {
  const threadId = formText(form, "threadId");
  try {
    await acceptAnswer(getDb(), await getSession(), { threadId: idOf(form, "threadId"), postId: idOf(form, "postId") });
  } catch {
    // Not allowed or gone: the page re-renders with the current state.
  }
  revalidatePath(`/portal/community/${threadId}`);
  revalidatePath("/portal/community");
}

/** Follow or unfollow a topic or thread; the button re-renders from the server. */
export async function followAction(form: FormData) {
  try {
    await setFollow(getDb(), await getSession(), parseFollowTarget(formText(form, "kind"), formText(form, "key")), formText(form, "on") === "1");
  } catch {
    // Unknown target: nothing to change.
  }
  const back = formText(form, "path");
  if (/^\/portal(\/|$)/.test(back)) revalidatePath(back);
}

/** Lists for the "Attach a merit card" picker. */
export async function snippetChoicesAction(input: { induction?: number; round?: number; track?: string; speciality?: string }) {
  if (!(await getSession())) return null;
  return snippetChoices(getDb(), {
    induction: Number.isInteger(input.induction) ? input.induction : undefined,
    round: Number.isInteger(input.round) ? input.round : undefined,
    track: typeof input.track === "string" ? input.track.slice(0, 160) : undefined,
    speciality: typeof input.speciality === "string" ? input.speciality.slice(0, 160) : undefined,
  });
}
