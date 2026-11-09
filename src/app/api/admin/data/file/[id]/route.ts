import { getSession } from "@/lib/auth/session";
import { readDataFile } from "@/lib/data/datastore";
import { getDb } from "@/lib/db/client";
import { isUuid } from "@/lib/format";
import { jsonProblem, withAuthErrors } from "@/lib/http/json-download";

export const dynamic = "force-dynamic";

/** Download a file of the data folder exactly as it is stored, to edit and drop back. */
export const GET = withAuthErrors(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  if (!isUuid(id)) return jsonProblem(404, "That file is not in the list.");
  const { filename, body } = await readDataFile(getDb(), await getSession(), { id });
  return new Response(new Uint8Array(body), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename.replace(/["\\r\n]/g, "")}"`,
    },
  });
});
