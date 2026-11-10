import { getSession } from "@/lib/auth/session";
import { exportMyData } from "@/lib/data/account";
import { getDb } from "@/lib/db/client";
import { jsonDownload, withAuthErrors } from "@/lib/http/json-download";

export const dynamic = "force-dynamic";

/** Everything stored about the signed-in person, as one JSON file. Only ever their own. */
export const GET = withAuthErrors(async () => {
  const data = await exportMyData(getDb(), await getSession());
  return jsonDownload(data, `meritnama-my-data-${new Date().toISOString().slice(0, 10)}.json`);
});
