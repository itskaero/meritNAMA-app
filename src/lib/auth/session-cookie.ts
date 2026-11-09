import "server-only";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { SESSION_COOKIE } from "./login";

/** HttpOnly, SameSite=Lax; Secure in production or behind https. */
export const secureCookies = () => env().NODE_ENV === "production" || env().APP_URL.startsWith("https:");

export async function setSessionCookie(sessionId: string, expires: Date) {
  (await cookies()).set(SESSION_COOKIE, sessionId, { httpOnly: true, sameSite: "lax", secure: secureCookies(), path: "/", expires });
}
