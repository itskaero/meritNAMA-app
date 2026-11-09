import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { cache } from "react";
import { assertCan, type Session } from "@/lib/auth/roles";
import type { Database } from "@/lib/db/client";
import { referenceDocuments } from "@/lib/db/schema";
import { hospitalsForSpeciality, matchHospital, specialityMatches, type CpspHospital } from "@/lib/domain/accreditation";

/** The newest CPSP accreditation document, parsed once per request. */
const cpspList = cache(async (db: Database): Promise<{ list: CpspHospital[]; version: number; importedAt: Date } | null> => {
  const [row] = await db.select({ data: referenceDocuments.data, version: referenceDocuments.version, createdAt: referenceDocuments.createdAt })
    .from(referenceDocuments)
    .where(and(eq(referenceDocuments.kind, "cpsp_accreditation"), eq(referenceDocuments.inductionId, 0)))
    .orderBy(desc(referenceDocuments.version)).limit(1);
  return row ? { list: row.data as CpspHospital[], version: row.version, importedAt: row.createdAt } : null;
});

/** A hospital's CPSP accreditation, matched by name, and which of its specialities are covered. */
export async function hospitalAccreditation(db: Database, session: Session | null, input: { hospital: string; specialities: string[] }) {
  assertCan(session, "portal");
  const doc = await cpspList(db);
  if (!doc) return null;
  const m = matchHospital(input.hospital, doc.list);
  if (!m) return { matched: null, programs: [], covered: [] as string[], asOf: doc.importedAt };
  // One hospital can be several CPSP entries (an institute inside it is listed apart); duplicate lines are dropped.
  const seen = new Set<string>();
  const programs = m.entries.flatMap((e) => e.programs).filter((p) => {
    const k = `${p.speciality}|${p.unit}|${p.type}`;
    return seen.has(k) ? false : (seen.add(k), true);
  }).sort((a, b) => a.speciality.localeCompare(b.speciality));
  return {
    matched: m.entries.map((e) => e.hospital).join("; "),
    programs,
    covered: input.specialities.filter((s) => programs.some((p) => specialityMatches(s, p.speciality))),
    asOf: doc.importedAt,
  };
}

/** CPSP-accredited hospitals for a speciality, matched by name. */
export async function specialityAccreditation(db: Database, session: Session | null, speciality: string) {
  assertCan(session, "portal");
  const doc = await cpspList(db);
  if (!doc) return null;
  return { hospitals: hospitalsForSpeciality(speciality, doc.list), asOf: doc.importedAt };
}
