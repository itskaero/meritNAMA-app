"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { markRead } from "@/lib/data/notifications";
import { getDb } from "@/lib/db/client";

export async function markAllReadAction() {
  await markRead(getDb(), await getSession(), "all");
  revalidatePath("/portal", "layout");
}
