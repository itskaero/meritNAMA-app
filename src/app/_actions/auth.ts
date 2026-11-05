"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { formText, toActionState, type ActionState } from "@/lib/action-state";
import { consumeLoginLink, endSession, requestLoginLink, SESSION_COOKIE, sessionFromId } from "@/lib/auth/login";
import { getDb } from "@/lib/db/client";
import { env } from "@/lib/env";

/** Sign-in Server Actions: ask for a link, use it, sign out. */

const clientIp = async () => {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
};

export async function requestLinkAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    await requestLoginLink(getDb(), { email: formText(form, "email"), ip: await clientIp() });
  } catch (err) {
    return toActionState(err);
  }
  // Same answer whether or not an account exists or a limit was reached.
  return { status: "success", message: "If that address can sign in, a link is on its way. It works once, for 15 minutes." };
}

export async function verifyLinkAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let staff = false;
  try {
    const h = await headers();
    const s = await consumeLoginLink(getDb(), { token: formText(form, "token"), userAgent: h.get("user-agent") });
    (await cookies()).set(SESSION_COOKIE, s.sessionId, {
      httpOnly: true,
      sameSite: "lax",
      secure: env().NODE_ENV === "production" || env().APP_URL.startsWith("https:"),
      path: "/",
      expires: s.expiresAt,
    });
    const session = await sessionFromId(getDb(), s.sessionId);
    staff = Boolean(session && session.role !== "candidate");
  } catch (err) {
    return toActionState(err);
  }
  redirect(staff ? "/admin" : "/portal");
}

export async function signOutAction() {
  const jar = await cookies();
  await endSession(getDb(), jar.get(SESSION_COOKIE)?.value).catch(() => {});
  jar.delete(SESSION_COOKIE);
  redirect("/sign-in?signedOut=1");
}
