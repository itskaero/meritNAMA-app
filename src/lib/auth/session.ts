import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { env } from "@/lib/env";
import { adminSections } from "@/lib/navigation";
import { can, normalizeRole, type Capability, type Session } from "./roles";

/**
 * Resolve the current user's session on the server.
 *
 * NOT YET INTEGRATED: no authentication provider is wired up, so outside the
 * development stub this always returns null and every guarded route redirects
 * to /sign-in. See docs/ARCHITECTURE.md → "Authentication" for the plan.
 */
export async function getSession(): Promise<Session | null> {
  // Always resolve per request: a session must never be baked into a prerendered page.
  await connection();
  const stubRole = env().DEV_AUTH_STUB_ROLE;
  if (stubRole && env().NODE_ENV !== "production") {
    return { userId: "dev-stub", email: "dev@localhost", role: normalizeRole(stubRole) ?? "candidate", isStub: true };
  }
  // TODO(auth): read and verify the provider's session cookie here.
  return null;
}

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
