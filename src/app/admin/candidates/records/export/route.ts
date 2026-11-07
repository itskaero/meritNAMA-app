import { getSession } from "@/lib/auth/session";
import { exportRecordsCsv } from "@/lib/data/candidate-records";
import { getDb } from "@/lib/db/client";
import { csvDownload, jsonProblem, withAuthErrors } from "@/lib/http/json-download";

/** One induction's candidate records as CSV. exportRecordsCsv checks the capability and audits the export. */
export const GET = withAuthErrors(async (req: Request) => {
  const i = Number(new URL(req.url).searchParams.get("i"));
  if (!Number.isInteger(i) || i <= 0) return jsonProblem(400, "Give the induction as ?i=<number>");
  const { csv, filename } = await exportRecordsCsv(getDb(), await getSession(), i);
  return csvDownload(csv, filename);
});
