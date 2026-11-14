import "server-only";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Session } from "@/lib/auth/roles";
import { importConsentRounds, importSimulationDataset, queueFirstRoundRun, queueNextRoundRun } from "@/lib/data/simulation";
import type { Database } from "@/lib/db/client";
import { meritRounds, simConsent, simDatasets, simulationRuns } from "@/lib/db/schema";
import { UserFacingError } from "@/lib/errors";
import type { Classified } from "./kind";

/**
 * What happens after files are applied, so an estimate follows the official work:
 *   estimate inputs changed (unofficial list, profile status, gazette …) → rebuild the
 *     induction's dataset, then estimate the next list
 *   consent replies of round r                                         → estimate round r + 1
 *   an official round                                                  → its estimate is superseded
 *                                                                        (shown as such; nothing to run)
 * New estimates are never published here: they wait in Needs you for a person to check.
 * Each step is safe to repeat; a run already queued for the same list is not queued again.
 */

export type TriggerResult = { induction: number; rebuilt: boolean; queued: string | null; note: string | null };

const pending = ["queued", "running"] as const;

async function alreadyQueued(db: Database, induction: number, kind: "first_round" | "next_round", fromRound: number | null) {
  const [r] = await db.select({ id: simulationRuns.id }).from(simulationRuns).where(and(
    eq(simulationRuns.inductionId, induction),
    eq(simulationRuns.kind, kind),
    fromRound == null ? isNull(simulationRuns.fromRound) : eq(simulationRuns.fromRound, fromRound),
    isNull(simulationRuns.ownerUserId),
    inArray(simulationRuns.status, [...pending]),
  )).limit(1);
  return Boolean(r);
}

const message = (e: unknown) => (e instanceof UserFacingError ? e.message : "see the server log");

export async function afterApply(db: Database, session: Session, applied: Classified[], opts: { root?: string } = {}): Promise<TriggerResult[]> {
  const inductions = [...new Set(applied.filter((c) => c.induction != null && (c.kind === "sim_input" || c.kind === "consent")).map((c) => c.induction!))];
  const out: TriggerResult[] = [];
  for (const induction of inductions) {
    const mine = applied.filter((c) => c.induction === induction);
    const inputsChanged = mine.some((c) => c.kind === "sim_input");
    const consentRounds = mine.filter((c) => c.kind === "consent" && c.round != null).map((c) => c.round!);
    const res: TriggerResult = { induction, rebuilt: false, queued: null, note: null };
    out.push(res);

    // 1. Bring the dataset up to date.
    try {
      if (inputsChanged) {
        await importSimulationDataset(db, session, { induction, reason: "Automatic: estimate inputs changed in the data folder" }, opts);
        res.rebuilt = true;
      } else if (consentRounds.length) {
        const [ds] = await db.select({ id: simDatasets.inductionId }).from(simDatasets).where(eq(simDatasets.inductionId, induction)).limit(1);
        if (!ds) { res.note = "Consent kept; the estimate dataset is not built yet."; continue; }
        await importConsentRounds(db, session, { induction, reason: `Automatic: consent round ${consentRounds.join(", ")} added` }, opts);
      }
    } catch (e) {
      res.note = `Dataset not rebuilt: ${message(e)}`;
      if (!(e instanceof UserFacingError)) console.error("trigger: dataset", induction, e);
      continue;
    }

    // 2. Estimate the next list: after the latest official round that has consent replies, else round 1.
    try {
      const [latest] = await db.select({ roundNo: meritRounds.roundNo }).from(meritRounds).where(eq(meritRounds.inductionId, induction)).orderBy(desc(meritRounds.roundNo)).limit(1);
      if (!latest) {
        if (!(await alreadyQueued(db, induction, "first_round", null))) {
          await queueFirstRoundRun(db, session, { induction });
          res.queued = "round 1";
        }
        continue;
      }
      const withConsent = await db.selectDistinct({ roundNo: simConsent.roundNo }).from(simConsent)
        .where(and(eq(simConsent.inductionId, induction), sql`${simConsent.roundNo} <= ${latest.roundNo}`));
      const from = Math.max(0, ...withConsent.map((r) => r.roundNo));
      // Only when something new bears on it: new consent for that round, or rebuilt inputs.
      if (from && (res.rebuilt || consentRounds.includes(from)) && !(await alreadyQueued(db, induction, "next_round", from))) {
        await queueNextRoundRun(db, session, { induction, fromRound: from });
        res.queued = `round ${from + 1}`;
      } else if (!from) {
        res.note = `Round ${latest.roundNo} is out; the next estimate waits for its consent replies.`;
      }
    } catch (e) {
      res.note = `Estimate not queued: ${message(e)}`;
      if (!(e instanceof UserFacingError)) console.error("trigger: estimate", induction, e);
    }
  }
  return out;
}
