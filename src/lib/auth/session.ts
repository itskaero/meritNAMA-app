import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { getDb } from "@/lib/db/client";
import { env } from "@/lib/env";
import { SESSION_COOKIE, sessionFromId } from "./login";
import { adminSections } from "@/lib/navigation";
import { can, normalizeRole, type Capability, type Session } from "./roles";

/**
 * Resolve the current user's session on the server, from the mn_session cookie
 * (see ./login.ts). Outside production, DEV_AUTH_STUB_ROLE pretends a user with
 * that role is signed in. Cached per request.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  // Always resolve per request: a session must never be baked into a prerendered page.
  await connection();
  const stubRole = env().DEV_AUTH_STUB_ROLE;
  if (stubRole && env().NODE_ENV !== "production") {
    return { userId: "dev-stub", email: "dev@localhost", role: normalizeRole(stubRole) ?? "candidate", isStub: true };
  }
  if (!env().DATABASE_URL) return null;
  const id = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!id) return null;
  try {
    return await sessionFromId(getDb(), id);
  } catch (e) {
    // A database outage reads as signed out rather than crashing every page.
    console.error("session lookup failed", (e as Error).message);
    return null;
  }
});

/** Use in server layouts/pages. Redirects instead of rendering protected content. */
export async function requireCan(capability: Capability | "portal"): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  if (!can(session, capability)) redirect("/forbidden");
  return session;
}

/**
 * For admin pages: require the capability of the section the page belongs to
 * (the longest matching section href), so a page cannot be opened by typing its
 * address when its menu entry is hidden.
 */
export async function requireSection(pathname: string): Promise<Session> {
  const section = adminSections
    .filter((x) => pathname === x.href || pathname.startsWith(`${x.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return requireCan(section?.capability ?? "staff");
}
