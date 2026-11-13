import { saveReferenceDocument } from "@/lib/data/reference-data";
import { DOCUMENT_KINDS, type DocumentKind } from "@/lib/domain/reference-data";
import { PARSED_MAX_BYTES, plainIssues, type FileKind } from "../kind";

/** Reference documents: disciplines, CPSP accreditation, an induction's specialty groups. Saved as a new version. */
export const referenceKind: FileKind = {
  kind: "reference",
  label: "Reference document",
  order: 1,
  official: true,
  fromPath(p) {
    if (/^disciplinefulldata\.json$/i.test(p.name)) return { kind: "reference", induction: null, round: null, refKind: "disciplines" };
    if (/^cpsp_accreditation\.json$/i.test(p.name)) return { kind: "reference", induction: null, round: null, refKind: "cpsp_accreditation" };
    const groups = /^induction(\d{1,3})_specialty_groups\.json$/i.exec(p.name);
    if (groups) return { kind: "reference", induction: Number(groups[1]), round: null, refKind: "specialty_groups" };
    return null;
  },
  fromContents: {
    rank: 4,
    match(d) {
      for (const [k, def] of Object.entries(DOCUMENT_KINDS) as [DocumentKind, (typeof DOCUMENT_KINDS)[DocumentKind]][]) {
        if (def.schema.safeParse(d).success) return { kind: "reference", induction: null, round: null, refKind: k };
      }
      return null;
    },
  },
  maxBytes: PARSED_MAX_BYTES,
  async check({ cls, json }) {
    const def = DOCUMENT_KINDS[cls.refKind!];
    const r = def.schema.safeParse(await json());
    if (!r.success) return { status: "problem", summary: null, message: plainIssues(r).join("; ") };
    return { status: "new", summary: `${def.label}${cls.induction ? `, induction ${cls.induction}` : ""} · saved as a new version`, message: null };
  },
  async apply({ db, session, cls, json, reason }) {
    const saved = await saveReferenceDocument(db, session, { kind: cls.refKind!, induction: cls.induction, data: await json(), reason });
    return { result: { applied: true, message: `${DOCUMENT_KINDS[cls.refKind!].label} saved as version ${saved.version}.` }, status: "live" };
  },
};
