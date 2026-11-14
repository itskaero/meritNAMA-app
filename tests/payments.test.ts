import { describe, expect, it } from "vitest";
import { accessDecision, accessRequestSchema, DEFAULT_ACCESS } from "@/lib/domain/access";
import { accessEnds, dueForReminder, matchPayment, normalizeVoucher, voucherCode, type MatchInput } from "@/lib/domain/payments";
import { looksLikeTid, normalizeTid, parseCsv, parsePkDate, parseSms, parseStatement } from "@/lib/payments/parse";

// Anonymised examples in the shape wallets send. Numbers and names are made up.
const SMS = `You have received Rs 500.00 from Ali Khan 03001234567 via Easypaisa. TID: 41823975512. 14-Nov-2026 10:32 PM

Dear Customer, PKR 670 received from 0321-7654321 in your JazzCash account. Trx ID 0987654321123 on 13/11/2026 09:05

You have sent Rs 200 to 03111111111. TID: 55555555555

Your balance is Rs 1,240.`;

describe("payment statements", () => {
  it("reads received money from pasted SMS and skips the rest", () => {
    const r = parseSms(SMS, "bank");
    expect(r.payments).toEqual([
      { channel: "easypaisa", tid: "41823975512", amountPkr: 500, paidAt: new Date("2026-11-14T17:32:00Z") },
      { channel: "jazzcash", tid: "0987654321123", amountPkr: 670, paidAt: new Date("2026-11-13T04:05:00Z") },
    ]);
    expect(r.skipped).toBe(2);
  });

  it("never keeps a phone number or a name", () => {
    const r = parseStatement(SMS, "bank");
    const out = JSON.stringify(r.payments);
    expect(out).not.toMatch(/0300|0321|03111|Ali|Khan/);
    for (const p of r.payments) expect(Object.keys(p).sort()).toEqual(["amountPkr", "channel", "paidAt", "tid"]);
  });

  it("reads a CSV statement by its headers, credits only", () => {
    const csv = `Date,Transaction ID,Description,Debit,Credit,Balance
14/11/2026 10:32,41823975512,"Money received from 03001234567",,500,1500
14/11/2026 11:00,41823975513,Bill payment,300,,1200
15/11/2026,ABC12345678,"Received from bank",,"1,000",2200`;
    const r = parseCsv(csv, "easypaisa");
    expect(r.payments.map((p) => [p.tid, p.amountPkr])).toEqual([["41823975512", 500], ["ABC12345678", 1000]]);
    expect(r.skipped).toBe(1);
    expect(parseStatement(csv, "easypaisa").format).toBe("csv");
  });

  it("normalises transaction IDs and dates", () => {
    expect(normalizeTid(" tid 418-239 75512 ")).toBe("TID41823975512");
    expect(looksLikeTid("hello")).toBe(false);
    expect(looksLikeTid("418 239 755")).toBe(true);
    expect(parsePkDate("2026-11-14 22:32")?.toISOString()).toBe("2026-11-14T17:32:00.000Z");
    expect(parseStatement(`${SMS}\n\n${SMS}`).payments).toHaveLength(2);
  });
});

describe("automatic payment check", () => {
  const base: MatchInput = {
    request: { id: "r1", email: "a@x.pk", tid: "41823975512" },
    payment: { id: "p1", amountPkr: 500, paidAt: new Date("2026-11-14T00:00:00Z"), matchedRequestId: null },
    matchedEmail: null, othersWithTid: 0, priceMinPkr: 500, notBefore: new Date("2026-05-01T00:00:00Z"),
  };
  it("approves only what is provable", () => {
    expect(matchPayment(base)).toEqual({ result: "matched", approve: true });
    expect(matchPayment({ ...base, payment: null }).result).toBe("tid_unseen");
    expect(matchPayment({ ...base, payment: { ...base.payment!, amountPkr: 300 } }).result).toBe("amount_short");
    expect(matchPayment({ ...base, payment: { ...base.payment!, matchedRequestId: "r2" }, matchedEmail: "b@x.pk" }).result).toBe("tid_reused");
    expect(matchPayment({ ...base, othersWithTid: 1 }).result).toBe("duplicate_tid");
    expect(matchPayment({ ...base, payment: { ...base.payment!, paidAt: new Date("2026-01-01T00:00:00Z") } }).result).toBe("stale");
    expect(matchPayment({ ...base, request: { ...base.request, tid: null } }).approve).toBe(false);
  });

  it("ends access with the cycle, never sooner than 30 days, and reminds once in the last week", () => {
    const now = new Date("2026-11-14T00:00:00Z");
    expect(accessEnds(new Date("2027-01-31T00:00:00Z"), now)?.toISOString()).toBe("2027-01-31T00:00:00.000Z");
    expect(accessEnds(new Date("2026-11-20T00:00:00Z"), now)?.toISOString()).toBe("2026-12-14T00:00:00.000Z");
    expect(accessEnds(null, now)).toBeNull();
    expect(dueForReminder(new Date("2026-11-18T00:00:00Z"), null, now)).toBe(true);
    expect(dueForReminder(new Date("2026-11-18T00:00:00Z"), now, now)).toBe(false);
    expect(dueForReminder(new Date("2026-12-18T00:00:00Z"), null, now)).toBe(false);
  });

  it("refuses expired access, but keeps accounts from before the paywall", () => {
    const settings = { paywall: true, keepExisting: true, since: "2026-06-01T00:00:00Z" };
    const now = new Date("2026-11-14T00:00:00Z");
    const d = (o: Partial<Parameters<typeof accessDecision>[0]>) => accessDecision({ settings, ownerEmail: false, existingRole: null, existingSince: null, approved: true, now, ...o });
    expect(d({ expiresAt: new Date("2026-12-01T00:00:00Z") })).toEqual({ allowed: true });
    expect(d({ expiresAt: new Date("2026-11-01T00:00:00Z") })).toEqual({ allowed: false, reason: "expired" });
    expect(d({ expiresAt: new Date("2026-11-01T00:00:00Z"), existingRole: "candidate", existingSince: new Date("2026-01-01T00:00:00Z") })).toEqual({ allowed: true });
  });

  it("makes readable codes and takes a code instead of a payment", () => {
    const c = voucherCode(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]));
    expect(c).toMatch(/^MN-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(normalizeVoucher(c.toLowerCase())).toBe(normalizeVoucher(c.replace(/-/g, " ")));
    const schema = accessRequestSchema(DEFAULT_ACCESS);
    const form = { email: "a@x.pk", applicantId: "", channel: "easypaisa", amountPkr: null, reference: "", voucher: "", message: "" };
    expect(() => schema.parse(form)).toThrow(/transaction ID/);
    expect(schema.parse({ ...form, voucher: c }).voucher).toBe(c);
    expect(schema.parse({ ...form, reference: "41823975512" }).channel).toBe("easypaisa");
  });
});
