import { getSession } from "@/lib/auth/session";
import { readEvidence } from "@/lib/data/candidates";
import { getDb } from "@/lib/db/client";
import { withAuthErrors } from "@/lib/http/json-download";

/**
 * A request's proof document, for verifiers. Route handlers are not covered by the
 * admin layout guard; readEvidence checks the capability.
 */
export const GET = withAuthErrors(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const doc = await readEvidence(getDb(), await getSession(), id);
  return new Response(new Uint8Array(doc.bytes), {
    headers: {
      "content-type": doc.type,
      "content-disposition": "inline",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
});
