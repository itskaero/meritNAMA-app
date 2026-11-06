#!/usr/bin/env node
/**
 * Golden outputs for the simulation engine (src/lib/engine), produced by the LEGACY
 * simulator code so the TypeScript port can be proven identical.
 *
 *   git clone https://github.com/itskaero/meritnama /tmp/meritnama
 *   git -C /tmp/meritnama checkout f6862060a713982a81e750ad2ae72a604399c780
 *   node scripts/golden/legacy-engine.mjs /tmp/meritnama
 *
 * Inputs are synthetic (seeded, no real candidates). The script writes the inputs and
 * the legacy outputs to tests/fixtures/engine/; tests/engine-golden.test.ts replays
 * the inputs through the port and asserts identical results. Re-run only to extend
 * coverage, and review the diff: a changed golden file means changed behaviour.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const legacyDir = process.argv[2];
if (!legacyDir) {
  console.error("usage: node scripts/golden/legacy-engine.mjs <path to itskaero/meritnama checkout>");
  process.exit(2);
}
const outDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../tests/fixtures/engine");
fs.mkdirSync(outDir, { recursive: true });
const read = (p) => fs.readFileSync(path.join(legacyDir, p), "utf8");
const write = (name, data) => fs.writeFileSync(path.join(outDir, name), JSON.stringify(data) + "\n");

// ── Deterministic randomness ──────────────────────────────────────────────────
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const R = mulberry32(20261106);
const rint = (lo, hi) => lo + Math.floor(R() * (hi - lo + 1));
const pick = (xs) => xs[Math.floor(R() * xs.length)];
const chance = (p) => R() < p;
const shuffle = (xs) => {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(R() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
// Coarse marks so ties are common: tie-breaking is where ports usually drift.
const marks = () => (chance(0.7) ? Math.round((60 + R() * 12) * 2) / 2 : Math.round((40 + R() * 50) * 100) / 100);

// ── Shared synthetic vocabulary ───────────────────────────────────────────────
const specialtyGroups = JSON.parse(read("data/induction21_specialty_groups.json"));
const certificatePolicy = JSON.parse(read("data/induction21_certificate_policy.json"));
const PROGRAMS = { FCPS: 1, MS: 2, FCPSD: 4 };
const QUOTAS = ["Punjab", "KPK, Sindh & Balochistan", "AJK, GB & ICT", "Armed Forces", "Disable"];
const SPECS = {
  FCPS: [["Medicine", 2], ["Cardiology", 2], ["Dermatology", 2], ["General Surgery", 3], ["Anaesthesia", 1], ["Diagnostic Radiology", 4], ["Obstetrics & Gynecology", 5]],
  MS: [["General Surgery", 3], ["Ophthalmology", 6], ["ENT", 7], ["Anaesthesia", 1]],
  FCPSD: [["Operative Dentistry", 30], ["Orthodontics", 30]],
};
const HOSPITALS = ["Mayo Hospital", "Services Hospital", "Allied Hospital", "Nishtar Hospital", "Combined Military Hospital", "Lady Willingdon Hospital"];

// ── Placement input (legacy simulator candidate shape) ───────────────────────
function placementInput() {
  const seats = [];
  for (const prog of Object.keys(PROGRAMS))
    for (const q of QUOTAS)
      for (const [s] of SPECS[prog])
        for (const h of HOSPITALS) if (chance(prog === "FCPSD" ? 0.5 : 0.45)) seats.push({ typeName: prog, quotaName: q, specialityName: s, hospitalName: h, seats: rint(1, 3) });
  // A repeated line (two institutes, same hospital): the last count wins in the legacy loader.
  const dup = { ...seats[3], seats: 2 };
  seats.push(dup);

  const tieMarks = [61.5, 61.5, 70.25, 70.25, 70.25];
  const candidates = [];
  for (let i = 0; i < 180; i++) {
    const applicantId = 10000 + rint(0, 89999);
    if (candidates.some((c) => c.applicantId === applicantId)) continue;
    const c = { applicantId, nameFull: `Synthetic ${i}`, marksTotal: i < tieMarks.length ? tieMarks[i] : marks(), preference: {}, programMarks: {}, applied_in: {} };
    const progs = shuffle(Object.keys(PROGRAMS)).slice(0, rint(1, 2));
    for (const prog of progs) {
      const n = rint(2, 10);
      const prefs = [];
      for (let k = 0; k < n; k++) {
        const [s, disc] = pick(SPECS[prog]);
        const p = {
          preferenceNo: k + 1,
          quotaName: chance(0.15) ? "Armed Forces" : pick(QUOTAS.filter((q) => q !== "Armed Forces")),
          specialityName: s,
          hospitalName: chance(0.05) ? "Unlisted Hospital" : pick(HOSPITALS),
          typeName: prog,
          typeId: PROGRAMS[prog],
        };
        if (chance(0.6)) p.disciplineIds = [disc];
        if (chance(0.3)) p.programMarks = pick([0, 3, 4, 5]);
        if (chance(0.25)) p.marks = pick([0, 1, 2]);
        prefs.push(p);
      }
      c.preference[prog] = shuffle(prefs);
      if (chance(0.5)) c.programMarks[prog === "FCPSD" ? "FCPS Dentistry" : prog] = pick([0, 3, 4, 5, "", "5"]);
      if (chance(0.15)) c.applied_in[prog] = chance(0.5);
    }
    if (chance(0.45)) {
      c.certificates = [];
      for (let k = 0; k < rint(1, 2); k++) {
        const prog = pick(progs);
        const [s, disc] = pick(SPECS[prog]);
        const cert = { status: pick(["Pass", "Pass", "Fail"]), certificateMarks: pick([0, 0, 3, 4.5, 5]), computerizedMarks: pick([0, 2, 4]) };
        if (chance(0.7)) Object.assign(cert, { disciplineId: disc, typeId: PROGRAMS[prog] });
        if (chance(0.6)) cert.program = prog === "FCPSD" ? "FCPS Dentistry" : prog;
        else cert.typeName = prog;
        cert.specialty = chance(0.5) ? s : pick(["Medicine And Allied", "Surgery And Allied", "Anaesthesiology", "E.N.T."]);
        c.certificates.push(cert);
      }
    }
    candidates.push(c);
  }
  return { programs: Object.keys(PROGRAMS), seats, candidates };
}

// ── Cascade input (legacy merit-list page shapes) ────────────────────────────
function cascadeInput() {
  const specialityNames = { 2: "Medicine", 3: "General Surgery", 6: "Ophthalmology", 7: "ENT", 11: "Cardiology", 69: "Nuclear Med" };
  const specIdsByProg = { FCPS: [2, 3, 11, 69], MS: [3, 6, 7] };
  const disc = { 2: 2, 3: 3, 6: 6, 7: 7, 11: 2, 69: 2 };
  const name = (id) => (id === 69 ? "Nuclear Medicine" : specialityNames[id]);
  const quotas = ["Punjab", "KPK, Sindh & Balochistan", "Armed Forces"];
  const hosps = HOSPITALS.slice(0, 4);
  const seats = [];
  for (const prog of ["FCPS", "MS"])
    for (const q of quotas)
      for (const sid of specIdsByProg[prog])
        for (const h of hosps) if (chance(0.6)) seats.push({ typeName: prog, quotaName: q, specialityName: name(sid), hospitalName: h, seats: rint(1, 2) });
  const seatSet = new Set(seats.map((s) => `${s.typeName}|${s.specialityName}|${s.hospitalName}|${s.quotaName}`));

  const ids = [];
  while (ids.length < 160) {
    const id = 100000 + rint(0, 899999);
    if (!ids.includes(id)) ids.push(id);
  }
  const candidates = {};
  const certificates = {};
  for (const id of shuffle(ids)) {
    const prefs = [];
    let no = 1;
    for (const prog of shuffle(["FCPS", "MS"]).slice(0, rint(1, 2))) {
      for (let k = 0; k < rint(2, 10); k++) {
        const sid = pick(specIdsByProg[prog]);
        prefs.push({ typeName: prog, typeId: PROGRAMS[prog], specialityId: sid, hospitalName: pick(hosps), quotaName: chance(0.2) ? "Armed Forces" : pick(quotas.slice(0, 2)), preferenceNo: no++, disciplineIds: chance(0.8) ? [disc[sid]] : [] });
      }
    }
    candidates[String(id)] = { marksTotal: chance(0.03) ? 0 : marks(), nameFull: `Synthetic ${id}`, preferences: prefs };
    // Several certificates per candidate, some without a programme type, so "best" vs "first"
    // and strict vs lenient type matching give different answers.
    if (chance(0.5))
      certificates[String(id)] = Array.from({ length: rint(1, 3) }, () => ({
        ...(chance(0.8) ? { typeId: pick([1, 2]) } : {}),
        disciplineId: pick([2, 3, 6, 7]),
        certificateMarks: pick([0, 3, 4, 5]),
        computerizedMarks: pick([0, 2, 4]),
      }));
  }

  // Published round: greedy by marks, one seat per programme and track.
  const occ = new Map();
  const merit = [];
  const ranked = ids.slice().sort((a, b) => candidates[b].marksTotal - candidates[a].marksTotal);
  const cap = new Map(seats.map((s) => [`${s.typeName}|${s.specialityName}|${s.hospitalName}|${s.quotaName}`, s.seats]));
  for (const id of ranked) {
    const got = new Set();
    for (const p of candidates[id].preferences) {
      const track = `${p.typeName}|${p.quotaName === "Armed Forces"}`;
      if (got.has(track)) continue;
      const sk = `${p.typeName}|${name(p.specialityId)}|${p.hospitalName}|${p.quotaName}`;
      if (!seatSet.has(sk) || (occ.get(sk) ?? 0) >= cap.get(sk)) continue;
      if (chance(0.3)) continue; // leave room so later rounds have upgrades to make
      occ.set(sk, (occ.get(sk) ?? 0) + 1);
      got.add(track);
      merit.push({ applicantId: chance(0.5) ? id : String(id), typeName: p.typeName, specialityName: name(p.specialityId), hospitalName: p.hospitalName, quotaName: chance(0.1) ? `${p.quotaName} ` : p.quotaName, preferenceNo: p.preferenceNo });
    }
  }
  // An allocation at a seat the candidate never listed (legacy preference number 0).
  const stray = seats.find((s) => s.quotaName === "Punjab");
  merit.push({ applicantId: ranked[ranked.length - 1], typeName: stray.typeName, specialityName: stray.specialityName, hospitalName: stray.hospitalName, quotaName: stray.quotaName, preferenceNo: 0 });

  const consent = [];
  for (const e of merit) {
    if (chance(0.25)) continue;
    const status = pick(["Accepted", "Accepted", "Accepted", "Rejected", "Awaited"]);
    const title = `${e.typeName} - ${e.quotaName.trim()} - ${e.specialityName} - ${e.hospitalName}`;
    consent.push({ applicantId: Number(e.applicantId), status, preferenceNo: e.preferenceNo, ...(chance(0.2) ? { seatKey: `${e.typeName}|${e.specialityName}|${e.hospitalName}|${e.quotaName.trim()}` } : { infoTitle: title }) });
  }
  consent.push({ applicantId: ids[0], status: "Accepted", preferenceNo: 1, infoTitle: "malformed title" });
  const profileStatus = {};
  for (const id of ids) {
    const r = R();
    if (r < 0.85) profileStatus[id] = 1;
    else if (r < 0.9) profileStatus[id] = 2;
    else if (r < 0.95) profileStatus[id] = 11;
  }
  const extraRejected = shuffle(ids).slice(0, 4);
  return { specialityNames, seats, candidates, certificates, merit, consent, profileStatus, extraRejected };
}

// ── Load the legacy code into a sandbox ──────────────────────────────────────
/** Source of the named top-level functions in `src` (brace matching). */
function extractFunctions(src, names) {
  return names
    .map((n) => {
      const start = src.indexOf(`function ${n}(`);
      if (start < 0) throw new Error(`legacy function ${n} not found`);
      let depth = 0;
      for (let i = src.indexOf("{", start); i < src.length; i++) {
        if (src[i] === "{") depth++;
        else if (src[i] === "}" && --depth === 0) return src.slice(start, i + 1);
      }
      throw new Error(`unbalanced ${n}`);
    })
    .join("\n");
}

