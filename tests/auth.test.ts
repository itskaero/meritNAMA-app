import { describe, expect, it } from "vitest";
import { assertCan, AuthorizationError, can, CAPABILITIES, normalizeRole, ROLES, type Role, type Session } from "@/lib/auth/roles";

const as = (role: Role): Session => ({ userId: role, email: `${role}@example.org`, role, isStub: false });

describe("roles and capabilities", () => {
  it("denies everything without a session", () => {
    expect(can(null, "portal")).toBe(false);
    expect(() => assertCan(null, "portal")).toThrow(AuthorizationError);
  });

  it("keeps candidates out of the admin workspace", () => {
    expect(can(as("candidate"), "portal")).toBe(true);
    for (const cap of Object.keys(CAPABILITIES) as (keyof typeof CAPABILITIES)[]) expect(can(as("candidate"), cap)).toBe(false);
    try {
      assertCan(as("candidate"), "staff");
      expect.unreachable();
    } catch (e) {
      expect((e as AuthorizationError).reason).toBe("forbidden");
    }
  });

  it("gives each staff role only its own area", () => {
    expect(can(as("data_editor"), "data.edit")).toBe(true);
    expect(can(as("data_editor"), "policy.edit")).toBe(false);
    expect(can(as("policy_editor"), "policy.edit")).toBe(true);
    expect(can(as("policy_editor"), "data.edit")).toBe(false);
    expect(can(as("moderator"), "community.moderate")).toBe(true);
    expect(can(as("moderator"), "roles.manage")).toBe(false);
    expect(can(as("verifier"), "candidates.verify")).toBe(true);
    for (const r of ROLES.filter((x) => x !== "candidate")) {
      expect(can(as(r), "staff")).toBe(true);
      expect(can(as(r), "portal")).toBe(true);
    }
  });

  it("lets only owners manage roles, and owners do everything", () => {
    for (const r of ROLES) expect(can(as(r), "roles.manage")).toBe(r === "owner");
    for (const cap of Object.keys(CAPABILITIES) as (keyof typeof CAPABILITIES)[]) expect(can(as("owner"), cap)).toBe(true);
  });

  it("reads the legacy admin role as owner", () => {
    expect(normalizeRole("admin")).toBe("owner");
    expect(normalizeRole("moderator")).toBe("moderator");
    expect(normalizeRole("root")).toBeNull();
  });
});
