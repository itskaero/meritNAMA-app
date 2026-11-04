/**
 * Roles and what they may do. Every check in the app asks for a capability, never a
 * role name, so roles can change without touching the data layer.
 *
 * "admin" is the legacy name for "owner" (stored rows and DEV_AUTH_STUB_ROLE=admin);
 * it is normalised to "owner" when read.
 */
export const ROLES = ["candidate", "data_editor", "policy_editor", "verifier", "moderator", "owner"] as const;
export type Role = (typeof ROLES)[number];
export const STAFF_ROLES = ROLES.filter((r) => r !== "candidate") as Exclude<Role, "candidate">[];

export const ROLE_LABELS: Record<Role, string> = {
  candidate: "Candidate",
  data_editor: "Data editor",
  policy_editor: "Policy editor",
  verifier: "Verifier",
  moderator: "Moderator",
  owner: "Owner",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  candidate: "Uses the candidate portal.",
  data_editor: "Imports and edits merit rounds, seat matrices, lookups and reference files.",
  policy_editor: "Edits and activates scoring policies.",
  verifier: "Verifies candidate records.",
  moderator: "Moderates community discussions and reports.",
  owner: "Everything, including managing the team's roles.",
};

/** Accepts stored or configured role names, including the legacy "admin". */
export function normalizeRole(value: string): Role | null {
  if (value === "admin") return "owner";
  return (ROLES as readonly string[]).includes(value) ? (value as Role) : null;
}

export const CAPABILITIES = {
  /** Open the admin workspace at all (overview, audit history). */
  staff: STAFF_ROLES,
  "data.edit": ["data_editor", "owner"],
  "policy.edit": ["policy_editor", "owner"],
  "candidates.verify": ["verifier", "owner"],
  "community.moderate": ["moderator", "owner"],
  "roles.manage": ["owner"],
} as const satisfies Record<string, readonly Role[]>;
export type Capability = keyof typeof CAPABILITIES;

export type Session = {
  userId: string;
  email: string;
  role: Role;
  /** True only for the development stub — never for a real sign-in. */
  isStub: boolean;
};

/** What a session may do. Every signed-in user may use the candidate portal. */
export function can(session: Session | null, capability: Capability | "portal"): session is Session {
  if (!session) return false;
  if (capability === "portal") return true;
  return (CAPABILITIES[capability] as readonly Role[]).includes(session.role);
}

export const isStaff = (session: Session | null) => can(session, "staff");

export class AuthorizationError extends Error {
  constructor(public readonly reason: "unauthenticated" | "forbidden") {
    super(reason);
    this.name = "AuthorizationError";
  }
}

/** For data-access functions: throw rather than redirect. */
export function assertCan(session: Session | null, capability: Capability | "portal"): asserts session is Session {
  if (!session) throw new AuthorizationError("unauthenticated");
  if (!can(session, capability)) throw new AuthorizationError("forbidden");
}
