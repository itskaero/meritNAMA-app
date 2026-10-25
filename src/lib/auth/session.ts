import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { env } from "@/lib/env";
import { hasRole, type Role, type Session } from "./roles";

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
    return { userId: "dev-stub", email: "dev@localhost", role: stubRole, isStub: true };
  }
  // TODO(auth): read and verify the provider's session cookie here.
  return null;
}

/** Use in server layouts/pages. Redirects instead of rendering protected content. */
export async function requireRole(required: Role): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  if (!hasRole(session, required)) redirect("/forbidden");
  return session;
}
