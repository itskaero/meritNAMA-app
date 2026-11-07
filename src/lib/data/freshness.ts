import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { assertCan, type Session } from "@/lib/auth/roles";
import type { Database } from "@/lib/db/client";
import { inductionSeats, meritRounds, referenceDocuments, scoringPolicies, simDatasets } from "@/lib/db/schema";

export type DataSource = { label: string; detail: string; at: Date | null };

/** Where the portal's figures come from and when each was last updated (dashboard). */
export async function dataSources(db: Database, session: Session | null): Promise<DataSource[]> {
  assertCan(session, "portal");
  const [round] = await db.select({ induction: meritRounds.inductionId, round: meritRounds.roundNo, cycle: meritRounds.cycleName, at: meritRounds.importedAt })
    .from(meritRounds).orderBy(desc(meritRounds.importedAt)).limit(1);
  const [seats] = await db.select({ induction: inductionSeats.inductionId, seats: sql<number>`sum(${inductionSeats.seats})`.mapWith(Number) })
    .from(inductionSeats).groupBy(inductionSeats.inductionId).orderBy(desc(inductionSeats.inductionId)).limit(1);
  const [policy] = await db.select({ key: scoringPolicies.policyKey, version: scoringPolicies.version, at: scoringPolicies.activatedAt })
    .from(scoringPolicies).where(eq(scoringPolicies.status, "active")).limit(1);
  const [cpsp] = await db.select({ version: referenceDocuments.version, at: referenceDocuments.createdAt })
    .from(referenceDocuments).where(eq(referenceDocuments.kind, "cpsp_accreditation")).orderBy(desc(referenceDocuments.version)).limit(1);
  const [sim] = await db.select({ induction: simDatasets.inductionId, at: simDatasets.importedAt }).from(simDatasets).orderBy(desc(simDatasets.importedAt)).limit(1);
  const out: DataSource[] = [];
  if (round) out.push({ label: "Merit lists", detail: `Latest added: induction ${round.induction}, round ${round.round} (${round.cycle}), from PHF's published list`, at: round.at });
  if (seats) out.push({ label: "Seats", detail: `Induction ${seats.induction}'s seat matrix, ${seats.seats.toLocaleString("en-US")} seats`, at: null });
  if (policy) out.push({ label: "Scoring policy", detail: `Policy ${policy.key}, version ${policy.version}`, at: policy.at });
  if (sim) out.push({ label: "Simulation data", detail: `Induction ${sim.induction}: marks, preferences and consent from the official portal`, at: sim.at });
  if (cpsp) out.push({ label: "CPSP accreditation", detail: `CPSP's published list, version ${cpsp.version}`, at: cpsp.at });
  return out;
}
