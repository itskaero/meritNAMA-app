import { readFileSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, like } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "@/lib/auth/roles";
import {
  addSeatLine,
  exportSeatFile,
  getCurrentDocument,
  getReferenceOverview,
  importSeatFile,
  listLookup,
  listSeats,
  removeSeatLine,
  saveLookup,
  saveReferenceDocument,
  updateSeatCount,
} from "@/lib/data/reference-data";
import * as schema from "@/lib/db/schema";

/**
 * Runs against a real, migrated, DISPOSABLE database (TEST_DATABASE_URL); skipped
 * otherwise. It empties the reference-data tables and uses induction 921.
 */
const url = process.env.TEST_DATABASE_URL;
const raw = (f: string) => readFileSync(path.join(__dirname, "fixtures", f), "utf8");
const seatsRaw = raw("seats_induction21.json");
const seats = JSON.parse(seatsRaw);
const disciplines = JSON.parse(raw("disciplines.json"));
const groups = JSON.parse(raw("specialty_groups_induction21.json"));
const cpsp = JSON.parse(raw("cpsp_accreditation_sample.json"));

const admin: Session = { userId: "t-admin", email: "admin@test.local", role: "owner", isStub: false };
const candidate: Session = { userId: "t-cand", email: "cand@test.local", role: "candidate", isStub: false };
const IND = 921;

