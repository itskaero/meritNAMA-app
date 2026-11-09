import { describe, expect, it } from "vitest";
import { dialModel } from "@/lib/domain/chance";

const base = { firstPct: 64.3, lastPct: 62.2, firstRound: 1, lastRound: 6 };

describe("chance dial", () => {
  it("uses the finder's rule at the boundaries", () => {
    expect(dialModel({ ...base, mePct: 64.3 }).status).toBe("safe");
    expect(dialModel({ ...base, mePct: 64.29 }).status).toBe("borderline");
    expect(dialModel({ ...base, mePct: 62.2 }).status).toBe("borderline");
    expect(dialModel({ ...base, mePct: 62.19 }).status).toBe("out");
  });

  it("frames the score and both closings with headroom, and maps them onto the half circle", () => {
    const m = dialModel({ ...base, mePct: 63 });
    expect(m).toMatchObject({ lo: 59, hi: 68, label: "Borderline" });
    expect(m.angle(m.lo)).toBeCloseTo(Math.PI);
    expect(m.angle(m.hi)).toBeCloseTo(2 * Math.PI);
    expect(m.angle(1000)).toBeCloseTo(2 * Math.PI);
    expect(m.reason).toContain("round 6");
  });
});
