import { getSession } from "@/lib/auth/session";
import { exportListCsv } from "@/lib/data/preferences";
import { getDb } from "@/lib/db/client";
import { withAuthErrors } from "@/lib/http/json-download";

/** Download a list as CSV (own lists only; the data layer checks). */
export const GET = withAuthErrors(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const { name, csv } = await exportListCsv(getDb(), await getSession(), id);
  const file = `${name.replace(/[^\w.-]+/g, "_").slice(0, 50) || "preferences"}.csv`;
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${file}"`, "Cache-Control": "no-store" } });
});
