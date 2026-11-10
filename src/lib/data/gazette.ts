import "server-only";
import { asc, desc, eq, sql } from "drizzle-orm";
import { assertCan, type Session } from "@/lib/auth/roles";
import type { Database } from "@/lib/db/client";
import { scoringPolicies, simCandidates } from "@/lib/db/schema";
import { rankRows } from "@/lib/domain/gazette";
import { parseInductions } from "@/lib/domain/prediction";
import { inductionMaxMarks } from "./merit";

/**
 * The gazette: PHF's list of eligible candidates with their merit marks, published before
 * round 1. Applicant id and marks only (never names), the same detail the estimated lists show.
 */

/** How many candidates the gazette of an induction holds (0 when there is none). */
export async function gazetteCount(db: Database, session: Session | null, induction: number) {
  assertCan(session, "portal");
  const [{ n }] = (await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(simCandidates).where(eq(simCandidates.inductionId, induction))) as [{ n: number }];
  return n;
}

/** Every candidate of the induction, best marks first, with a rank (ties share one). */
export async function gazetteList(db: Database, session: Session | null, induction: number) {
  assertCan(session, "portal");
  const rows = await db
    .select({ applicantId: simCandidates.applicantId, marks: simCandidates.baseMarks, profileStatus: simCandidates.profileStatus })
    .from(simCandidates)
    .where(eq(simCandidates.inductionId, induction))
    .orderBy(desc(simCandidates.baseMarks), asc(simCandidates.applicantId));
  if (!rows.length) return null;
  const [maxMarks, policies] = await Promise.all([
    inductionMaxMarks(db),
    db.select({ key: scoringPolicies.policyKey, definition: scoringPolicies.definition }).from(scoringPolicies),
  ]);
  // The total this induction was scored out of: its own policy, else the highest mark seen.
  const own = policies.find((p) => parseInductions((p.definition as { induction?: unknown }).induction).includes(induction));
  const policyTotal = (own?.definition as { total_marks?: number } | undefined)?.total_marks;
  const total = maxMarks[induction] ?? policyTotal ?? null;
  return { induction, total, policy: own ? ((own.definition as { label?: string }).label ?? own.key) : null, rows: rankRows(rows) };
}
