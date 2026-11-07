import { AuthorizationError } from "@/lib/auth/roles";
import { UserFacingError } from "@/lib/errors";

/** Shared responses for the admin export routes. */

const noStore = { "Cache-Control": "no-store" };

/** A pretty-printed JSON file download, in the public site's format. */
export function jsonDownload(data: unknown, filename: string, { trailingNewline = false } = {}) {
  return new Response(JSON.stringify(data, null, 2) + (trailingNewline ? "\n" : ""), {
    headers: {
      ...noStore,
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename.replace(/["\\\r\n]/g, "")}"`,
    },
  });
}

/** A CSV file download (UTF-8 with a byte-order mark, so spreadsheets read names correctly). */
export function csvDownload(csv: string, filename: string) {
  return new Response("\uFEFF" + csv, {
    headers: {
      ...noStore,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename.replace(/["\\\r\n]/g, "")}"`,
    },
  });
}

export function jsonProblem(status: number, error: string, extra?: Record<string, unknown>) {
  return Response.json({ error, ...extra }, { status, headers: noStore });
}

/**
 * Route handlers are not covered by layout guards; the data layer throws
 * AuthorizationError instead. Turn that into 401/403 rather than a 500.
 */
export function withAuthErrors<A extends unknown[]>(handler: (request: Request, ...rest: A) => Promise<Response>) {
  return async (request: Request, ...rest: A) => {
    try {
      return await handler(request, ...rest);
    } catch (err) {
      if (err instanceof AuthorizationError) return jsonProblem(err.reason === "unauthenticated" ? 401 : 403, err.reason);
      if (err instanceof UserFacingError) return jsonProblem(404, err.message);
      throw err;
    }
  };
}
