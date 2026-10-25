import { describe, expect, it } from "vitest";
import { assertRole, AuthorizationError, hasRole, type Session } from "@/lib/auth/roles";

const candidate: Session = { userId: "u1", email: "c@example.org", role: "candidate", isStub: false };
const admin: Session = { userId: "u2", email: "a@example.org", role: "admin", isStub: false };

describe("role checks", () => {
  it("denies everything without a session", () => {
    expect(hasRole(null, "candidate")).toBe(false);
    expect(() => assertRole(null, "candidate")).toThrow(AuthorizationError);
  });

  it("keeps candidates out of admin", () => {
    expect(hasRole(candidate, "admin")).toBe(false);
    try {
      assertRole(candidate, "admin");
      expect.unreachable();
    } catch (e) {
      expect((e as AuthorizationError).reason).toBe("forbidden");
    }
  });

  it("lets admins view candidate pages", () => {
    expect(hasRole(admin, "candidate")).toBe(true);
    expect(hasRole(admin, "admin")).toBe(true);
  });
});
