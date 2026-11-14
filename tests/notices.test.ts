import { describe, expect, it } from "vitest";
import { deadlineNotice, estimateNotice, noticeInputSchema, pickNotices, roundNotice, type Notice } from "@/lib/domain/notices";

const now = new Date("2026-11-14T06:00:00Z"); // 11:00 in Pakistan
const at = (iso: string) => new Date(iso);

describe("notification bar", () => {
  it("shows the PHF step closing soonest within a week", () => {
    const n = deadlineNotice(21, [
      { stepId: 1, title: "Consent - Round 09", startsAt: at("2026-11-10T00:00:00Z"), endsAt: at("2026-11-17T18:00:00Z") },
      { stepId: 2, title: "Joining Time", startsAt: at("2026-11-01T00:00:00Z"), endsAt: at("2026-11-21T18:00:00Z") },
      { stepId: 3, title: "Not started", startsAt: at("2026-11-15T00:00:00Z"), endsAt: at("2026-11-16T00:00:00Z") },
      { stepId: 4, title: "Already over", startsAt: null, endsAt: at("2026-11-13T00:00:00Z") },
    ], now);
    expect(n).toMatchObject({ id: "deadline:21:1", tone: "warning", text: "Consent · Round 09 closes Tue 17 Nov." });
  });

  it("says today when the step closes today, and nothing beyond a week", () => {
    expect(deadlineNotice(21, [{ stepId: 9, title: "Seats", startsAt: null, endsAt: at("2026-11-14T18:00:00Z") }], now)!.text).toBe("Seats closes today.");
    expect(deadlineNotice(21, [{ stepId: 9, title: "Seats", startsAt: null, endsAt: at("2026-11-30T18:00:00Z") }], now)).toBeNull();
  });

  it("announces a new round for three days and a new estimate for two, unless superseded", () => {
    expect(roundNotice({ induction: 21, roundNo: 9, importedAt: at("2026-11-12T06:00:00Z") }, now)?.href).toBe("/portal/history/21/rounds/9");
    expect(roundNotice({ induction: 21, roundNo: 9, importedAt: at("2026-11-10T06:00:00Z") }, now)).toBeNull();
    expect(estimateNotice({ id: "e1", roundNo: 9, publishedAt: at("2026-11-13T06:00:00Z"), official: false }, now)?.href).toBe("/portal/estimates?run=e1");
    expect(estimateNotice({ id: "e1", roundNo: 9, publishedAt: at("2026-11-13T06:00:00Z"), official: true }, now)).toBeNull();
  });

  it("puts team posts first and shows three at most", () => {
    const n = (id: string, auto = true): Notice => ({ id, text: id, href: null, tone: "info", auto });
    expect(pickNotices([n("t1", false), n("t2", false)], [n("a1"), null, n("a2")]).map((x) => x.id)).toEqual(["t1", "t2", "a1"]);
  });

  it("checks a team post", () => {
    expect(noticeInputSchema.parse({ text: "PHF portal is down tonight", days: 1 })).toMatchObject({ href: null, tone: "info", audience: "all" });
    expect(() => noticeInputSchema.parse({ text: "ok fine", href: "javascript:alert(1)", days: 1 })).toThrow();
    expect(() => noticeInputSchema.parse({ text: "x".repeat(161), days: 1 })).toThrow();
    expect(() => noticeInputSchema.parse({ text: "too long", days: 90 })).toThrow();
  });
});
