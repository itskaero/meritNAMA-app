import { AuthorizationError, ROLES, type Session } from "@/lib/auth/roles";

/**
 * The authorization matrix: for every exported data function that takes a session,
 * which callers it lets through. Each function is called with a database (and input)
 * that throws on first use, so "allowed" means the call got past its permission check,
 * and nothing is read or written either way.
 */

export const CALLERS = ["signed-out", ...ROLES] as const;
export type Caller = (typeof CALLERS)[number];
export type Outcome = "allowed" | "denied";

class Touched extends Error {}
const trap = (): unknown =>
  new Proxy(function () {}, {
    get: (_t, p) => {
      if (p === "then") return undefined; // not a promise
      throw new Touched(String(p));
    },
    apply: () => {
      throw new Touched("call");
    },
  });

export const sessionFor = (c: Caller): Session | null =>
  c === "signed-out" ? null : { userId: `authz-${c}`, email: `authz-${c}@test.local`, role: c, isStub: false };

/** Does the function's own parameter list name a session (the data layer's convention)? */
export function takesSession(fn: (...a: unknown[]) => unknown): boolean {
  const params = /^[^(]*\(([^)]*)\)/.exec(fn.toString())?.[1] ?? "";
  return /\b(session|sessionIn)\b/.test(params);
}

export async function outcome(fn: (...a: unknown[]) => unknown, caller: Caller): Promise<Outcome> {
  const params = (/^[^(]*\(([^)]*)\)/.exec(fn.toString())?.[1] ?? "").split(",").map((p) => p.trim().split(/[\s:=]/)[0]);
  const args = params.map((p) => (p === "session" || p === "sessionIn" ? sessionFor(caller) : trap()));
  try {
    await fn(...args);
    return "allowed";
  } catch (e) {
    if (e instanceof AuthorizationError) return "denied";
    return "allowed"; // got past the check and touched the database or its input
  }
}
