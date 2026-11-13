import { DATA_FILE_MAX_BYTES, PARSED_MAX_BYTES, type FileKind, type Stage } from "../kind";
import { SIM_ROLE_PATTERNS, type SimRole } from "../sim-roles";

const STAGE: Record<SimRole, Stage> = {
  candidates: "unofficial",
  marks: "unofficial",
  preferences: "unofficial",
  components: "unofficial",
  certificates: "unofficial",
  profileStatus: "verification",
  gazette: "gazette",
};
const ROLE_LABEL: Record<SimRole, string> = {
  candidates: "candidates", marks: "marks", preferences: "preferences", components: "components",
  certificates: "certificates", profileStatus: "profile status", gazette: "gazette",
};

/**
 * Estimate inputs: the unofficial candidate list (candidates, or marks + preferences),
 * components, certificates, profile status (verification and amendment steps) and PHF's
 * gazette. Kept in storage/simulation/induction<n>/ until the estimate dataset is built.
 */
export const simInputKind: FileKind = {
  kind: "sim_input",
  label: "Estimate input",
  order: 5,
  official: false,
  stage: (c) => (c.role ? STAGE[c.role] : null),
  fromPath(p) {
    for (const role of Object.keys(SIM_ROLE_PATTERNS) as SimRole[]) {
      if (SIM_ROLE_PATTERNS[role].test(p.name)) return { kind: "sim_input", induction: p.induction, round: null, role };
    }
    if (p.dirs.includes("gazette")) return { kind: "sim_input", induction: p.induction, round: null, role: "gazette" };
    return null;
  },
  missing: (c) => (c.induction == null ? "The induction is not in the name or folder: use inductions/<n>/ or induction<n>_ in the name." : null),
  maxBytes: DATA_FILE_MAX_BYTES,
  async check({ cls, size, json }) {
    if (size <= PARSED_MAX_BYTES) await json();
    const bits = ["Estimate input"];
    if (cls.induction != null) bits.push(`induction ${cls.induction}`);
    if (cls.role) bits.push(ROLE_LABEL[cls.role]);
    return { status: "new", summary: `${bits.join(" · ")} · used for estimates`, message: null };
  },
  async apply({ keepForEstimates }) {
    return { result: { applied: true, message: `Kept for estimates (${await keepForEstimates()}).` }, status: "held" };
  },
};
