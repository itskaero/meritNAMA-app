"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { toActionState } from "@/lib/action-state";
import { getSession } from "@/lib/auth/session";
import {
  blockUser,
  createGroup,
  joinGroup,
  leaveChat,
  listMessages,
  markRead,
  postMessage,
  reportChatMessage,
  setDmOpen,
  setMuted,
  startDirectChat,
  toggleReaction,
  unblockUser,
  type ChatMessage,
} from "@/lib/data/chats";
import { getDb } from "@/lib/db/client";
import { isUuid } from "@/lib/format";

/** Chat Server Actions. The data layer checks the session, the feature switch, membership, blocks and limits. */

type Result = { ok: true } | { ok: false; message: string };

async function run(fn: () => Promise<unknown>): Promise<Result> {
  try {
    await fn();
    return { ok: true };
  } catch (err) {
    const s = toActionState(err);
    return { ok: false, message: s.issues?.length ? s.issues.map((i) => i.replace(/^\(root\): /, "")).join(" ") : s.message ?? "That did not work. Try again." };
  }
}

const gone: Result = { ok: false, message: "That chat is no longer here." };

/** Messages after `after` (the fallback when the live stream is unavailable). */
export async function chatUpdatesAction(roomId: string, after: number): Promise<ChatMessage[]> {
  if (!isUuid(roomId)) return [];
  try {
    return await listMessages(getDb(), await getSession(), roomId, { after: Number.isFinite(after) ? after : 0 });
  } catch {
    return [];
  }
}

export async function sendChatAction(roomId: string, body: string): Promise<Result> {
  if (!isUuid(roomId)) return gone;
  return run(async () => postMessage(getDb(), await getSession(), { roomId, body: String(body ?? "") }));
}

export async function reactAction(messageId: string, emoji: string): Promise<Result> {
  if (!isUuid(messageId)) return gone;
  return run(async () => toggleReaction(getDb(), await getSession(), { messageId, emoji: String(emoji) }));
}

export async function reportChatAction(messageId: string, reason: string): Promise<Result> {
  if (!isUuid(messageId)) return gone;
  return run(async () => reportChatMessage(getDb(), await getSession(), { messageId, reason: String(reason) }));
}

export async function readAction(roomId: string, seq: number): Promise<void> {
  if (!isUuid(roomId)) return;
  await markRead(getDb(), await getSession(), { roomId, seq: Number(seq) }).catch(() => {});
}

export async function muteAction(roomId: string, muted: boolean): Promise<Result> {
  if (!isUuid(roomId)) return gone;
  const r = await run(async () => setMuted(getDb(), await getSession(), { roomId, muted: Boolean(muted) }));
  revalidatePath("/portal/chats");
  return r;
}

export async function blockAction(userId: string, block: boolean): Promise<Result> {
  if (!isUuid(userId)) return { ok: false, message: "That person could not be found." };
  const r = await run(async () => (block ? blockUser : unblockUser)(getDb(), await getSession(), { userId }));
  revalidatePath("/portal/chats", "layout");
  return r;
}

export async function dmOpenAction(open: boolean): Promise<Result> {
  const r = await run(async () => setDmOpen(getDb(), await getSession(), { open: Boolean(open) }));
  revalidatePath("/portal/chats", "layout");
  return r;
}

/** Start or reopen a one-to-one chat with a member, then go to it. */
export async function startDmAction(userId: string): Promise<Result> {
  if (!isUuid(userId)) return { ok: false, message: "That person could not be found." };
  let id: string | null = null;
  const r = await run(async () => { id = (await startDirectChat(getDb(), await getSession(), { userId })).id; });
  if (r.ok && id) redirect(`/portal/chats/${id}`);
  return r;
}

export async function createGroupAction(_prev: unknown, form: FormData): Promise<Result> {
  let id: string | null = null;
  const r = await run(async () => { id = (await createGroup(getDb(), await getSession(), { name: String(form.get("name") ?? "") })).id; });
  if (r.ok && id) redirect(`/portal/chats/${id}`);
  return r;
}

export async function joinAction(roomId: string): Promise<Result> {
  if (!isUuid(roomId)) return gone;
  const r = await run(async () => joinGroup(getDb(), await getSession(), { roomId }));
  if (r.ok) revalidatePath(`/portal/chats/${roomId}`);
  return r;
}

export async function leaveAction(roomId: string): Promise<Result> {
  if (!isUuid(roomId)) return gone;
  const r = await run(async () => leaveChat(getDb(), await getSession(), { roomId }));
  if (r.ok) redirect("/portal/chats");
  return r;
}
