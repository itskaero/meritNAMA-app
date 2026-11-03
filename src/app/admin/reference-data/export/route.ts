import { AuthorizationError } from "@/lib/auth/roles";
import { getSession } from "@/lib/auth/session";
import { exportSeatFile, getDocumentVersion } from "@/lib/data/reference-data";
import { getDb } from "@/lib/db/client";
import { documentKindSchema, DOCUMENT_KINDS } from "@/lib/domain/reference-data";

/**
 * Download reference data in the public site's file format:
 *   ?dataset=seats&induction=21                → induction21_seats.json
 *   ?dataset=<document kind>&version=<uuid>    → that version of the document
 * Route handlers are not covered by the admin layout guard; the data layer checks the role.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function download(data: unknown, filename: string) {
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

const problem = (status: number, error: string) => Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const dataset = q.get("dataset") ?? "";
  try {
    const db = getDb();
    const session = await getSession();

    if (dataset === "seats") {
      const induction = q.get("induction") ?? "";
      if (!/^\d{1,3}$/.test(induction)) return problem(400, "induction must be a number");
      const rows = await exportSeatFile(db, session, Number(induction));
      if (rows.length === 0) return problem(404, `no seat matrix for induction ${induction}`);
      return download(rows, `induction${induction}_seats.json`);
    }

    const kind = documentKindSchema.safeParse(dataset);
    if (!kind.success) return problem(400, "unknown dataset");
    const version = q.get("version") ?? "";
    if (!UUID.test(version)) return problem(400, "version must be a document version id");
    const doc = await getDocumentVersion(db, session, version);
    if (!doc || doc.kind !== kind.data) return problem(404, "version not found");
    const file = DOCUMENT_KINDS[kind.data].file.replace("<n>", String(doc.inductionId));
    return download(doc.data, file);
  } catch (err) {
    if (err instanceof AuthorizationError) return problem(err.reason === "unauthenticated" ? 401 : 403, err.reason);
    throw err;
  }
}
