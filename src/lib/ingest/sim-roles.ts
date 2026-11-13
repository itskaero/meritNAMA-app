import type { Classified } from "./kind";

/**
 * Estimate inputs: the files the estimate importer reads from storage/simulation/induction<n>/.
 * Pure, and kept apart from the kinds so data modules can import it without a cycle.
 */

export const SIM_ROLE_PATTERNS = {
  marks: /^(?:induction\d{1,3}_)?(?:candidate_?)?marks\.json$/i,
  preferences: /^(?:induction\d{1,3}_)?preferences\.json$/i,
  candidates: /^(?:induction\d{1,3}_)?candidates\.json$/i,
  gazette: /^(?:induction\d{1,3}_)?gazette(?:_\d{1,3})?\.json$/i,
  components: /^(?:induction\d{1,3}_)?components\.json$/i,
  certificates: /^(?:induction\d{1,3}_)?certificates\.json$/i,
  profileStatus: /^(?:(?:induction\d{1,3}_)?profile_?status|ProfileStatus)\.json$/i,
} as const;
export type SimRole = keyof typeof SIM_ROLE_PATTERNS;

/** Where an estimate input or consent file is placed for the simulation importer (storage/simulation/…). */
export function simulationTarget(c: Classified, basename: string): string | null {
  if (c.induction == null) return null;
  if (c.kind === "consent" && c.round != null) return `induction${c.induction}/consent_round${c.round}.json`;
  if (c.kind === "sim_input" && c.role) {
    // Keep the name the importer expects; a gazette keeps its own name.
    const clean = c.role === "gazette" ? `gazette_${c.induction}.json` : basename.replace(/^induction\d{1,3}_/i, "");
    return `induction${c.induction}/${clean}`;
  }
  return null;
}
