import "server-only";
import { and, asc, count, desc, eq, inArray, max, sql, sum } from "drizzle-orm";
import { z } from "zod";
import { assertRole, type Session } from "@/lib/auth/roles";
import { UserFacingError } from "@/lib/errors";
import { requireReason, writeAudit, type Tx } from "./shared";
import type { Database } from "@/lib/db/client";
import {
  hospitals,
  inductions,
  inductionSeats,
  institutes,
  programs,
  quotas,
  referenceDocuments,
  specialities,
} from "@/lib/db/schema";
import {
  DOCUMENT_KINDS,
  SEAT_LOOKUPS,
  seatFileSchema,
  summarizeDocument,
  type DocumentKind,
  type LookupKind,
  type SeatRow,
} from "@/lib/domain/reference-data";

/**
 * Data-access boundary for reference data. Every function checks the caller's role
 * here, on the server; every write is audited with a reason.
 *
 * Round trips with the public files:
 * - seats: rows → lookups (programs, quotas, …) + induction_seats with `position`;
 *   export joins the names back in the original order and field order.
 * - documents: stored as written (json column), so export equals the import.
 */


export const lookupTables = { programs, quotas, specialities, institutes, hospitals } as const;
export const LOOKUP_LABELS: Record<LookupKind, string> = {
  programs: "Programmes",
  quotas: "Quotas",
  specialities: "Specialities",
  institutes: "Institutes",
  hospitals: "Hospitals",
};

const inductionSchema = z.number().int().min(1).max(999);
const seatKeySchema = z.object({
  programId: z.number().int().min(0),
  quotaId: z.number().int().min(0),
  specialityId: z.number().int().min(0),
  instituteId: z.number().int().min(0),
  hospitalId: z.number().int().min(0),
});
export type SeatKey = z.infer<typeof seatKeySchema>;
const seatsSchema = z.number().int().min(0).max(10_000);

const reasonFor = (reason: string) => requireReason(reason, "reference data changes");

const keyText = (k: SeatKey) => [k.programId, k.quotaId, k.specialityId, k.instituteId, k.hospitalId].join("-");
const seatWhere = (induction: number, k: SeatKey) =>
  and(
    eq(inductionSeats.inductionId, induction),
    eq(inductionSeats.programId, k.programId),
    eq(inductionSeats.quotaId, k.quotaId),
    eq(inductionSeats.specialityId, k.specialityId),
    eq(inductionSeats.instituteId, k.instituteId),
    eq(inductionSeats.hospitalId, k.hospitalId),
  );

// ── Overview ────────────────────────────────────────────────────────────────

export async function getReferenceOverview(db: Database, session: Session | null) {
  assertRole(session, "admin");
  const seatMatrices = await db
    .select({
      inductionId: inductionSeats.inductionId,
      lines: count(),
      seats: sum(inductionSeats.seats).mapWith(Number),
    })
    .from(inductionSeats)
    .groupBy(inductionSeats.inductionId)
    .orderBy(desc(inductionSeats.inductionId));

  const lookupCounts = Object.fromEntries(
    await Promise.all(
      (Object.keys(lookupTables) as LookupKind[]).map(async (k) => {
        const [r] = await db.select({ n: count() }).from(lookupTables[k]);
        return [k, r?.n ?? 0] as const;
      }),
    ),
  ) as Record<LookupKind, number>;

  // Newest version of each document (per induction where that applies).
  const latest = db
    .select({ kind: referenceDocuments.kind, inductionId: referenceDocuments.inductionId, version: max(referenceDocuments.version).as("v") })
    .from(referenceDocuments)
    .groupBy(referenceDocuments.kind, referenceDocuments.inductionId)
    .as("latest");
  const documents = await db
    .select({
      id: referenceDocuments.id,
      kind: referenceDocuments.kind,
      inductionId: referenceDocuments.inductionId,
      version: referenceDocuments.version,
      summary: referenceDocuments.summary,
      createdBy: referenceDocuments.createdBy,
      createdAt: referenceDocuments.createdAt,
    })
    .from(referenceDocuments)
    .innerJoin(
      latest,
      and(eq(latest.kind, referenceDocuments.kind), eq(latest.inductionId, referenceDocuments.inductionId), eq(latest.version, referenceDocuments.version)),
    )
    .orderBy(asc(referenceDocuments.kind), desc(referenceDocuments.inductionId));

  return { seatMatrices, lookupCounts, documents };
}

// ── Lookups ─────────────────────────────────────────────────────────────────

