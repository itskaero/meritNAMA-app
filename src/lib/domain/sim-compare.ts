/**
 * Compare a simulated round with the round PHF published, by seat group
 * (programme · quota · speciality · hospital). Applicant ids are used to match
 * allocations but never appear in the result.
 */

export type Allocation = { applicantId: string; program: string; quota: string; speciality: string; hospital: string; mark: number };

export type GroupComparison = {
  group: string;
  program: string;
  published: number;
  simulated: number;
  /** Allocations present in both (same applicant, same group). */
  same: number;
  publishedClosing: number | null;
  simulatedClosing: number | null;
};

export type RoundComparison = {
  published: number;
  simulated: number;
  same: number;
  /** Share of published allocations the simulation reproduced exactly, 0–100. */
  agreement: number;
  byProgram: { program: string; published: number; simulated: number; same: number; agreement: number }[];
  groupsTotal: number;
  groupsExact: number;
  /** Groups that differ, largest difference first (at most 50). */
  differing: GroupComparison[];
};

const norm = (s: string) => s.trim().replace(/\s+/g, " ");
export const groupKey = (a: Pick<Allocation, "program" | "quota" | "speciality" | "hospital">) =>
  `${norm(a.program)} · ${norm(a.quota)} · ${norm(a.speciality)} · ${norm(a.hospital)}`;
const pct = (n: number, d: number) => (d ? Math.round((1000 * n) / d) / 10 : 0);

export function compareRounds(published: readonly Allocation[], simulated: readonly Allocation[]): RoundComparison {
  const groups = new Map<string, GroupComparison & { pub: Set<string>; sim: Set<string> }>();
  const get = (a: Allocation) => {
    const k = groupKey(a);
    let g = groups.get(k);
    if (!g) {
      g = { group: k, program: norm(a.program), published: 0, simulated: 0, same: 0, publishedClosing: null, simulatedClosing: null, pub: new Set(), sim: new Set() };
      groups.set(k, g);
    }
    return g;
  };
  for (const a of published) {
    const g = get(a);
    g.published++;
    g.pub.add(a.applicantId);
    g.publishedClosing = g.publishedClosing == null ? a.mark : Math.min(g.publishedClosing, a.mark);
  }
  for (const a of simulated) {
    const g = get(a);
    g.simulated++;
    g.sim.add(a.applicantId);
    g.simulatedClosing = g.simulatedClosing == null ? a.mark : Math.min(g.simulatedClosing, a.mark);
  }
  const byProgram = new Map<string, { published: number; simulated: number; same: number }>();
  let same = 0;
  let exact = 0;
  const differing: GroupComparison[] = [];
  for (const g of groups.values()) {
    g.same = [...g.pub].filter((id) => g.sim.has(id)).length;
    same += g.same;
    const p = byProgram.get(g.program) ?? { published: 0, simulated: 0, same: 0 };
    p.published += g.published;
    p.simulated += g.simulated;
    p.same += g.same;
    byProgram.set(g.program, p);
    if (g.same === g.published && g.same === g.simulated) exact++;
    else {
      differing.push({ group: g.group, program: g.program, published: g.published, simulated: g.simulated, same: g.same, publishedClosing: g.publishedClosing, simulatedClosing: g.simulatedClosing });
    }
  }
  const size = (g: GroupComparison) => g.published + g.simulated - 2 * g.same;
  differing.sort((a, b) => size(b) - size(a) || a.group.localeCompare(b.group));
  return {
    published: published.length,
    simulated: simulated.length,
    same,
    agreement: pct(same, published.length),
    byProgram: [...byProgram].map(([program, v]) => ({ program, ...v, agreement: pct(v.same, v.published) })).sort((a, b) => b.published - a.published),
    groupsTotal: groups.size,
    groupsExact: exact,
    differing: differing.slice(0, 50),
  };
}
