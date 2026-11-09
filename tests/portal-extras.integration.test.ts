import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq, inArray, like } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "@/lib/auth/roles";
import { hospitalAccreditation, specialityAccreditation } from "@/lib/data/accreditation";
import { toggleShortlist } from "@/lib/data/finder";
import { dataSources } from "@/lib/data/freshness";
import { importMeritRound, seatTrends } from "@/lib/data/merit";
import { setShortlistAlerts, shortlistAlerts } from "@/lib/data/notifications";
import { saveReferenceDocument } from "@/lib/data/reference-data";
import { deleteView, listSavedViews, saveView } from "@/lib/data/workspace";
import { ensureUser } from "@/lib/data/users";
import * as schema from "@/lib/db/schema";

/** DISPOSABLE database only (TEST_DATABASE_URL). Uses induction 973 and *@extras.test accounts. */
const url = process.env.TEST_DATABASE_URL;
const IND = 973;
const owner: Session = { userId: "px-o", email: "owner@extras.test", role: "owner", isStub: false };
const alice: Session = { userId: "px-a", email: "alice@extras.test", role: "candidate", isStub: false };
const bob: Session = { userId: "px-b", email: "bob@extras.test", role: "candidate", isStub: false };

const round = (roundNo: number, marks: number[]) => ({
  Table: [{ inductionId: IND, name: `PHF/33/JAN/0${roundNo}`, displayName: "Extras", startDate: "2033-01-01T00:00:00", endDate: "2033-02-01T00:00:00" }],
  Table5: marks.map((m, i) => ({ rowNo: i + 1, type: "FCPS", quota: "Punjab", specialityJobId: 0, speciality: "Ophthalmology", hospital: "Mayo Hospital, Lahore", institute: "", seats: 2, marks: m, applicantId: String(730000 + i), preferenceNo: 1, consent: "Accepted" })),
});

describe.skipIf(!url)("workspace, alerts, accreditation and data sources (integration)", () => {
  const sql = postgres(url ?? "postgres://unused", { max: 2, onnotice: () => {} });
  const db = drizzle(sql, { schema });

  const wipe = async () => {
    const rs = await db.select({ id: schema.meritRounds.id }).from(schema.meritRounds).where(eq(schema.meritRounds.inductionId, IND));
    if (rs.length) await db.delete(schema.meritRounds).where(inArray(schema.meritRounds.id, rs.map((r) => r.id)));
    await db.delete(schema.inductions).where(eq(schema.inductions.id, IND));
    await db.delete(schema.users).where(like(schema.users.email, "%@extras.test"));
    await db.delete(schema.referenceDocuments).where(and(eq(schema.referenceDocuments.kind, "cpsp_accreditation"), eq(schema.referenceDocuments.createdBy, "owner@extras.test")));
  };
  beforeAll(wipe);
  afterAll(async () => {
    await wipe();
    await sql.end();
  });

  it("alerts people whose shortlisted seats are in a new round, unless they turned alerts off", async () => {
    await importMeritRound(db, owner, { roundNo: 1, file: round(1, [22.5, 21.0]), reason: "r1" });
    const item = { program: "FCPS", quota: "Punjab", speciality: "Ophthalmology", hospital: "Mayo Hospital, Lahore" };
    await toggleShortlist(db, alice, item);
    await toggleShortlist(db, bob, item);
    await setShortlistAlerts(db, bob, false);
    expect(await shortlistAlerts(db, bob)).toBe(false);
    await importMeritRound(db, owner, { roundNo: 2, file: round(2, [22.5, 20.6]), reason: "r2" });
    const notes = async (s: Session) => db.select().from(schema.notifications).where(and(eq(schema.notifications.userId, (await ensureUser(db, s)).id), eq(schema.notifications.kind, "shortlist")));
    const a = await notes(alice);
    expect(a).toHaveLength(1);
    expect(a[0]!.title).toBe("Round 2, your shortlist: Ophthalmology · Mayo Hospital 20.60 (−0.40)");
    expect(await notes(bob)).toHaveLength(0);
  });

  it("keeps saved views private, portal-only and renamable", async () => {
    await expect(saveView(db, alice, { label: "x", href: "https://evil.example/portal" })).rejects.toThrow(/portal pages/);
    await expect(saveView(db, alice, { label: "x", href: "/admin/audit" })).rejects.toThrow(/portal pages/);
    await saveView(db, alice, { label: "Round 1 → 2", href: `/portal/history/${IND}/compare?from=1&to=2` });
    await saveView(db, alice, { label: "Renamed", href: `/portal/history/${IND}/compare?from=1&to=2` });
    const mine = await listSavedViews(db, alice);
    expect(mine.map((v) => v.label)).toEqual(["Renamed"]);
    expect(await listSavedViews(db, bob)).toEqual([]);
    await deleteView(db, bob, mine[0]!.id);
    expect(await listSavedViews(db, alice)).toHaveLength(1);
    await deleteView(db, alice, mine[0]!.id);
    expect(await listSavedViews(db, alice)).toHaveLength(0);
  });

  it("matches CPSP accreditation by name and lists data sources", async () => {
    await saveReferenceDocument(db, owner, {
      kind: "cpsp_accreditation",
      data: [{ hospital: "KING EDWARD MEDICAL UNIVERSITY / MAYO HOSPITAL (LAHORE)", city: "Lahore", programs: [{ speciality: "OPHTHALMOLOGY", unit: "Unit-I", type: "F.A.", since: "01-01-2010" }] }],
      reason: "test",
    });
    const h = (await hospitalAccreditation(db, alice, { hospital: "Mayo Hospital, Lahore", specialities: ["Ophthalmology", "Neurology"] }))!;
    expect(h).toMatchObject({ matched: "KING EDWARD MEDICAL UNIVERSITY / MAYO HOSPITAL (LAHORE)", covered: ["Ophthalmology"] });
    expect((await hospitalAccreditation(db, alice, { hospital: "Jinnah Hospital, Lahore", specialities: [] }))!.matched).toBeNull();
    expect((await specialityAccreditation(db, alice, "Ophthalmology"))!.hospitals).toHaveLength(1);
    const sources = await dataSources(db, alice);
    expect(sources.map((s) => s.label)).toEqual(expect.arrayContaining(["Merit lists", "CPSP accreditation"]));
    expect((await seatTrends(db, alice)).inductions).toEqual(expect.any(Array));
  });
});
