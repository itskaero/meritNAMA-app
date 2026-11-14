import { describe, expect, it } from "vitest";
import { ago, cycleSteps, nextPhfStep, sortQueue, workerHealth, type QueueItem } from "@/lib/admin/today";
import { adminSections } from "@/lib/navigation";

const now = new Date("2026-11-14T06:00:00Z");
const at = (iso: string) => new Date(iso);

describe("admin today", () => {
  it("turns PHF's schedule into done, open and next steps", () => {
    const steps = cycleSteps([
      { title: "Joining", sortOrder: 2, startsAt: at("2026-11-04T00:00:00Z"), endsAt: at("2026-11-24T00:00:00Z") },
      { title: "Gazette", sortOrder: 1, startsAt: null, endsAt: at("2026-06-07T00:00:00Z") },
      { title: "Consent · Round 09", sortOrder: 3, startsAt: at("2026-11-16T00:00:00Z"), endsAt: at("2026-11-18T00:00:00Z") },
      { title: "Cycle ends", sortOrder: 4, startsAt: null, endsAt: null },
    ], now);
    expect(steps.map((s) => [s.title, s.state])).toEqual([["Gazette", "done"], ["Joining", "now"], ["Consent · Round 09", "next"], ["Cycle ends", "next"]]);
    expect(steps[1]!.progress).toBeCloseTo(0.5, 1);
    expect(steps[1]!.when).toBe("open · till 24 Nov");
    expect(nextPhfStep(steps)).toMatchObject({ title: "Consent · Round 09", when: "from 16 Nov" });
  });

  it("sorts Needs you by urgency and drops empty queues", () => {
    const q = (id: string, urgency: number): QueueItem => ({ id, tag: "x", title: id, detail: "", cta: "Go", href: "/admin", tone: "neutral", urgency });
    expect(sortQueue([q("links", 50), null, q("estimate", 95), q("names", 40)]).map((x) => x.id)).toEqual(["estimate", "links", "names"]);
  });

  it("reports a quiet worker", () => {
    expect(workerHealth(at("2026-11-14T05:59:20Z"), now)).toMatchObject({ tone: "ok", text: "Last tick 40 s ago" });
    expect(workerHealth(at("2026-11-14T05:50:00Z"), now).tone).toBe("warn");
    expect(workerHealth(at("2026-11-14T03:00:00Z"), now).tone).toBe("bad");
    expect(workerHealth(null, now).tone).toBe("warn");
    expect(ago(at("2026-11-12T06:00:00Z"), now)).toBe("2 days ago");
  });

  it("keeps the admin menu to eight items", () => {
    expect(adminSections.filter((s) => !s.hideInNav).map((s) => s.label)).toEqual([
      "Today", "Data", "Jobs", "Candidates & access", "Community", "Team & settings", "Policies & rules", "Changes & audit",
    ]);
  });
});
