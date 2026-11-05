// Backfill candidate_identities from merit-round files that were imported before
// the index existed (or after CANDIDATE_INDEX_SECRET changed).
//
//   DATABASE_URL=… CANDIDATE_INDEX_SECRET=… npm run index:candidates -- <folder or files…>
//
// Folders are searched recursively for round files (round_<n>.json, i20_round_6.json,
// and the inbox/processed names). Only HMACs are written; nothing raw is stored.
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import { DEV_SECRET, identitiesFromRound } from "./lib/identity-index.mjs";

const url = process.env.DATABASE_URL;
const secret = process.env.CANDIDATE_INDEX_SECRET || (process.env.NODE_ENV === "production" ? "" : DEV_SECRET);
if (!url || !secret) {
  console.error("Set DATABASE_URL and CANDIDATE_INDEX_SECRET.");
  process.exit(1);
}
const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error("Give one or more folders or round files.");
  process.exit(1);
}

const ROUND = /round[_-]?\d{1,2}\.json$/i;
async function* files(p) {
  const s = await stat(p);
  if (s.isFile()) yield p;
  else if (s.isDirectory()) for (const e of await readdir(p)) yield* files(path.join(p, e));
}

const sql = postgres(url, { max: 1, onnotice: () => {} });
let filesSeen = 0, indexed = 0;
try {
  for (const t of targets) {
    for await (const f of files(t)) {
      if (!ROUND.test(f)) continue;
      let rows;
      try {
        rows = identitiesFromRound(JSON.parse(await readFile(f, "utf8")), secret);
      } catch {
        rows = null;
      }
      if (!rows) {
        console.warn(`skipped (not a round file): ${f}`);
        continue;
      }
      filesSeen++;
      for (let i = 0; i < rows.length; i += 1000) {
        const chunk = rows.slice(i, i + 1000).map((r) => ({ applicant_id: r.applicantId, email_hmac: r.emailHmac, pmdc_hmac: r.pmdcHmac, last_induction: r.lastInduction }));
        await sql`
          insert into candidate_identities ${sql(chunk, "applicant_id", "email_hmac", "pmdc_hmac", "last_induction")}
          on conflict (applicant_id) do update set
            email_hmac = case when excluded.last_induction >= candidate_identities.last_induction then coalesce(excluded.email_hmac, candidate_identities.email_hmac) else coalesce(candidate_identities.email_hmac, excluded.email_hmac) end,
            pmdc_hmac = case when excluded.last_induction >= candidate_identities.last_induction then coalesce(excluded.pmdc_hmac, candidate_identities.pmdc_hmac) else coalesce(candidate_identities.pmdc_hmac, excluded.pmdc_hmac) end,
            last_induction = greatest(candidate_identities.last_induction, excluded.last_induction),
            updated_at = now()`;
      }
      indexed += rows.length;
      console.log(`${path.basename(f)}: ${rows.length} applicants`);
    }
  }
  console.log(`Done: ${filesSeen} files, ${indexed} applicant rows indexed.`);
} catch (err) {
  console.error("Indexing failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
