"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { formText, toActionState, type ActionState } from "@/lib/action-state";
import { consumeLoginLink, endSession, requestLoginLink, SESSION_COOKIE, sessionFromId } from "@/lib/auth/login";
import { accessStatus, submitAccessRequest } from "@/lib/data/access";
import { AUTO_LABELS } from "@/lib/domain/payments";
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

/** Ask for access while the paywall is on. The data layer checks the settings, limits, the payment or the voucher. */
export async function requestAccessAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const amount = formText(form, "amount").replace(/,/g, "").trim();
    const r = await submitAccessRequest(getDb(), {
      email: formText(form, "email"),
      applicantId: formText(form, "applicantId"),
      channel: formText(form, "channel"),
      amountPkr: amount === "" ? null : Number(amount),
      reference: formText(form, "reference"),
      voucher: formText(form, "voucher"),
      message: formText(form, "message"),
    });
    if (r.status === "approved") {
      const until = r.expiresAt ? ` until ${r.expiresAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "Asia/Karachi" })}` : "";
      return { status: "success", message: `You are in${until}. Sign in with an email link below; we also sent you an email.` };
    }
    const why = r.autoResult && r.autoResult !== "tid_unseen" ? ` (${AUTO_LABELS[r.autoResult].label.toLowerCase()})` : "";
    return { status: "success", message: `Request received. A person will check the payment${why}, usually the same day, and email you. You can check its status any time with your email and transaction ID.` };
  } catch (err) {
    return toActionState(err);
  }
}

/** Where my request stands: needs the email and the transaction ID (or voucher) together. */
export async function accessStatusAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const r = await accessStatus(getDb(), { email: formText(form, "email"), reference: formText(form, "reference") });
    if (!r) return { status: "error", message: "No request matches that email and transaction ID. Check both, or send a request." };
    const until = r.expiresAt ? r.expiresAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Karachi" }) : null;
    const text = {
      approved: `Approved${until ? `, until ${until}` : ""}. Sign in with an email link.`,
      pending: `Waiting for a person to check the payment.${r.autoResult ? ` Automatic check: ${AUTO_LABELS[r.autoResult].note}` : ""}`,
      rejected: `Not approved: ${r.note ?? "no reason given"}. You can send the request again, corrected.`,
      expired: `Your access ended${until ? ` on ${until}` : ""}. Send a new request to renew it for this induction.`,
    }[r.status];
    return { status: r.status === "approved" ? "success" : "error", message: text };
  } catch (err) {
    return toActionState(err);
  }
}
