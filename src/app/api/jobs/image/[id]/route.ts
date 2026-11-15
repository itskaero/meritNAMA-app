import { getSession } from "@/lib/auth/session";
import { jobAdvertImage } from "@/lib/data/jobs";
import { getDb } from "@/lib/db/client";
import { jsonProblem, withAuthErrors } from "@/lib/http/json-download";

export const dynamic = "force-dynamic";

/** An advert's scan for the Jobs page (?n=0 is the first page of the advert). Signed-in members only. */
export const GET = withAuthErrors(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const n = Number(new URL(req.url).searchParams.get("n") ?? "0");
  const img = await jobAdvertImage(getDb(), await getSession(), id, n);
  if (!img) return jsonProblem(404, "No picture for this advert.");
  return new Response(new Uint8Array(img.body), {
    headers: { "Content-Type": img.type, "Cache-Control": "private, max-age=604800, immutable", "X-Content-Type-Options": "nosniff" },
  });
});
