"use server";

import { cookies } from "next/headers";
import { WHATS_NEW_COOKIE } from "@/lib/ui-mode";

/** Hide "What's new" items up to now; newer ones show again. */
export async function dismissWhatsNewAction() {
  (await cookies()).set(WHATS_NEW_COOKIE, String(Date.now()), { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });
}
