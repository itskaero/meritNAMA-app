import { getSession } from "@/lib/auth/session";
import { openNotification } from "@/lib/data/notifications";
import { getDb } from "@/lib/db/client";
import { withAuthErrors } from "@/lib/http/json-download";

/**
 * Open one notification: mark it read (own rows only) and go where it points.
 * The redirect is relative, so it stays on whichever host the person is using.
 */
export const GET = withAuthErrors(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const id = Number((await ctx.params).id);
  const href = Number.isSafeInteger(id) && id > 0 ? await openNotification(getDb(), await getSession(), id) : null;
  return new Response(null, { status: 303, headers: { Location: href ?? "/portal/inbox", "Cache-Control": "no-store" } });
});
