import { describe, expect, it } from "vitest";
import { buildJourney, marginOf, marginText, seatFlow, type JourneyRound } from "@/lib/domain/journey";

const r = (o: Partial<JourneyRound>): JourneyRound => ({
  induction: 21, roundNo: 1, program: "FCPS", quota: "Open", speciality: "Medicine", hospital: "Mayo", marks: 22, preferenceNo: 3, consent: "", closing: 21.5, ...o,
});

describe("journey", () => {
  it("measures the margin above or below closing merit", () => {
    expect(marginOf(22, 21.5)).toBe(0.5);
    expect(marginOf(21, 21.5)).toBe(-0.5);
    expect(marginOf(22, null)).toBeNull();
    expect(marginText(0.5)).toBe("0.50 marks above the closing merit");
    expect(marginText(-0.25)).toBe("0.25 marks below the closing merit");
    expect(marginText(0)).toBe("Exactly at the closing merit");
    expect(marginText(null)).toMatch(/not known/);
  });

  it("orders rounds newest first and pairs each with its consent", () => {
    const j = buildJourney([r({ roundNo: 1 }), r({ roundNo: 3, consent: "Accepted" }), r({ induction: 20, roundNo: 5 })], []);
    expect(j.rounds.map((e) => e.key)).toEqual(["r-21-3", "c-21-3", "r-21-1", "c-21-1", "r-20-5", "c-20-5"]);
    expect(j.rounds[1]).toMatchObject({ kind: "consent", tone: "success", title: "You accepted this seat" });
    expect(j.rounds[3]).toMatchObject({ kind: "consent", tone: "neutral", title: "Consent: no reply recorded yet" });
  });

  it("colours a round by whether the marks cleared closing merit", () => {
    const j = buildJourney([r({ roundNo: 1, marks: 22, closing: 21.5 }), r({ roundNo: 2, marks: 21, closing: 21.5 })], []);
    expect(j.rounds.find((e) => e.key === "r-21-1")).toMatchObject({ tone: "success" });
    expect(j.rounds.find((e) => e.key === "r-21-2")).toMatchObject({ tone: "warning" });
  });

  it("lists notices newest first with unread marked", () => {
    const j = buildJourney([], [
      { id: 1, title: "old", href: "/a", at: new Date("2026-01-01"), read: true },
      { id: 2, title: "new", href: "/b", at: new Date("2026-02-01"), read: false },
    ]);
    expect(j.notices.map((n) => n.key)).toEqual(["n-2", "n-1"]);
    expect(j.notices[0]).toMatchObject({ unread: true });
  });

  it("builds the seat flow from the latest allocation", () => {
    expect(seatFlow([])).toBeNull();
    const f = seatFlow([r({ roundNo: 1, preferenceNo: 5 }), r({ roundNo: 2, preferenceNo: 1, consent: "Accepted" })])!;
    expect(f.round).toEqual({ induction: 21, roundNo: 2 });
    expect(f.preference).toEqual({ no: 1, label: "Your first choice" });
    expect(f.outcome.safe).toBe(true);
    expect(f.consent).toBe("Accepted");
  });
});