describe.skipIf(!url)("reference data (integration)", () => {
  const sql = postgres(url ?? "postgres://unused", { max: 2, onnotice: () => {} });
  const db = drizzle(sql, { schema });

  const wipe = async () => {
    await db.delete(schema.inductionSeats);
    await db.delete(schema.referenceDocuments);
    for (const t of [schema.programs, schema.quotas, schema.specialities, schema.institutes, schema.hospitals]) await db.delete(t);
    await db.delete(schema.auditLog).where(like(schema.auditLog.entityId, `induction:${IND}%`));
    await db.delete(schema.inductions).where(eq(schema.inductions.id, IND));
  };
  beforeAll(wipe);
  afterAll(async () => {
    await wipe();
    await sql.end();
  });

  it("refuses non-admins", async () => {
    await expect(importSeatFile(db, candidate, { induction: IND, calendarYear: 2026, file: seats, reason: "x" })).rejects.toThrow("forbidden");
    await expect(getReferenceOverview(db, null)).rejects.toThrow("unauthenticated");
    await expect(saveReferenceDocument(db, candidate, { kind: "disciplines", data: disciplines, reason: "x" })).rejects.toThrow("forbidden");
  });

  it("rejects an invalid seat file without writing anything", async () => {
    await expect(importSeatFile(db, admin, { induction: IND, calendarYear: 2026, file: [...seats, seats[0]], reason: "bad" })).rejects.toThrow();
    expect((await getReferenceOverview(db, admin)).seatMatrices).toHaveLength(0);
  });

  it("needs a calendar year for a new induction", async () => {
    await expect(importSeatFile(db, admin, { induction: IND, file: seats, reason: "x" })).rejects.toThrow();
  });

  it("imports a seat file and exports it byte for byte", async () => {
    const r = await importSeatFile(db, admin, { induction: IND, calendarYear: 2026, file: seats, reason: "initial import" });
    expect(r).toMatchObject({ lines: 873, seats: 1449, createdInduction: true });
    expect(JSON.stringify(await exportSeatFile(db, admin, IND), null, 2)).toBe(seatsRaw);

    const overview = await getReferenceOverview(db, admin);
    expect(overview.seatMatrices).toEqual([{ inductionId: IND, lines: 873, seats: 1449 }]);
    expect(overview.lookupCounts).toMatchObject({ programs: 5, quotas: 8, specialities: 45, institutes: 1, hospitals: 69 });
  });

  it("filters seats and edits them with an audit trail", async () => {
    const punjab = await listSeats(db, admin, IND, { quotaId: 1 });
    expect(punjab.length).toBeGreaterThan(0);
    expect(punjab.every((r) => r.quota === "Punjab")).toBe(true);

    const first = punjab[0]!;
    const key = { programId: first.programId, quotaId: first.quotaId, specialityId: first.specialityId, instituteId: first.instituteId, hospitalId: first.hospitalId };
    await updateSeatCount(db, admin, { induction: IND, key, seats: first.seats + 2, reason: "notification 12" });
    const exported = await exportSeatFile(db, admin, IND);
    expect(exported[first.position]!.seats).toBe(first.seats + 2);

    const audit = await db.select().from(schema.auditLog).where(like(schema.auditLog.entityId, `induction:${IND}:%`));
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: "seats.update", before: { seats: first.seats }, after: { seats: first.seats + 2 }, reason: "notification 12" });

    await expect(updateSeatCount(db, admin, { induction: IND, key, seats: -1, reason: "x" })).rejects.toThrow();
    await expect(updateSeatCount(db, admin, { induction: IND, key, seats: 3, reason: " " })).rejects.toThrow("reason");
  });

  it("adds and removes seat lines", async () => {
    const key = { programId: seats[0].typeId, quotaId: seats[0].quotaId, specialityId: seats[0].specialityId, instituteId: 0, hospitalId: 999_001 };
    await expect(addSeatLine(db, admin, { induction: IND, key, seats: 2, reason: "new hospital" })).rejects.toThrow(); // unknown hospital
    await saveLookup(db, admin, { kind: "hospitals", id: 999_001, name: "Test Teaching Hospital", reason: "new hospital" });
    await addSeatLine(db, admin, { induction: IND, key, seats: 2, reason: "new hospital" });
    await expect(addSeatLine(db, admin, { induction: IND, key, seats: 2, reason: "dup" })).rejects.toThrow("already exists");

    const exported = await exportSeatFile(db, admin, IND);
    expect(exported).toHaveLength(874);
    expect(exported.at(-1)).toMatchObject({ hospitalId: 999_001, hospitalName: "Test Teaching Hospital", seats: 2 });

    await removeSeatLine(db, admin, { induction: IND, key, reason: "added by mistake" });
    expect(await exportSeatFile(db, admin, IND)).toHaveLength(873);
  });

  it("renames a lookup and the export follows", async () => {
    const id = seats[0].hospitalId;
    await saveLookup(db, admin, { kind: "hospitals", id, name: "ABS Teaching Hospital, Gujrat (corrected)", reason: "spelling" });
    const exported = await exportSeatFile(db, admin, IND);
    expect(exported.filter((r) => r.hospitalId === id).every((r) => r.hospitalName.endsWith("(corrected)"))).toBe(true);
    const row = (await listLookup(db, admin, "hospitals")).find((h) => h.id === id);
    expect(row?.lines).toBeGreaterThan(0);
  });

  it("re-importing a file replaces the matrix and restores names", async () => {
    const r = await importSeatFile(db, admin, { induction: IND, file: seats, reason: "re-import" });
    expect(r.createdInduction).toBe(false);
    expect(r.renames.hospitals).toEqual([{ id: seats[0].hospitalId, from: "ABS Teaching Hospital, Gujrat (corrected)", to: seats[0].hospitalName }]);
    expect(JSON.stringify(await exportSeatFile(db, admin, IND), null, 2)).toBe(seatsRaw);
  });

  it("stores documents as written and versions every save", async () => {
    for (const [kind, data, induction] of [
      ["disciplines", disciplines, null],
      ["specialty_groups", groups, 21],
      ["cpsp_accreditation", cpsp, null],
    ] as const) {
      const v1 = await saveReferenceDocument(db, admin, { kind, induction, data, reason: "import" });
      expect(v1.version).toBe(1);
      const current = await getCurrentDocument(db, admin, kind, induction);
      expect(JSON.stringify(current?.data)).toBe(JSON.stringify(data)); // same values and key order
    }
    await expect(saveReferenceDocument(db, admin, { kind: "specialty_groups", data: groups, reason: "x" })).rejects.toThrow(); // induction required

    const edited = structuredClone(disciplines);
    edited[0].name = "Anaesthesiology (edited)";
    const v2 = await saveReferenceDocument(db, admin, { kind: "disciplines", data: edited, reason: "edit" });
    expect(v2.version).toBe(2);
    expect((await getCurrentDocument(db, admin, "disciplines"))?.data).toEqual(edited);
    expect((await getReferenceOverview(db, admin)).documents.map((d) => `${d.kind}:${d.inductionId}@v${d.version}`).sort()).toEqual([
      "cpsp_accreditation:0@v1",
      "disciplines:0@v2",
      "specialty_groups:21@v1",
    ]);
  });
});
