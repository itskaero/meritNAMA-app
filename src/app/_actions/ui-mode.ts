"use server";

import { cookies } from "next/headers";
import { THEME_COOKIE, UI_MODE_COOKIE, parseTheme, parseUiMode } from "@/lib/ui-mode";

/** Remember the viewer's interface mode. Not sensitive: a display preference only. */
export async function setUiModeAction(mode: string) {
  (await cookies()).set(UI_MODE_COOKIE, parseUiMode(mode), {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
}

/** Remember the viewer's colour theme. A display preference only. */
export async function setThemeAction(theme: string) {
  (await cookies()).set(THEME_COOKIE, parseTheme(theme), {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
}
