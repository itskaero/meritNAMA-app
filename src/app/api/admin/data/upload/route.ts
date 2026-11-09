import { getSession } from "@/lib/auth/session";
import { DATA_FILE_MAX_BYTES, writeDataFile } from "@/lib/data/datastore";
import { jsonProblem, withAuthErrors } from "@/lib/http/json-download";

export const dynamic = "force-dynamic";

/**
 * Put one file into the data folder. The Data page sends each dropped file in its own
 * request ({ file, path }), keeping the path it had in a dropped folder. The data layer
 * checks the role and the name; this only guards the request itself.
 */
export const POST = withAuthErrors(async (req: Request) => {
  // Same-origin only: a form on another site must not be able to write here even if a cookie is sent.
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host")) return jsonProblem(403, "forbidden");
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > DATA_FILE_MAX_BYTES + 1024 * 1024) return jsonProblem(413, "The file is larger than 200 MB.");

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const rel = form?.get("path");
  if (!(file instanceof File) || typeof rel !== "string") return jsonProblem(400, "Send a file and its path.");
  const saved = await writeDataFile(await getSession(), rel, new Uint8Array(await file.arrayBuffer()));
  return Response.json({ path: saved }, { headers: { "Cache-Control": "no-store" } });
});
