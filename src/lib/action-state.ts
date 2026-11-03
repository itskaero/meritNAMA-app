import { z } from "zod";
import { AuthorizationError } from "@/lib/auth/roles";
import { UserFacingError } from "@/lib/errors";

/** Result of a form Server Action, rendered by <ActionResult>. */
export type ActionState = { status: "idle" | "error" | "success"; message?: string; issues?: string[] };

export const idleState: ActionState = { status: "idle" };

/** Postgres error code, also when wrapped by drizzle (DrizzleQueryError.cause). */
function pgCode(err: unknown): string | undefined {
  for (let e = err as { code?: unknown; cause?: unknown } | undefined, i = 0; e && i < 3; e = e.cause as typeof e, i++) {
    if (typeof e.code === "string" && /^[0-9A-Z]{5}$/.test(e.code)) return e.code;
  }
  return undefined;
}

/** Map an error from the data layer to something an admin can act on. Never leaks internals. */
export function toActionState(err: unknown): ActionState {
  if (err instanceof z.ZodError) {
    return {
      status: "error",
      message: "The data did not pass validation. Nothing was saved.",
      issues: err.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    };
  }
  if (err instanceof AuthorizationError) return { status: "error", message: "You are not allowed to make this change." };
  if (err instanceof SyntaxError) return { status: "error", message: `Not valid JSON: ${err.message}` };
  if (err instanceof UserFacingError) return { status: "error", message: err.message };
  const code = pgCode(err);
  if (code === "23503") return { status: "error", message: "That refers to an id that does not exist yet. Add it under Lookups first." };
  if (code === "23505") return { status: "error", message: "That record already exists." };
  console.error(err);
  return { status: "error", message: "Saving failed. Check that the database is reachable and try again." };
}

/** Read an uploaded JSON file from a form field, with a size cap. */
export async function readJsonUpload(form: FormData, fieldName: string, maxBytes: number): Promise<unknown> {
  const upload = form.get(fieldName);
  if (!(upload instanceof File) || upload.size === 0) throw new UserFacingError("Choose a JSON file to import.");
  if (upload.size > maxBytes) throw new UserFacingError(`The file is larger than ${Math.round(maxBytes / 1024)} KB.`);
  return JSON.parse(await upload.text());
}
