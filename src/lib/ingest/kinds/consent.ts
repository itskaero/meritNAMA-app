import { roundNoFromFilename } from "@/lib/domain/merit-round";
import { consentFileSchema, consentRoundFromName } from "@/lib/domain/sim-dataset";
import { DATA_FILE_MAX_BYTES, PARSED_MAX_BYTES, type FileKind } from "../kind";

/** Consent replies of one round (consent_round<r>.json, or round_<r>.json inside consent/). Kept for estimates. */
export const consentKind: FileKind = {
  kind: "consent",
  label: "Consent replies",
  order: 4,
  official: true,
  stage: () => "rounds",
  fromPath(p) {
    const r = consentRoundFromName(p.name);
    if (r != null) return { kind: "consent", induction: p.induction, round: r };
    if (p.dirs.includes("consent") || /consent/.test(p.lower)) {
      const n = roundNoFromFilename(p.name);
      return n ? { kind: "consent", induction: p.induction, round: n } : "stop";
    }
    return null;
  },
  // Tried last: its schema is loose.
  fromContents: {
    rank: 9,
    match: (d) => (d && typeof d === "object" && !Array.isArray(d) && "Table5" in d && consentFileSchema.safeParse(d).success ? { kind: "consent", induction: null, round: null } : null),
  },
  missing: (c) => (c.induction == null || c.round == null ? "Consent files need the induction and round in the name, e.g. induction21_consent_round3.json." : null),
  maxBytes: DATA_FILE_MAX_BYTES,
  async check({ cls, size, json }) {
    if (size <= PARSED_MAX_BYTES) await json(); // catches broken JSON early; the estimate importer validates the shape
    return { status: "new", summary: `Consent replies for round ${cls.round} · used for estimates`, message: null };
  },
  async apply({ keepForEstimates }) {
    return { result: { applied: true, message: `Kept for estimates (${await keepForEstimates()}).` }, status: "held" };
  },
};
