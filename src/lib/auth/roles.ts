export const ROLES = ["candidate", "admin"] as const;
export type Role = (typeof ROLES)[number];

export type Session = {
  userId: string;
  email: string;
  role: Role;
  /** True only for the development stub — never for a real sign-in. */
  isStub: boolean;
};

/** Admins can see candidate-facing pages too; candidates cannot see admin pages. */
export function hasRole(session: Session | null, required: Role): session is Session {
  if (!session) return false;
  if (required === "candidate") return session.role === "candidate" || session.role === "admin";
  return session.role === "admin";
}

export class AuthorizationError extends Error {
  constructor(public readonly reason: "unauthenticated" | "forbidden") {
    super(reason);
    this.name = "AuthorizationError";
  }
}

/** For data-access functions: throw rather than redirect. */
export function assertRole(session: Session | null, required: Role): asserts session is Session {
  if (!session) throw new AuthorizationError("unauthenticated");
  if (!hasRole(session, required)) throw new AuthorizationError("forbidden");
}
