import { AuthorizationError } from "@/lib/auth/roles";
import { getSession } from "@/lib/auth/session";
import { exportScoringPolicyFile } from "@/lib/data/policies";
import { getDb } from "@/lib/db/client";

/**
 * Download scoring_policy.json rebuilt from the database, in the public site's format.
 * Route handlers are not covered by the admin layout guard; the data layer checks the role.
 */
export async function GET() {
  try {
    const result = await exportScoringPolicyFile(getDb(), await getSession());
    if (!result.ok) return Response.json({ error: result.reason, issues: result.issues }, { status: 409, headers: { "Cache-Control": "no-store" } });
    return new Response(`${JSON.stringify(result.file, null, 2)}\n`, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": 'attachment; filename="scoring_policy.json"',
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return Response.json({ error: err.reason }, { status: err.reason === "unauthenticated" ? 401 : 403 });
    }
    throw err;
  }
}
