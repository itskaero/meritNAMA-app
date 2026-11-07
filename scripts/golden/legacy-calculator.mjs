#!/usr/bin/env node
/**
 * Golden outputs for the merit calculator (src/lib/engine/score.ts), produced by the
 * LEGACY calculator (js/app-predict-calc.js runCalculator) on a fake form.
 *
 *   node scripts/golden/legacy-calculator.mjs /path/to/meritnama-checkout
 *
 * For every policy in tests/fixtures/scoring_policy.json, random inputs (blanks and
 * out-of-range values included) are typed into a fake DOM, the legacy function runs,
 * and inputs + results go to tests/fixtures/engine/calculator.golden.json.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const legacyDir = process.argv[2];
if (!legacyDir) {
  console.error("usage: node scripts/golden/legacy-calculator.mjs <path to itskaero/meritnama checkout>");
  process.exit(2);
}
const here = path.dirname(new URL(import.meta.url).pathname);
const policies = JSON.parse(fs.readFileSync(path.join(here, "../../tests/fixtures/scoring_policy.json"), "utf8")).policies;

let seed = 20261107;
const R = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (xs) => xs[Math.floor(R() * xs.length)];
const chance = (p) => R() < p;

// The fake form: element id → element.
let dom = {};
const ctx = {
  console, Math, JSON, Object, Array, Number, String, isNaN, parseFloat, Date, Set, Map,
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  document: { getElementById: (id) => dom[id] ?? null, querySelectorAll: () => [] },
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(legacyDir, "js/app-predict-calc.js"), "utf8"), ctx, { filename: "app-predict-calc.js" });
// What the calculator reads from the rest of the legacy app.
vm.runInContext(`
  var __policy = null;
  function getActivePolicyForCalc() { return __policy; }
  function getActivePolicyMax() { return __policy.policy.total_marks; }
  function getMeritBand() { return { emoji: "", label: "", cls: "" }; }
  function esc(s) { return String(s); }
  var App = { data: { flatLookup: [] } };
`, ctx);

const input = (value) => ({ value: value == null ? "" : String(value) });
const select = (value, texts, index) => ({ value: value == null ? "" : String(value), options: texts.map((text) => ({ text })), selectedIndex: index });

const cases = [];
for (const [key, policy] of Object.entries(policies)) {
  for (let n = 0; n < 40; n++) {
    dom = {};
    const inputs = {};
    for (const c of policy.components.filter((x) => x.included !== false)) {
      const id = `calc_${c.key}`;
      const blank = chance(0.12);
      switch (c.type) {
        case "boolean": {
          const v = chance(0.5);
          dom[id] = { checked: v };
          inputs[c.key] = v;
          break;
        }
        case "percentage": case "years": case "count": case "score": case "months": {
          const hi = { percentage: 110, years: 15, count: 8, score: (c.score_max || 1100) * 1.1, months: 40 }[c.type];
          const v = blank ? null : Math.round(R() * hi * (c.type === "percentage" ? 100 : c.type === "years" ? 2 : 1)) / (c.type === "percentage" ? 100 : c.type === "years" ? 2 : 1);
          dom[id] = input(v);
          inputs[c.key] = v;
          break;
        }
        case "tiered_select": {
          const i = blank ? null : Math.floor(R() * c.tiers.length);
          dom[id] = select(i == null ? null : c.tiers[i].value, ["— Select —", ...c.tiers.map((t) => t.label)], i == null ? 0 : i + 1);
          inputs[c.key] = i;
          break;
        }
        case "fcps_jcat_combo": {
          const kind = blank ? "" : pick(["fcps", "jcat", "none"]);
          dom[`${id}_type`] = { value: kind };
          if (kind === "fcps") {
            const i = Math.floor(R() * c.fcps_tiers.length);
            const t = c.fcps_tiers[i];
            dom[`${id}_attempt`] = select(t.marks, ["— Select attempt number —", ...c.fcps_tiers.map((x) => `${x.label} — ${x.marks} mark${x.marks !== 1 ? "s" : ""}`)], i + 1);
            inputs[c.key] = { kind, tier: i };
          } else if (kind === "jcat") {
            const pct = Math.round(R() * 1000) / 10;
            dom[`${id}_jcat_pct`] = input(pct);
            inputs[c.key] = { kind, pct };
          } else if (kind === "none") inputs[c.key] = { kind };
          else inputs[c.key] = null;
          break;
        }
      }
    }
    ctx.__policyArg = { key, policy, isExpected: false };
    vm.runInContext("__policy = __policyArg; runCalculator();", ctx);
    const r = JSON.parse(vm.runInContext("JSON.stringify(_lastCalcResult)", ctx));
    cases.push({ policyKey: key, inputs, total: r.total, breakdown: r.breakdown });
  }
}
const out = path.join(here, "../../tests/fixtures/engine/calculator.golden.json");
fs.writeFileSync(out, JSON.stringify({ legacyCommit: "f6862060a713982a81e750ad2ae72a604399c780", generatedBy: "scripts/golden/legacy-calculator.mjs", cases }) + "\n");
console.log(`${cases.length} cases over ${Object.keys(policies).length} policies →`, path.relative(process.cwd(), out));