function sandbox() {
  const noop = () => undefined;
  const el = new Proxy(() => el, { get: (_, k) => (k === Symbol.toPrimitive ? () => "" : el), apply: () => el, set: () => true });
  const ctx = { console, setTimeout, Math, JSON, Object, Array, Number, String, Set, Map, Promise, Infinity, NaN, parseFloat };
  ctx.document = el;
  ctx.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
  ctx.window = ctx;
  ctx.MNNotifications = {
    DEFAULT_MARKS_OPTIONS: [{ id: "portal", label: "Official", base: "marksTotal", adjustments: [] }],
    normalizeMarksOption: (o) => o,
    readMarksConfigBool: (v, d) => (typeof v === "boolean" ? v : d),
  };
  vm.createContext(ctx);
  vm.runInContext(read("js/sim-core.js"), ctx, { filename: "sim-core.js" });
  vm.runInContext(extractFunctions(read("js/sim-candidates.js"), ["resolveCandidateField"]), ctx, { filename: "sim-candidates.js" });
  vm.runInContext(read("js/sim-placement.js"), ctx, { filename: "sim-placement.js" });
  vm.runInContext(extractFunctions(read("js/sim-findme.js"), ["allCandidates"]), ctx, { filename: "sim-findme.js" });
  vm.runInContext(read("js/sim-cascade.js"), ctx, { filename: "sim-cascade.js" });
  return ctx;
}

