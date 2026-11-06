import { describe, expect, it } from "vitest";
import { analyseList, outcomeSummary, type PlannedItem } from "@/lib/domain/preferences";

const item = (position: number, status: PlannedItem["status"], offered = true): PlannedItem => ({ position, speciality: `Spec ${position}`, hospital: `Hosp ${position}`, status, offered });
const on = { hasMarks: true, induction: 20 };

describe("preference list analysis", () => {
  it("finds the likely placement, later-round chances and unused options", () => {
    const items = [item(1, "out"), item(2, "borderline"), item(3, "borderline"), item(4, "safe"), item(5, "safe"), item(6, "borderline")];
    const a = analyseList(items, on);
    expect(a).toMatchObject({ likely: 4, possible: [2, 3], unreached: [5, 6] });
    expect(a.warnings.map((w) => w.kind)).toEqual(["below-safe"]);
    expect(outcomeSummary(a, items)).toBe("Most likely: #4 Spec 4, Hosp 4 (Safe). #2–#3 are Borderline and could come in later rounds.");
  });

  it("warns when nothing is Safe, everything is Out, an option was not offered, or marks are missing", () => {
    const noSafe = [item(1, "borderline"), item(2, "out")];
    const a = analyseList(noSafe, on);
    expect(a.likely).toBeNull();
    expect(a.warnings.map((w) => w.kind)).toEqual(["no-safe"]);
    expect(outcomeSummary(a, noSafe)).toContain("Best hope: #1");

    const allOut = analyseList([item(1, "out"), item(2, "out")], on);
    expect(allOut.warnings.map((w) => w.kind)).toEqual(["all-out"]);

    const gone = analyseList([item(1, null, false), item(2, "safe")], on);
    expect(gone.warnings[0]).toMatchObject({ kind: "not-offered", positions: [1] });
    expect(gone.warnings[0]!.message).toContain("induction 20");

    const blind = analyseList([item(1, null), item(2, null)], { hasMarks: false, induction: 20 });
    expect(blind.warnings.map((w) => w.kind)).toEqual(["no-marks"]);
    expect(outcomeSummary(blind, [item(1, null)])).toBe("Add your marks to see the likely outcome.");
  });

  it("says so when the list is empty", () => {
    const a = analyseList([], on);
    expect(a.warnings[0]!.kind).toBe("empty");
    expect(outcomeSummary(a, [])).toBe("Nothing on this list yet.");
  });
});
