import "server-only";
import { cache } from "react";
import { sql } from "drizzle-orm";
import type { Database } from "@/lib/db/client";

/**
 * When merit lists were last imported: for one induction, or for all of them.
 * Public metadata (a date), used under charts; cached per request.
 */
export const lastMeritImport = cache(async (db: Database, induction: number | null): Promise<{ at: Date | null; rounds: number }> => {
  const [r] = (await db.execute(sql`
    select max(imported_at) as at, count(*)::int as rounds from merit_rounds
    ${induction == null ? sql`` : sql`where induction_id = ${induction}`}`)) as unknown as { at: string | null; rounds: number }[];
  return { at: r?.at ? new Date(r.at) : null, rounds: r?.rounds ?? 0 };
});
