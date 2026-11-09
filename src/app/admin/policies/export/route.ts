import { getSession } from "@/lib/auth/session";
import { exportScoringPolicyFile } from "@/lib/data/policies";
import { getDb } from "@/lib/db/client";
import { jsonDownload, jsonProblem, withAuthErrors } from "@/lib/http/json-download";

/**
 * Download scoring_policy.json rebuilt from the database, in the public site's format.
 * Route handlers are not covered by the admin layout guard; the data layer checks the role.
 */
export const GET = withAuthErrors(async () => {
  const result = await exportScoringPolicyFile(getDb(), await getSession());
  if (!result.ok) return jsonProblem(409, result.reason, { issues: result.issues });
  return jsonDownload(result.file, "scoring_policy.json", { trailingNewline: true });
});
