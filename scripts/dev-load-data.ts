/**
 * Development only: load a data folder into the local database through the app's own import
 * (the same code as Admin → Data → Publish all), then run the queued estimates.
 *   APP_STORAGE_DIR=<dir with data/> DATABASE_URL=… npx tsx --conditions=react-server scripts/dev-load-data.ts
 */
import type { Session } from "../src/lib/auth/roles";
import { applyAllDataFiles, scanDataFolder } from "../src/lib/data/datastore";
import { processQueuedRuns } from "../src/lib/data/simulation";
import { getDb } from "../src/lib/db/client";

const session: Session = { userId: "00000000-0000-0000-0000-000000000001", email: "dev@localhost", role: "owner", isStub: true };

async function main() {
  const db = getDb();
  // Two passes, like two worker minutes: files waiting on others (revisions on the dataset) go through on the second.
  for (const pass of [1, 2]) {
    const scan = await scanDataFolder(db, session);
    const applied = await applyAllDataFiles(db, session);
    console.log(`pass ${pass}: scan`, JSON.stringify(scan), "applied", applied.applied.length, "failed", JSON.stringify(applied.failed ?? []).slice(0, 600), "triggers", JSON.stringify(applied.triggers ?? []));
  }
  const runs = await processQueuedRuns(db, { olderThanSeconds: 0, limit: 5 });
  console.log("estimate runs started", runs);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
