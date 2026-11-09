import { describe, expect, it } from "vitest";
import { identityHmac, normalizeEmail, normalizePmdc, parseEmailList, sha256, newSecret } from "@/lib/domain/identity";
import * as script from "../scripts/lib/identity-index.mjs";

describe("identity rules", () => {
  it("normalises emails and refuses non-emails", () => {
    expect(normalizeEmail("  Candidate0@Example.TEST ")).toBe("candidate0@example.test");
    expect(normalizeEmail("not an email")).toBeNull();
    expect(normalizeEmail(42)).toBeNull();
  });

  it("normalises PMDC numbers written different ways", () => {
    expect(normalizePmdc("12345-p")).toBe("12345P");
    expect(normalizePmdc(" 12345 P ")).toBe("12345P");
    expect(normalizePmdc("-")).toBeNull();
  });

  it("keys HMACs by kind and secret", () => {
    const a = identityHmac("s".repeat(32), "email", "a@b.co");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(identityHmac("s".repeat(32), "email", "a@b.co")).toBe(a);
    expect(identityHmac("t".repeat(32), "email", "a@b.co")).not.toBe(a);
    expect(identityHmac("s".repeat(32), "pmdc", "a@b.co")).not.toBe(a);
  });

  it("matches the backfill script's rules exactly", () => {
    const secret = "x".repeat(40);
    for (const e of [" Candidate0@Example.test", "someone@phf.gop.pk"]) expect(script.normalizeEmail(e)).toBe(normalizeEmail(e));
    for (const p of ["0000-X", "12345 p", 98765]) expect(script.normalizePmdc(p)).toBe(normalizePmdc(p));
    expect(script.identityHmac(secret, "pmdc", "0000X")).toBe(identityHmac(secret, "pmdc", "0000X"));
    const rows = script.identitiesFromRound({ Table: [{ inductionId: 20 }], Table5: [{ applicantId: "A1", emailId: "A@B.co", pmdcNo: "1-2-3" }] }, secret);
    expect(rows).toEqual([{ applicantId: "A1", emailHmac: identityHmac(secret, "email", "a@b.co"), pmdcHmac: identityHmac(secret, "pmdc", "123"), lastInduction: 20 }]);
    expect(script.identitiesFromRound({ nope: true }, secret)).toBeNull();
  });

  it("makes long random secrets and stores only their hash", () => {
    const s = newSecret();
    expect(s.length).toBeGreaterThanOrEqual(43);
    expect(newSecret()).not.toBe(s);
    expect(sha256(s)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("reads OWNER_EMAILS loosely", () => {
    expect([...parseEmailList("Boss@x.org, second@y.org;bad  third@z.org")]).toEqual(["boss@x.org", "second@y.org", "third@z.org"]);
  });
});
