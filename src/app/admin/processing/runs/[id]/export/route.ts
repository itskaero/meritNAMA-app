import { getSession } from "@/lib/auth/session";
import { runOutput } from "@/lib/data/simulation";
import { getDb } from "@/lib/db/client";
import { isUuid } from "@/lib/format";
import { jsonProblem, withAuthErrors } from "@/lib/http/json-download";

/** A finished run's simulated list, as CSV or self-describing JSON. runOutput checks the capability and audits it. */
export const GET = withAuthErrors(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonProblem(404, "not found");
  const format = new URL(req.url).searchParams.get("format") === "json" ? "json" : "csv";
  const out = await runOutput(getDb(), await getSession(), { id, format });
  return new Response(format === "csv" ? "﻿" + out.body : out.body, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": `${out.type}; charset=utf-8`,
      "Content-Disposition": `attachment; filename="${out.filename}"`,
    },
  });
});
