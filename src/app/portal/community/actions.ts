"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formText, toActionState, type ActionState } from "@/lib/action-state";
import { getSession } from "@/lib/auth/session";
import { acceptAnswer, createThread, reportContent, replyToThread, setDisplayName, toggleHelpful, votePoll, type ContentKind } from "@/lib/data/community";
import { pollInputSchema } from "@/lib/domain/community";
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

/** The optional poll from the composer: question, option_0…5, closes (days). */
const pollOf = (f: FormData) => {
  if (formText(f, "poll") !== "1") return null;
  const options = [0, 1, 2, 3, 4, 5].map((i) => formText(f, `option_${i}`)).filter(Boolean);
  const days = Number(formText(f, "closesInDays"));
  return pollInputSchema.parse({ question: formText(f, "pollQuestion"), options, closesInDays: days > 0 ? days : undefined });
};

const kindOf = (f: FormData): ContentKind => (["thread", "post", "review"].includes(formText(f, "kind")) ? formText(f, "kind") : "post") as ContentKind;
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
      poll: pollOf(form),
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
  const back = formText(form, "path");
  revalidatePath(/^\/portal\//.test(back) ? back : `/portal/community/${formText(form, "threadId")}`);
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

export async function voteAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const threadId = idOf(form, "threadId");
    const optionId = Number(formText(form, "optionId"));
    if (!Number.isSafeInteger(optionId)) throw new UserFacingError("Pick one of the poll's options.");
    await votePoll(getDb(), await getSession(), { threadId, optionId });
    revalidatePath(`/portal/community/${threadId}`);
    return { status: "success", message: "Vote saved." };
  } catch (err) {
    return toActionState(err);
  }
}