// ── Run ──────────────────────────────────────────────────────────────────────
const pin = process.env.LEGACY_COMMIT || "f6862060a713982a81e750ad2ae72a604399c780";
const pIn = placementInput();
const cIn = cascadeInput();
const ctx = sandbox();
ctx.__in = { pIn, cIn, specialtyGroups, certificatePolicy };

const placementGolden = vm.runInContext(
  `(() => {
  const { pIn, specialtyGroups, certificatePolicy } = __in;
  const nested = {};
  for (const r of pIn.seats) {
    nested[r.typeName] ??= {}; nested[r.typeName][r.quotaName] ??= {}; nested[r.typeName][r.quotaName][r.specialityName] ??= {};
    nested[r.typeName][r.quotaName][r.specialityName][r.hospitalName] = r.seats;
  }
  Object.assign(SIM, { seats: nested, flatSeats: pIn.seats, seatsLoaded: true, candidates: pIn.candidates, certificatePolicy, specialtyGroups, _specialtyGroupIndex: null });
  SIM.marks.options = MNNotif.DEFAULT_MARKS_OPTIONS.slice();
  SIM.marks.activeOptionId = 'portal';

  const marks = [];
  for (const c of pIn.candidates) for (const program of pIn.programs) {
    marks.push({ applicantId: c.applicantId, program, mark: effectiveMark(c, program) ?? null,
      prefs: (c.preference[program] || []).map(p => ({ preferenceNo: p.preferenceNo, mark: effectiveMark(c, program, undefined, undefined, p) ?? null, bonus: resolveProgramBonusDetails(c, p, program).source })) });
  }

  const runs = [];
  for (const program of pIn.programs) for (const parentBonus of [false, true]) {
    const pool = allCandidates().filter(c => effectiveMark(c, program) != null);
    const tree = buildSeatTree(program);
    const res = runPlacement(pool, tree, program, parentBonus);
    const slots = [];
    for (const [q, specs] of Object.entries(res.seatTree)) for (const [s, hosps] of Object.entries(specs)) for (const [h, sl] of Object.entries(hosps)) {
      slots.push({ q, s, h, jobs: sl.jobs,
        candidates: sl.candidates.map(x => ({ applicantId: x.applicantId, marksTotal: x.marksTotal, preferenceNo: x.preferenceNo, track: x._track })),
        others: sl.others.map(x => ({ applicantId: x.applicantId, marksTotal: x.marksTotal, preferenceNo: x.preferenceNo, track: x._track, placed: x.placed, placedAtHigherPref: x.placedAtHigherPref, placedAt: x.placedAt })) });
    }
    const candidates = res.candidates.map(w => ({ applicantId: w.applicantId, track: w._track, sortMarks: w._sortMarks, placed: w.placed, q: w._q, s: w._s, h: w._h,
      outcomes: computeCandidateHistory(w, res.seatTree).map(o => ({ preferenceNo: o.pref.preferenceNo, status: o.status, ...(o.status === 'beaten' ? { cutoff: o.cutoff, capacity: o.capacity, filled: o.filled } : {}) })) }));
    runs.push({ program, parentBonus, slots, candidates });
  }
  return JSON.parse(JSON.stringify({ marks, runs }));
})()`,
  ctx,
);

