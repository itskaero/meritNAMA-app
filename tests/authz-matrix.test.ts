/**
 * Authorization matrix: who may call every data function that takes a session, and
 * which pages require which permission. Each function is called with a database and
 * input that throw on first use, so nothing is read or written; "allowed" means the
 * call got past its permission check.
 *
 * tests/fixtures/authz-matrix.json is the reviewed expectation. A change in who may
 * call what fails here until that file is updated deliberately:
 *   UPDATE_AUTHZ_MATRIX=1 npx vitest run tests/authz-matrix.test.ts
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { adminSections } from "@/lib/navigation";
import { CALLERS, outcome, takesSession } from "./support/authz";

// Parallel queries that fail after the first one would otherwise surface as unhandled.
process.on("unhandledRejection", () => {});

const mods = import.meta.glob("/src/lib/data/*.ts", { eager: true }) as Record<string, Record<string, unknown>>;
const name = (file: string, fn: string) => `${path.basename(file, ".ts")}#${fn}`;

/** Take a session but are not permission checks themselves (reviewed). */
const EXEMPT: Record<string, string> = {
  "candidates#mayPost": "answers whether the caller may post: false when signed out",
  "users#ensureUser": "internal helper; callers check permissions and pass a signed-in session",
};

/**
 * Exported data functions without a session parameter: internal helpers called after a
 * check, or for public figures (reviewed). A new one fails the test until listed here.
 */
const NO_SESSION = new Set([
  "allocation-rules#parseInduction", "allocation-rules#rulesBaseline", "allocation-rules#scoringPolicyForInduction", "allocation-rules#resolveFor", "allocation-rules#loadInductionRules",
  "candidates#indexCandidates", "candidates#verifiedApplicant", "candidates#verifiedUserIds", "candidates#autoLink", "candidates#sniffEvidence", "candidates#pendingLinkCount",
  "community#describeTopics", "community#voteCount",
  "datastore#autoImportDataFolder", "datastore#dataRoot", "datastore#loadDataSettings", "datastore#recordSync", "datastore#plainIssues",
  "sync#syncIfDue",
  "access#loadAccessSettings", "access#mayEnter", "access#assertMayEnter", "access#submitAccessRequest",
  "finder#computeOptions",
  "merit#inductionMaxMarks",
  "notifications#parseFollowTarget", "notifications#autoFollow", "notifications#notifyFollowers", "notifications#notifyUser", "notifications#notifyShortlists", "rooms#postRoundDay", "social#peerKey", "social#reputationSql",
  "predictions#inductionRunning",
  "public#landingFigures", "public#landingTracks", "public#landingCheck", "sources#lastMeritImport", "simulation#processQueuedRuns", "simulation#runRoundNo",
  "settings#loadFeatures", "settings#loadRetention", "settings#retentionIfDue",
  "shared#requireReason", "shared#writeAudit",
  "simulation#importProblem", "simulation#runList", "simulation#toListAllocations", "simulation#officialReplies", "simulation#publishedRound", "simulation#executeRun", "simulation#failInterruptedRuns",
  "snippets#assertSnippetExists", "snippets#snippetFigures", "snippets#snippetChoices",
  "what-if#baseKey", "what-if#parseBase",
]);

const expectedFile = path.join(__dirname, "fixtures", "authz-matrix.json");

describe("authorization matrix (data functions)", () => {
  it("every data function either checks the caller or is a reviewed helper", async () => {
    const matrix: Record<string, string> = {};
    const helpers: string[] = [];
    for (const [file, mod] of Object.entries(mods)) {
      for (const [fn, value] of Object.entries(mod)) {
        if (typeof value !== "function") continue;
        const key = name(file, fn);
        if (!takesSession(value as never)) {
          helpers.push(key);
          continue;
        }
        if (EXEMPT[key]) continue;
        const cells: string[] = [];
        for (const c of CALLERS) cells.push((await outcome(value as never, c)) === "allowed" ? c : "");
        matrix[key] = cells.filter(Boolean).join(" ") || "nobody";
      }
    }
    expect(helpers.sort()).toEqual([...NO_SESSION].sort());
    // Signed-out callers never get through.
    expect(Object.entries(matrix).filter(([, who]) => who.includes("signed-out"))).toEqual([]);
    if (process.env.UPDATE_AUTHZ_MATRIX) writeFileSync(expectedFile, JSON.stringify(matrix, null, 1) + "\n");
    expect(matrix).toEqual(JSON.parse(readFileSync(expectedFile, "utf8")));
  });
});

describe("page guards", () => {
  const root = path.join(__dirname, "..", "src", "app");
  const pages = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = path.join(dir, f);
      return statSync(p).isDirectory() ? pages(p) : f === "page.tsx" ? [p] : [];
    });
  const routeOf = (file: string) => "/" + path.relative(root, path.dirname(file)).split(path.sep).filter((s) => !s.startsWith("(")).join("/");

  it("the portal and admin layouts require sign-in and staff", () => {
    expect(readFileSync(path.join(root, "portal", "layout.tsx"), "utf8")).toMatch(/requireCan\("portal"\)/);
    expect(readFileSync(path.join(root, "admin", "layout.tsx"), "utf8")).toMatch(/requireCan\("staff"\)|requireSection\(/);
  });

  it("every admin page requires its own section's permission", () => {
    const missing: string[] = [];
    for (const file of pages(path.join(root, "admin"))) {
      const route = routeOf(file);
      const section = adminSections.filter((s) => route === s.href || route.startsWith(`${s.href}/`)).sort((a, b) => b.href.length - a.href.length)[0];
      const src = readFileSync(file, "utf8");
      const m = /requireSection\("([^"]+)"\)/.exec(src);
      // The page must name a path in its own section (so it gets that section's capability).
      if (!section || !m || !(m[1] === section.href || m[1]!.startsWith(`${section.href}/`))) missing.push(`${route} → ${m?.[1] ?? "no requireSection"}`);
    }
    expect(missing).toEqual([]);
  });
});