/** Insert ids that are new; rename ids whose name changed. Returns the renames. */
async function upsertLookups(tx: Tx, kind: LookupKind, entries: Map<number, string>) {
  const table = lookupTables[kind];
  const ids = [...entries.keys()];
  const existing = ids.length ? await tx.select().from(table).where(inArray(table.id, ids)) : [];
  const known = new Map(existing.map((r) => [r.id, r.name]));
  const fresh = ids.filter((id) => !known.has(id)).map((id) => ({ id, name: entries.get(id)! }));
  if (fresh.length) await tx.insert(table).values(fresh);
  const renamed: { id: number; from: string; to: string }[] = [];
  for (const [id, name] of entries) {
    const prev = known.get(id);
    if (prev !== undefined && prev !== name) {
      await tx.update(table).set({ name, updatedAt: new Date() }).where(eq(table.id, id));
      renamed.push({ id, from: prev, to: name });
    }
  }
  return { added: fresh.length, renamed };
}

export async function listLookup(db: Database, session: Session | null, kind: LookupKind) {
  assertRole(session, "admin");
  const table = lookupTables[kind];
  const column = {
    programs: inductionSeats.programId,
    quotas: inductionSeats.quotaId,
    specialities: inductionSeats.specialityId,
    institutes: inductionSeats.instituteId,
    hospitals: inductionSeats.hospitalId,
  }[kind];
  const usage = db
    .select({ id: column, lines: count().as("lines"), seats: sum(inductionSeats.seats).as("seats") })
    .from(inductionSeats)
    .groupBy(column)
    .as("usage");
  return db
    .select({
      id: table.id,
      name: table.name,
      updatedAt: table.updatedAt,
      lines: sql<number>`coalesce(${usage.lines}, 0)`.mapWith(Number),
      seats: sql<number>`coalesce(${usage.seats}, 0)`.mapWith(Number),
    })
    .from(table)
    .leftJoin(usage, eq(usage.id, table.id))
    .orderBy(asc(table.name));
}

export async function saveLookup(
  db: Database,
  session: Session | null,
  input: { kind: LookupKind; id: number; name: string; reason: string },
) {
  assertRole(session, "admin");
  const id = z.number().int().min(0).parse(input.id);
  const name = z.string().trim().min(input.kind === "institutes" ? 0 : 1, "Name is required").parse(input.name);
  const reason = reasonFor(input.reason);
  const table = lookupTables[input.kind];
  return db.transaction(async (tx) => {
    const [prev] = await tx.select().from(table).where(eq(table.id, id)).limit(1);
    if (prev) await tx.update(table).set({ name, updatedAt: new Date() }).where(eq(table.id, id));
    else await tx.insert(table).values({ id, name });
    await writeAudit(tx, session.email, {
      action: prev ? "lookup.rename" : "lookup.create",
      entityType: input.kind,
      entityId: String(id),
      before: prev ? { name: prev.name } : null,
      after: { name },
      reason,
    });
    return { created: !prev };
  });
}

// ── Seat matrix ─────────────────────────────────────────────────────────────

/**
 * Replace an induction's seat matrix with a seat file. All or nothing: the file is
 * validated first, then lookups, the induction row and the seat lines are written
 * in one transaction.
 */
export async function importSeatFile(
  db: Database,
  session: Session | null,
  input: { induction: number; calendarYear?: number; file: unknown; reason: string },
) {
  assertRole(session, "admin");
  const induction = inductionSchema.parse(input.induction);
  const rows = seatFileSchema.parse(input.file);
  const reason = reasonFor(input.reason);

  return db.transaction(async (tx) => {
    const [ind] = await tx.select().from(inductions).where(eq(inductions.id, induction)).limit(1);
    if (!ind) {
      const year = input.calendarYear;
      if (year === undefined || !Number.isInteger(year) || year < 2000 || year > 2100) {
        throw new UserFacingError(`Induction ${induction} does not exist yet. Enter its calendar year (e.g. 2026) to create it.`);
      }
      const calendarYear = year;
      await tx.insert(inductions).values({ id: induction, label: `Induction ${induction}`, calendarYear });
    }

    const renames: Record<string, { id: number; from: string; to: string }[]> = {};
    let addedLookups = 0;
    for (const [idField, nameField, kind] of SEAT_LOOKUPS) {
      const entries = new Map(rows.map((r) => [r[idField], r[nameField]]));
      const { added, renamed } = await upsertLookups(tx, kind, entries);
      addedLookups += added;
      if (renamed.length) renames[kind] = renamed;
    }

    const [before] = await tx
      .select({ lines: count(), seats: sum(inductionSeats.seats).mapWith(Number) })
      .from(inductionSeats)
      .where(eq(inductionSeats.inductionId, induction));
    await tx.delete(inductionSeats).where(eq(inductionSeats.inductionId, induction));
    await tx.insert(inductionSeats).values(
      rows.map((r, position) => ({
        inductionId: induction,
        programId: r.typeId,
        quotaId: r.quotaId,
        specialityId: r.specialityId,
        instituteId: r.instituteId,
        hospitalId: r.hospitalId,
        seats: r.seats,
        position,
      })),
    );
    const after = { lines: rows.length, seats: rows.reduce((s, r) => s + r.seats, 0) };
    await writeAudit(tx, session.email, {
      action: "seats.import_file",
      entityType: "induction_seats",
      entityId: `induction:${induction}`,
      before: before?.lines ? { lines: before.lines, seats: before.seats ?? 0 } : null,
      after: { ...after, addedLookups, renames },
      reason,
    });
    return { ...after, addedLookups, renames, createdInduction: !ind };
  });
}

