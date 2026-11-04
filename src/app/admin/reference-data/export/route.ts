import { getSession } from "@/lib/auth/session";
import { exportSeatFile, getDocumentVersion } from "@/lib/data/reference-data";
import { getDb } from "@/lib/db/client";
import { documentKindSchema, DOCUMENT_KINDS } from "@/lib/domain/reference-data";
import { isUuid } from "@/lib/format";
import { jsonDownload, jsonProblem, withAuthErrors } from "@/lib/http/json-download";

/**
 * Download reference data in the public site's file format:
 *   ?dataset=seats&induction=21                → induction21_seats.json
 *   ?dataset=<document kind>&version=<uuid>    → that version of the document
 * Route handlers are not covered by the admin layout guard; the data layer checks the role.
 */
export const GET = withAuthErrors(async (request) => {
  const q = new URL(request.url).searchParams;
  const dataset = q.get("dataset") ?? "";
  const db = getDb();
  const session = await getSession();

  if (dataset === "seats") {
    const induction = q.get("induction") ?? "";
    if (!/^\d{1,3}$/.test(induction)) return jsonProblem(400, "induction must be a number");
    const rows = await exportSeatFile(db, session, Number(induction));
    if (rows.length === 0) return jsonProblem(404, `no seat matrix for induction ${induction}`);
    return jsonDownload(rows, `induction${induction}_seats.json`);
  }

  const kind = documentKindSchema.safeParse(dataset);
  if (!kind.success) return jsonProblem(400, "unknown dataset");
  const version = q.get("version");
  if (!isUuid(version)) return jsonProblem(400, "version must be a document version id");
  const doc = await getDocumentVersion(db, session, version);
  if (!doc || doc.kind !== kind.data) return jsonProblem(404, "version not found");
  return jsonDownload(doc.data, DOCUMENT_KINDS[kind.data].file.replace("<n>", String(doc.inductionId)));
});
