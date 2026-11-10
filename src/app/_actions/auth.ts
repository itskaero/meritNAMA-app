"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { formText, toActionState, type ActionState } from "@/lib/action-state";
import { consumeLoginLink, endSession, requestLoginLink, SESSION_COOKIE, sessionFromId } from "@/lib/auth/login";
import { submitAccessRequest } from "@/lib/data/access";
import { getDb } from "@/lib/db/client";
import { setSessionCookie } from "@/lib/auth/session-cookie";

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
    await setSessionCookie(s.sessionId, s.expiresAt);
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

/** Ask for access while the paywall is on. The data layer checks the settings, limits and the amount. */
export async function requestAccessAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const amount = formText(form, "amount").replace(/,/g, "").trim();
    await submitAccessRequest(getDb(), {
      email: formText(form, "email"),
      applicantId: formText(form, "applicantId"),
      amountPkr: amount === "" ? null : Number(amount),
      reference: formText(form, "reference"),
      message: formText(form, "message"),
    });
  } catch (err) {
    return toActionState(err);
  }
  return { status: "success", message: "Request received. Once your payment is checked we will email you, and then you can sign in with an email link." };
}