export type SeatFilters = Partial<Record<"programId" | "quotaId" | "specialityId" | "hospitalId", number>>;

export async function listSeats(db: Database, session: Session | null, induction: number, filters: SeatFilters = {}) {
  assertRole(session, "admin");
  const where = and(
    eq(inductionSeats.inductionId, induction),
    filters.programId !== undefined ? eq(inductionSeats.programId, filters.programId) : undefined,
    filters.quotaId !== undefined ? eq(inductionSeats.quotaId, filters.quotaId) : undefined,
    filters.specialityId !== undefined ? eq(inductionSeats.specialityId, filters.specialityId) : undefined,
    filters.hospitalId !== undefined ? eq(inductionSeats.hospitalId, filters.hospitalId) : undefined,
  );
  return db
    .select({
      programId: inductionSeats.programId,
      program: programs.name,
      quotaId: inductionSeats.quotaId,
      quota: quotas.name,
      specialityId: inductionSeats.specialityId,
      speciality: specialities.name,
      instituteId: inductionSeats.instituteId,
      institute: institutes.name,
      hospitalId: inductionSeats.hospitalId,
      hospital: hospitals.name,
      seats: inductionSeats.seats,
      position: inductionSeats.position,
    })
    .from(inductionSeats)
    .innerJoin(programs, eq(programs.id, inductionSeats.programId))
    .innerJoin(quotas, eq(quotas.id, inductionSeats.quotaId))
    .innerJoin(specialities, eq(specialities.id, inductionSeats.specialityId))
    .innerJoin(institutes, eq(institutes.id, inductionSeats.instituteId))
    .innerJoin(hospitals, eq(hospitals.id, inductionSeats.hospitalId))
    .where(where)
    .orderBy(asc(inductionSeats.position));
}

