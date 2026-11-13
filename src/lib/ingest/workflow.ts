import type { Stage } from "./kind";
import type { SimRole } from "./sim-roles";

/**
 * The induction workflow, as PHF runs it:
 *   unofficial candidate list → verification → amendment → official gazette
 *   → estimated merit list → official round lists → joining
 * An estimate can be built early from the unofficial list alone (skipping verification,
 * amendment and the gazette). As each official file lands it replaces its unofficial
 * layer, and the next estimate is built on it. Pure: callers pass in what exists.
 */

export const STAGES: readonly Stage[] = ["unofficial", "verification", "amendment", "gazette", "estimate", "rounds", "joining"];
export const STAGE_LABELS: Record<Stage, string> = {
  unofficial: "Unofficial list",
  verification: "Verification",
  amendment: "Amendment",
  gazette: "Gazette",
  estimate: "Estimate",
  rounds: "Official rounds",
  joining: "Joining",
};

/** official ✓ · unofficial ◐ · estimate ◆ (built, maybe unpublished) · waiting ◷ (a file is in, not applied) · none ○ */
export type StageState = { stage: Stage; state: "official" | "unofficial" | "estimate" | "waiting" | "none"; detail: string };

/** What an estimate was built on. Recorded on the run, so it never changes afterwards. */
export type Basis = {
  /** The unofficial portal list (candidates, or marks + preferences). */
  unofficialList: boolean;
  gazette: boolean;
  /** Candidates with a Round 01 verification step / an Amendment step. */
  verified: number;
  amended: number;
  /** Active team corrections (grievance, amendment, admin). */
  corrections: number;
  /** next_round runs: the official round it starts from, and whose consent it used. */
  fromRound: number | null;
  consent: "official" | "simulated" | null;
};

export type BasisChip = { label: string; tone: "official" | "unofficial" | "info" };

/** "from the gazette" or "from the unofficial list": the short label for badges. */
export function basisLabel(b: Basis): string {
  return b.gazette ? "from the official gazette" : b.unofficialList ? "from the unofficial list" : "from imported data";
}

/** The "Built on" strip: each layer the estimate used, official ones first. */
export function basisChips(b: Basis): BasisChip[] {
  const out: BasisChip[] = [];
  if (b.gazette) out.push({ label: "Official gazette", tone: "official" });
  else if (b.unofficialList) out.push({ label: "Unofficial list (gazette not out)", tone: "unofficial" });
  if (b.verified) out.push({ label: b.amended ? "Verification + amendment" : "Verification Round 01", tone: "official" });
  else if (!b.gazette) out.push({ label: "Verification not in yet", tone: "unofficial" });
  if (b.fromRound != null) out.push({ label: `Official round ${b.fromRound}`, tone: "official" });
  if (b.consent) out.push({ label: b.consent === "official" ? `Consent replies, round ${b.fromRound}` : "Changed consent (what-if)", tone: b.consent === "official" ? "official" : "unofficial" });
  if (b.corrections) out.push({ label: `${b.corrections.toLocaleString("en-US")} corrections`, tone: "info" });
  return out;
}

export type LaneInput = {
  /** Roles in the built estimate dataset (its source files). */
  datasetRoles: SimRole[];
  /** Roles of estimate-input files in the data folder that are not built into the dataset yet. */
  waitingRoles: SimRole[];
  verified: number;
  amended: number;
  /** Official rounds imported, ascending. */
  rounds: number[];
  /** A round with a merit file waiting to be applied. */
  roundWaiting: boolean;
  /** Latest estimate of the induction, if any. */
  estimate: { roundNo: number; published: boolean; official: boolean } | null;
  joining: "official" | "waiting" | "none";
};

const has = (roles: SimRole[], ...want: SimRole[]) => want.some((r) => roles.includes(r));

/** The seven-step lane on an induction's card. */
export function inductionLane(i: LaneInput): StageState[] {
  const gazette = has(i.datasetRoles, "gazette");
  const unofficial = has(i.datasetRoles, "candidates", "marks", "preferences");
  const lane: StageState[] = [];
  const push = (stage: Stage, state: StageState["state"], detail: string) => lane.push({ stage, state, detail });

  if (unofficial) push("unofficial", gazette ? "official" : "unofficial", gazette ? "replaced by the gazette" : "from the portal");
  else if (has(i.waitingRoles, "candidates", "marks", "preferences")) push("unofficial", "waiting", "file in, not built");
  else push("unofficial", "none", gazette ? "not kept" : "not in yet");

  if (i.verified) push("verification", "official", `${i.verified.toLocaleString("en-US")} checked`);
  else if (has(i.waitingRoles, "profileStatus")) push("verification", "waiting", "file in, not built");
  else push("verification", "none", "not in yet");

  if (i.amended) push("amendment", "official", `${i.amended.toLocaleString("en-US")} checked`);
  else push("amendment", "none", "not in yet");

  if (gazette) push("gazette", "official", "official");
  else if (has(i.waitingRoles, "gazette")) push("gazette", "waiting", "file in, not built");
  else push("gazette", "none", "not out yet");

  if (i.estimate && !i.estimate.official) push("estimate", "estimate", `round ${i.estimate.roundNo} · ${i.estimate.published ? "published" : "not published"}`);
  else push("estimate", "none", i.estimate ? "superseded by the official list" : "none yet");

  if (i.roundWaiting) push("rounds", "waiting", i.rounds.length ? `${roundsText(i.rounds)} · new file in` : "new file in");
  else if (i.rounds.length) push("rounds", "official", roundsText(i.rounds));
  else push("rounds", "none", "none yet");

  push("joining", i.joining, i.joining === "official" ? "last round" : i.joining === "waiting" ? "file in" : "not in yet");
  return lane;
}

function roundsText(r: number[]): string {
  return r.length === 1 ? `round ${r[0]}` : `rounds ${r[0]}–${r[r.length - 1]}`;
}

/** The one next step for an induction, for its card's button. */
export function nextStep(lane: StageState[]): { stage: Stage; label: string } | null {
  const by = new Map(lane.map((s) => [s.stage, s]));
  const waiting = lane.find((s) => s.state === "waiting");
  if (waiting) return { stage: waiting.stage, label: `Apply the ${STAGE_LABELS[waiting.stage].toLowerCase()} file` };
  if (by.get("estimate")?.state === "estimate" && by.get("estimate")!.detail.endsWith("not published")) return { stage: "estimate", label: "Review & publish the estimate" };
  if (by.get("unofficial")?.state === "none" && by.get("gazette")?.state === "none") return { stage: "unofficial", label: "Add the candidate list or the gazette" };
  if (by.get("gazette")?.state === "none") return { stage: "gazette", label: "Add the gazette when PHF publishes it" };
  if (by.get("rounds")?.state === "none") return { stage: "estimate", label: "Build the round 1 estimate" };
  return null;
}
