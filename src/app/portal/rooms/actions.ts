"use server";

import { revalidatePath } from "next/cache";
import { toActionState } from "@/lib/action-state";
import { getSession } from "@/lib/auth/session";
import { reportContent } from "@/lib/data/community";
import { listRoom, postToRoom, type RoomMessage } from "@/lib/data/rooms";
import { setSocialPrefs } from "@/lib/data/social";
import { getDb } from "@/lib/db/client";
import { isUuid } from "@/lib/format";

/** Round-room Server Actions. The data layer checks the session, the feature switch and limits. */

type Key = { induction: number; roundNo: number };
const keyOf = (k: Key) => ({ induction: Number(k.induction), roundNo: Number(k.roundNo) });

/** New messages since `after` (the client polls this while the tab is visible). */
export async function roomUpdatesAction(key: Key, after: number): Promise<{ messages: RoomMessage[] } | null> {
  try {
    const room = await listRoom(getDb(), await getSession(), keyOf(key), { after: Number.isFinite(after) ? after : 0 });
    return room ? { messages: room.messages } : null;
  } catch {
    return null;
  }
}

export async function postRoomAction(key: Key, body: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await postToRoom(getDb(), await getSession(), { ...keyOf(key), body: String(body ?? "") });
    return { ok: true };
  } catch (err) {
    const s = toActionState(err);
    return { ok: false, message: s.issues?.length ? s.issues.map((i) => i.replace(/^\(root\): /, "")).join(" ") : s.message ?? "Sending failed." };
  }
}

const REASONS = ["Spam or advertising", "Rude or abusive", "Shares someone's personal details", "Misleading figures"] as const;

export async function reportRoomMessageAction(id: string, reason: string): Promise<{ ok: boolean; message: string }> {
  if (!isUuid(id)) return { ok: false, message: "That message no longer exists." };
  if (!(REASONS as readonly string[]).includes(reason)) return { ok: false, message: "Pick a reason." };
  try {
    await reportContent(getDb(), await getSession(), { kind: "message", id, reason });
    return { ok: true, message: "Reported. A moderator will look at it." };
  } catch (err) {
    return { ok: false, message: toActionState(err).message ?? "Reporting failed." };
  }
}

export async function socialPrefsAction(input: { showBand?: boolean; peerCounted?: boolean }) {
  await setSocialPrefs(getDb(), await getSession(), {
    showBand: typeof input.showBand === "boolean" ? input.showBand : undefined,
    peerCounted: typeof input.peerCounted === "boolean" ? input.peerCounted : undefined,
  });
  revalidatePath("/portal", "layout");
}