/** All lookup rows, for filter and "add seat line" pickers. */
export async function listAllLookups(db: Database, session: Session | null) {
  assertRole(session, "admin");
  const entries = await Promise.all(
    (Object.keys(lookupTables) as LookupKind[]).map(async (k) => {
      const t = lookupTables[k];
      return [k, await db.select({ id: t.id, name: t.name }).from(t).orderBy(asc(t.name))] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<LookupKind, { id: number; name: string }[]>;
}

export async function updateSeatCount(
  db: Database,
  session: Session | null,
  input: { induction: number; key: SeatKey; seats: number; reason: string },
) {
  assertRole(session, "admin");
  const induction = inductionSchema.parse(input.induction);
  const key = seatKeySchema.parse(input.key);
  const seats = seatsSchema.parse(input.seats);
  const reason = reasonFor(input.reason);
  return db.transaction(async (tx) => {
    const [prev] = await tx.select({ seats: inductionSeats.seats }).from(inductionSeats).where(seatWhere(induction, key)).limit(1);
    if (!prev) throw new UserFacingError("That seat line does not exist");
    if (prev.seats === seats) return { changed: false };
    await tx.update(inductionSeats).set({ seats }).where(seatWhere(induction, key));
    await writeAudit(tx, session.email, {
      action: "seats.update",
      entityType: "induction_seats",
      entityId: `induction:${induction}:${keyText(key)}`,
      before: { seats: prev.seats },
      after: { seats },
      reason,
    });
    return { changed: true };
  });
}

export async function addSeatLine(
  db: Database,
  session: Session | null,
  input: { induction: number; key: SeatKey; seats: number; reason: string },
) {
  assertRole(session, "admin");
  const induction = inductionSchema.parse(input.induction);
  const key = seatKeySchema.parse(input.key);
  const seats = seatsSchema.parse(input.seats);
  const reason = reasonFor(input.reason);
  return db.transaction(async (tx) => {
    const [exists] = await tx.select({ seats: inductionSeats.seats }).from(inductionSeats).where(seatWhere(induction, key)).limit(1);
    if (exists) throw new UserFacingError("That seat line already exists — edit its seat count instead");
    const [last] = await tx
      .select({ p: max(inductionSeats.position) })
      .from(inductionSeats)
      .where(eq(inductionSeats.inductionId, induction));
    await tx.insert(inductionSeats).values({ inductionId: induction, ...key, seats, position: (last?.p ?? -1) + 1 });
    await writeAudit(tx, session.email, {
      action: "seats.add",
      entityType: "induction_seats",
      entityId: `induction:${induction}:${keyText(key)}`,
      after: { seats },
      reason,
    });
  });
}

export async function removeSeatLine(db: Database, session: Session | null, input: { induction: number; key: SeatKey; reason: string }) {
  assertRole(session, "admin");
  const induction = inductionSchema.parse(input.induction);
  const key = seatKeySchema.parse(input.key);
  const reason = reasonFor(input.reason);
  return db.transaction(async (tx) => {
    const [prev] = await tx.delete(inductionSeats).where(seatWhere(induction, key)).returning({ seats: inductionSeats.seats });
    if (!prev) throw new UserFacingError("That seat line does not exist");
    await writeAudit(tx, session.email, {
      action: "seats.remove",
      entityType: "induction_seats",
      entityId: `induction:${induction}:${keyText(key)}`,
      before: { seats: prev.seats },
      reason,
    });
  });
}

/** Rebuild data/induction<n>_seats.json, field for field and in the original order. */
export async function exportSeatFile(db: Database, session: Session | null, induction: number): Promise<SeatRow[]> {
  const rows = await listSeats(db, session, inductionSchema.parse(induction));
  return rows.map((r) => ({
    typeId: r.programId,
    typeName: r.program,
    quotaId: r.quotaId,
    quotaName: r.quota,
    specialityId: r.specialityId,
    specialityName: r.speciality,
    instituteId: r.instituteId,
    instituteName: r.institute,
    hospitalId: r.hospitalId,
    hospitalName: r.hospital,
    seats: r.seats,
  }));
}

// ── Documents (disciplines, specialty groups, CPSP accreditation) ────────────

function documentInduction(kind: DocumentKind, induction?: number | null) {
  if (!DOCUMENT_KINDS[kind].perInduction) return 0;
  return inductionSchema.parse(induction);
}

/** Store a new version of a reference document (import or edit — the same operation). */
export async function saveReferenceDocument(
  db: Database,
  session: Session | null,
  input: { kind: DocumentKind; induction?: number | null; data: unknown; reason: string },
) {
  assertRole(session, "admin");
  const { kind } = input;
  const inductionId = documentInduction(kind, input.induction);
  DOCUMENT_KINDS[kind].schema.parse(input.data); // validation only; store the input as written
  const reason = reasonFor(input.reason);
  const summary = summarizeDocument(kind, input.data);

  return db.transaction(async (tx) => {
    const [latest] = await tx
      .select({ v: max(referenceDocuments.version) })
      .from(referenceDocuments)
      .where(and(eq(referenceDocuments.kind, kind), eq(referenceDocuments.inductionId, inductionId)));
    const version = (latest?.v ?? 0) + 1;
    const [row] = await tx
      .insert(referenceDocuments)
      .values({ kind, inductionId, version, data: input.data, summary, createdBy: session.email, reason })
      .returning({ id: referenceDocuments.id, version: referenceDocuments.version });
    await writeAudit(tx, session.email, {
      action: "reference_document.save",
      entityType: kind,
      entityId: `${kind}${inductionId ? `:${inductionId}` : ""}@v${version}`,
      after: { summary },
      reason,
    });
    return { ...row!, summary };
  });
}

export async function listDocumentVersions(db: Database, session: Session | null, kind: DocumentKind) {
  assertRole(session, "admin");
  return db
    .select({
      id: referenceDocuments.id,
      inductionId: referenceDocuments.inductionId,
      version: referenceDocuments.version,
      summary: referenceDocuments.summary,
      createdBy: referenceDocuments.createdBy,
      reason: referenceDocuments.reason,
      createdAt: referenceDocuments.createdAt,
    })
    .from(referenceDocuments)
    .where(eq(referenceDocuments.kind, kind))
    .orderBy(desc(referenceDocuments.inductionId), desc(referenceDocuments.version));
}

export async function getDocumentVersion(db: Database, session: Session | null, id: string) {
  assertRole(session, "admin");
  const [row] = await db.select().from(referenceDocuments).where(eq(referenceDocuments.id, id)).limit(1);
  return row ?? null;
}

export async function getCurrentDocument(db: Database, session: Session | null, kind: DocumentKind, induction?: number | null) {
  assertRole(session, "admin");
  const inductionId = documentInduction(kind, induction);
  const [row] = await db
    .select()
    .from(referenceDocuments)
    .where(and(eq(referenceDocuments.kind, kind), eq(referenceDocuments.inductionId, inductionId)))
    .orderBy(desc(referenceDocuments.version))
    .limit(1);
  return row ?? null;
}
