/**
 * Matching CPSP's accreditation list (free-text names such as "KING EDWARD MEDICAL
 * UNIVERSITY / MAYO HOSPITAL (LAHORE)" or "DENTISTRY (ORTHODONTICS)") to the app's
 * hospitals and specialities ("Mayo Hospital, Lahore", "Orthodontics"). By name only, so
 * a match is a careful guess, not a join; pages say so. Pure.
 */

export type CpspProgram = { speciality: string; unit: string; type: string; since: string };
export type CpspHospital = { hospital: string; city: string; programs: CpspProgram[] };

const SPELLING: [RegExp, string][] = [
  [/paed/g, "ped"], [/gynae/g, "gyne"], [/anaesth/g, "anesth"], [/haemat/g, "hemat"], [/orthopaed/g, "orthoped"], [/oesoph/g, "esoph"],
  [/foetal/g, "fetal"], [/centre/g, "center"], [/maxillo[\s-]+facial/g, "maxillofacial"], [/cardio[\s-]+thoracic/g, "cardiothoracic"],
  [/\be\.?\s?n\.?\s?t\.?\b/g, "ent"], [/children-s|children's/g, "children"],
];
const HOSPITAL_STOP = new Set(["hospital", "hospitals", "the", "of", "and", "teaching", "unit", "govt", "government", "institute", "medical", "center", "college", "university", "complex", "for", "tertiary", "care"]);
const SPECIALITY_STOP = new Set(["and", "of", "the", "general"]);
/** Speciality words that say the same thing. */
const SYNONYM: Record<string, string> = { anesthesiology: "anesthesia", anesthesiologist: "anesthesia", ent: "otorhinolaryngology", neurosurgery: "neuro surgery" };

function words(s: string): string[] {
  let t = s.toLowerCase().replace(/&/g, " and ");
  for (const [re, to] of SPELLING) t = t.replace(re, to);
  return t.split(/[^a-z0-9]+/).filter((w) => w.length > 1 || /\d/.test(w));
}
const tokens = (s: string, stop: Set<string>) => new Set(words(s).filter((w) => !stop.has(w)).flatMap((w) => (SYNONYM[w] ?? w).split(" ")));

/** Equal, or one typo apart in a long word ("willingdon" ~ "willington", "rehablitation" ~ "rehabilitation"). */
function same(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 6 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}
const has = (set: Set<string>, w: string) => set.has(w) || [...set].some((x) => same(x, w));
const overlap = (a: Set<string>, b: Set<string>) => [...a].filter((w) => has(b, w)).length;

const NUMBERED = /^(?:ii|iii|iv|vi|vii|viii|ix|\d+)$/;
/** "Allied II" and "Allied" are different hospitals: numbers and Roman numerals must agree. */
const numbered = (t: Set<string>) => [...t].filter((w) => NUMBERED.test(w)).sort().join(" ");

/**
 * CPSP entries for a hospital name: every distinctive word of the name (and its city)
 * appears in one part of the entry's name ("… / MAYO HOSPITAL (LAHORE)"), sharing at
 * least one word that is not the city; among those, the closest. Several entries can
 * be one hospital (CPSP lists some institutes inside a hospital separately).
 */
export function matchHospital(name: string, list: readonly CpspHospital[]): { entries: CpspHospital[]; score: number } | null {
  const target = tokens(name, HOSPITAL_STOP);
  if (!target.size) return null;
  const marks = numbered(target);
  const scored: { entry: CpspHospital; closeness: number }[] = [];
  for (const entry of list) {
    const city = tokens(entry.city, HOSPITAL_STOP);
    const distinctive = new Set([...target].filter((w) => !has(city, w)));
    if (!distinctive.size) continue;
    let closeness = 0;
    for (const part of entry.hospital.replace(/\([^)]*\)/g, " ").split(/[/,]/)) {
      const t = new Set([...tokens(part, HOSPITAL_STOP), ...city]);
      if (numbered(t) !== marks || !overlap(distinctive, t)) continue;
      const found = overlap(target, t);
      const need = target.size <= 3 ? target.size : Math.ceil(target.size * 0.75);
      if (found < need) continue;
      closeness = Math.max(closeness, found / (target.size + t.size - found));
    }
    if (closeness) scored.push({ entry, closeness });
  }
  if (!scored.length) return null;
  const best = Math.max(...scored.map((s) => s.closeness));
  return { entries: scored.filter((s) => s.closeness >= best - 0.1).map((s) => s.entry), score: best };
}

/**
 * Whether a CPSP programme name is a speciality: the same words ("General Surgery" ~
 * "SURGERY", "Obstetrics & Gynaecology" ~ "GYNAECOLOGY & OBSTETRICS"), the same as its
 * bracketed part ("Orthodontics" ~ "DENTISTRY (ORTHODONTICS)"), or mostly the same.
 */
export function specialityMatches(speciality: string, cpspName: string): boolean {
  const a = tokens(speciality, SPECIALITY_STOP);
  if (!a.size) return false;
  const inner = /\(([^)]*)\)/.exec(cpspName)?.[1];
  const candidates = [tokens(cpspName, SPECIALITY_STOP), ...(inner ? [tokens(inner, SPECIALITY_STOP), tokens(cpspName.replace(/\([^)]*\)/, " "), SPECIALITY_STOP)] : [])];
  return candidates.some((b) => {
    if (!b.size) return false;
    const n = overlap(a, b);
    return (n === a.size && n === b.size) || n / (a.size + b.size - n) >= 0.66;
  });
}

/** Hospitals accredited for a speciality, with the matching programmes. */
export function hospitalsForSpeciality(speciality: string, list: readonly CpspHospital[]) {
  return list
    .map((h) => ({ hospital: h.hospital, city: h.city, programs: h.programs.filter((p) => specialityMatches(speciality, p.speciality)) }))
    .filter((h) => h.programs.length);
}
