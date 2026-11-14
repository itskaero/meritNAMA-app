// One-off backfill: fill merit_allocations.name and .pmdc_no for rounds imported before
// names were kept (migration 0024). Reads the original PHF round files and updates rows by
// (round, rowNo). It only writes those two columns, sends no notifications and can be run
// again safely.
//
// Usage (inside the migrate container on the NAS, where DATABASE_URL is set):
//   node scripts/backfill-merit-names.mjs /app/storage [--dry-run]
// The folder is searched recursively for merit round files (round_<n>.json, i<ind>_round_<n>.json,
// *-imported-merit-*.json). Email, phone, CNIC and relation fields in the files are ignored.
import { readdir, readFile } from "node:fs/promises";
import { join, basename } from "node:path";
import postgres from "postgres";

const root = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
if (!root) {
  console.error("Usage: node scripts/backfill-merit-names.mjs <storage folder> [--dry-run]");
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const cleanName = (v) => {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  return s ? s.slice(0, 120) : null;
};
const cleanPmdc = (v) => {
  const s = String(v ?? "").replace(/\s+/g, "").toUpperCase();
  return s ? s.slice(0, 20) : null;
};
const roundNoOf = (file) => {
  const m = /round[_ -]?(\d{1,2})\b/i.exec(file);
  return m ? Number(m[1]) : null;
};

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.isFile() && /\.json$/i.test(e.name) && /round[_ -]?\d/i.test(e.name)) yield p;
  }
}

const sql = postgres(url, { max: 1, connect_timeout: 10, onnotice: () => {} });
let files = 0, updated = 0, skipped = 0;
const seen = new Set();
try {
  // Newest first: processed copies are prefixed with an ISO timestamp, so a reverse sort puts
  // the latest import of a round before older ones, and `seen` skips the older copies.
  const paths = [];
  for await (const p of walk(root)) paths.push(p);
  paths.sort((a, b) => basename(b).localeCompare(basename(a)));
  for (const path of paths) {
    let data;
    try {
      data = JSON.parse(await readFile(path, "utf8"));
    } catch {
      skipped++;
      continue;
    }
    const induction = data?.Table?.[0]?.inductionId;
    const rows = data?.Table5;
    const roundNo = roundNoOf(basename(path));
    if (!Number.isInteger(induction) || !Array.isArray(rows) || !roundNo) {
      skipped++;
      continue;
    }
    const key = `${induction}:${roundNo}`;
    if (seen.has(key)) continue; // a newer copy of the same round was already applied
    const [round] = await sql`select id from merit_rounds where induction_id = ${induction} and round_no = ${roundNo}`;
    if (!round) {
      skipped++;
      continue;
    }
    seen.add(key);
    files++;
    const values = rows
      .filter((r) => Number.isInteger(r.rowNo))
      .map((r) => ({ row_no: r.rowNo, name: cleanName(r.name), pmdc_no: cleanPmdc(r.pmdcNo) }))
      .filter((r) => r.name || r.pmdc_no);
    if (dryRun) {
      console.log(`would update induction ${induction} round ${roundNo}: ${values.length} rows (${basename(path)})`);
      continue;
    }
    for (let i = 0; i < values.length; i += 1000) {
      const chunk = values.slice(i, i + 1000);
      const res = await sql`
        update merit_allocations m
        set name = v.name, pmdc_no = v.pmdc_no
        from (select * from json_to_recordset(${JSON.stringify(chunk)}::text::json) as x(row_no int, name text, pmdc_no text)) v
        where m.round_id = ${round.id} and m.row_no = v.row_no`;
      updated += res.count;
    }
    console.log(`induction ${induction} round ${roundNo}: ${values.length} rows`);
  }
  console.log(`${dryRun ? "Dry run. " : ""}Rounds: ${files}, rows updated: ${updated}, files skipped: ${skipped}.`);
} catch (err) {
  console.error("Backfill failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