const cascadeGolden = await vm.runInContext(
  `(async () => {
  const { cIn } = __in;
  const status = (cid) => cIn.profileStatus[cid] ?? null;
  const out = [];
  const first = await SimCascade.runCascade(cIn.merit, cIn.consent, cIn.seats, cIn.candidates, cIn.certificates, cIn.specialityNames, status, null, new Set(cIn.extraRejected));
  // A chained round: the simulated placements become the published round, with fixed consent replies.
  const chainedMerit = first.placements.map(p => ({ applicantId: p.applicantId, typeName: p.typeName, specialityName: p.specialityName, hospitalName: p.hospitalName, quotaName: p.quotaName }));
  const chainedConsent = first.placements.filter(p => p.applicantId % 4 !== 3).map(p => ({ applicantId: p.applicantId, preferenceNo: p.preferenceNo,
    status: p.applicantId % 4 === 0 ? 'Rejected' : 'Accepted', seatKey: p.typeName + '|' + p.specialityName + '|' + p.hospitalName + '|' + p.quotaName }));
  const second = await SimCascade.runCascade(chainedMerit, chainedConsent, cIn.seats, cIn.candidates, cIn.certificates, cIn.specialityNames, status, null, first.consentRejected);
  for (const [label, r, merit, consent] of [['round', first, cIn.merit, null], ['chained', second, chainedMerit, chainedConsent]]) {
    out.push({ label, ...(consent ? { merit, consent } : {}),
      placements: r.placements.map(({ nameFull, ...p }) => p),
      stats: r.stats,
      consentRejected: [...r.consentRejected].map(Number).sort((a, b) => a - b),
      consentAwaited: [...r.consentAwaited].map(Number).sort((a, b) => a - b),
      comparison: SimCascade.compareWithActual(r.placements, merit) });
  }
  return JSON.parse(JSON.stringify(out));
})()`,
  ctx,
);

// Names are synthetic but unused by the engine; drop them from the committed inputs.
for (const c of pIn.candidates) delete c.nameFull;
for (const c of Object.values(cIn.candidates)) delete c.nameFull;

const meta = { legacyCommit: pin, generatedBy: "scripts/golden/legacy-engine.mjs" };
write("specialty_groups.json", specialtyGroups);
write("certificate_policy.json", certificatePolicy);
write("placement.input.json", { ...meta, ...pIn });
write("placement.golden.json", { ...meta, ...placementGolden });
write("cascade.input.json", { ...meta, ...cIn });
write("cascade.golden.json", { ...meta, runs: cascadeGolden });

const placedCounts = placementGolden.runs.map((r) => `${r.program}${r.parentBonus ? "+parent" : ""}: ${r.candidates.filter((c) => c.placed).length}/${r.candidates.length}`);
console.log("placement", placedCounts.join(", "));
console.log("cascade", cascadeGolden.map((r) => `${r.label}: ${JSON.stringify(r.stats)} agreement ${r.comparison.agreement.toFixed(1)}%`).join("\n        "));
