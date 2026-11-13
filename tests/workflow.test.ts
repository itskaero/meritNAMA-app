import { describe, expect, it } from "vitest";
import { basisChips, basisLabel, inductionLane, nextStep, type Basis, type LaneInput } from "@/lib/ingest/workflow";

const empty: LaneInput = { datasetRoles: [], waitingRoles: [], verified: 0, amended: 0, rounds: [], roundWaiting: false, estimate: null, joining: "none" };
const stateOf = (lane: ReturnType<typeof inductionLane>) => Object.fromEntries(lane.map((s) => [s.stage, s.state]));

describe("induction workflow lane", () => {
  it("an announced induction with only the unofficial list and an early estimate", () => {
    const lane = inductionLane({ ...empty, datasetRoles: ["candidates"], estimate: { roundNo: 1, published: false, official: false } });
    expect(stateOf(lane)).toMatchObject({ unofficial: "unofficial", verification: "none", gazette: "none", estimate: "estimate", rounds: "none" });
    expect(nextStep(lane)).toMatchObject({ stage: "estimate", label: "Review & publish the estimate" });
  });

  it("official layers replace the unofficial one as they land", () => {
    const lane = inductionLane({ ...empty, datasetRoles: ["candidates", "gazette", "profileStatus"], verified: 9000, amended: 400, rounds: [1, 2, 3, 4, 5, 6, 7, 8], estimate: { roundNo: 9, published: false, official: false }, joining: "waiting" });
    expect(stateOf(lane)).toMatchObject({ unofficial: "official", verification: "official", amendment: "official", gazette: "official", estimate: "estimate", rounds: "official", joining: "waiting" });
    expect(lane.find((s) => s.stage === "rounds")!.detail).toBe("rounds 1–8");
    // A file waiting to be applied comes before publishing.
    expect(nextStep(lane)).toMatchObject({ stage: "joining" });
  });

  it("a closed induction with only the gazette and rounds", () => {
    const lane = inductionLane({ ...empty, datasetRoles: ["gazette", "preferences"], rounds: [1, 2, 3], estimate: { roundNo: 3, published: true, official: true } });
    expect(stateOf(lane)).toMatchObject({ gazette: "official", estimate: "none", rounds: "official" });
    expect(nextStep(lane)).toBeNull();
  });

  it("asks for data when nothing is in", () => {
    expect(nextStep(inductionLane(empty))).toMatchObject({ stage: "unofficial" });
    expect(stateOf(inductionLane({ ...empty, waitingRoles: ["gazette"] })).gazette).toBe("waiting");
  });
});

describe("estimate basis", () => {
  const early: Basis = { unofficialList: true, gazette: false, verified: 0, amended: 0, corrections: 0, fromRound: null, consent: null };
  it("labels an early estimate as unofficial", () => {
    expect(basisLabel(early)).toBe("from the unofficial list");
    expect(basisChips(early).map((c) => c.tone)).toEqual(["unofficial", "unofficial"]);
  });

  it("lists official layers, the round, consent and corrections", () => {
    const later: Basis = { unofficialList: true, gazette: true, verified: 9000, amended: 300, corrections: 214, fromRound: 5, consent: "official" };
    expect(basisLabel(later)).toBe("from the official gazette");
    expect(basisChips(later).map((c) => c.label)).toEqual(["Official gazette", "Verification + amendment", "Official round 5", "Consent replies, round 5", "214 corrections"]);
  });
});
