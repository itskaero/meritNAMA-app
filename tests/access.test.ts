import { describe, expect, it } from "vitest";
import { accessDecision, accessRequestSchema, accessSettingsSchema, DEFAULT_ACCESS, priceText } from "@/lib/domain/access";

const on = { paywall: true, keepExisting: true, since: "2026-11-01T00:00:00Z" };
const base = { settings: on, ownerEmail: false, existingRole: null, existingSince: null, approved: false };

describe("access rules", () => {
  it("lets everyone in while the paywall is off", () => {
    expect(accessDecision({ ...base, settings: { ...on, paywall: false } })).toEqual({ allowed: true });
  });

  it("asks a stranger for approval when it is on", () => {
    expect(accessDecision(base)).toEqual({ allowed: false, reason: "paywall" });
  });

  it("lets approved people, owners and the team in", () => {
    expect(accessDecision({ ...base, approved: true }).allowed).toBe(true);
    expect(accessDecision({ ...base, ownerEmail: true }).allowed).toBe(true);
    expect(accessDecision({ ...base, existingRole: "moderator" }).allowed).toBe(true);
    expect(accessDecision({ ...base, existingRole: "candidate" }).allowed).toBe(false);
  });

  it("keeps accounts older than the paywall, only when asked to", () => {
    const old = { ...base, existingRole: "candidate", existingSince: new Date("2026-10-01") };
    expect(accessDecision(old).allowed).toBe(true);
    expect(accessDecision({ ...old, existingSince: new Date("2026-11-02") }).allowed).toBe(false);
    expect(accessDecision({ ...old, settings: { ...on, keepExisting: false } }).allowed).toBe(false);
    expect(accessDecision({ ...old, settings: { ...on, since: null } }).allowed).toBe(false);
  });

  it("prints the price range", () => {
    expect(priceText({ priceMinPkr: 250, priceMaxPkr: 670 })).toBe("PKR 250–670");
    expect(priceText({ priceMinPkr: 500, priceMaxPkr: 500 })).toBe("PKR 500");
  });
});

describe("access request form", () => {
  const required = accessRequestSchema({ paymentRequired: true, priceMinPkr: 250 });
  const ok = { email: " Ayesha@Example.com ", applicantId: "12345", amountPkr: 300, reference: "TXN-99881", message: "" };

  it("accepts a good request and cleans it", () => {
    expect(required.parse(ok)).toMatchObject({ email: "ayesha@example.com", applicantId: "12345", amountPkr: 300, message: null });
  });

  it("insists on the amount and reference when payment is required", () => {
    expect(required.safeParse({ ...ok, amountPkr: 100 }).success).toBe(false);
    expect(required.safeParse({ ...ok, amountPkr: undefined }).success).toBe(false);
    expect(required.safeParse({ ...ok, reference: "ab" }).success).toBe(false);
  });

  it("makes payment optional when it is not required", () => {
    const free = accessRequestSchema({ paymentRequired: false, priceMinPkr: 250 });
    expect(free.parse({ email: "a@b.co", applicantId: "", amountPkr: null, reference: "", message: "hi" })).toMatchObject({ amountPkr: null, reference: null, applicantId: null });
  });

  it("rejects a bad email or applicant ID", () => {
    expect(required.safeParse({ ...ok, email: "nope" }).success).toBe(false);
    expect(required.safeParse({ ...ok, applicantId: "12a" }).success).toBe(false);
  });
});

describe("access settings", () => {
  const good = { ...DEFAULT_ACCESS, accountNumber: "0891-2007-4774", paywall: true };
  const { since: _since, ...input } = good;
  void _since;

  it("needs a place to pay before the paywall can go on", () => {
    expect(accessSettingsSchema.safeParse(input).success).toBe(true);
    expect(accessSettingsSchema.safeParse({ ...input, accountNumber: "" }).success).toBe(false);
    expect(accessSettingsSchema.safeParse({ ...input, accountNumber: "", paywall: false }).success).toBe(true);
  });

  it("keeps the range in order", () => {
    expect(accessSettingsSchema.safeParse({ ...input, priceMinPkr: 900, priceMaxPkr: 300 }).success).toBe(false);
  });
});
