import { sql } from "drizzle-orm";
import {
  bigserial,
  check,
  index,
  integer,
  primaryKey,
  json,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Deliberately small: only entities whose shape is already known from the
 * existing data. Candidate records, merit lists and gazettes arrive once their
 * contracts are mapped — see docs/DATA_CONTRACTS.md.
 */

export const userRole = pgEnum("user_role", ["candidate", "admin"]);
export const inductionStatus = pgEnum("induction_status", ["planned", "active", "completed"]);
export const policyStatus = pgEnum("policy_status", ["draft", "active", "retired"]);
export const auditResult = pgEnum("audit_result", ["success", "failure"]);
export const referenceDocumentKind = pgEnum("reference_document_kind", ["disciplines", "specialty_groups", "cpsp_accreditation"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  role: userRole("role").notNull().default("candidate"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const inductions = pgTable("inductions", {
  /** The official induction number (8 … 21 in the current data). */
  id: integer("id").primaryKey(),
  label: text("label").notNull(),
  calendarYear: integer("calendar_year").notNull(),
  status: inductionStatus("status").notNull().default("planned"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const scoringPolicies = pgTable(
  "scoring_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Existing policy key, e.g. "2026" or "2026-1". Covered inductions live in the definition ("induction"). */
    policyKey: text("policy_key").notNull(),
    version: integer("version").notNull(),
    status: policyStatus("status").notNull().default("draft"),
    /**
     * Validated against policySchema (src/lib/domain/scoring-policy.ts) before every write.
     * `json`, not `jsonb`: it keeps the source's key order, so an export matches the public file.
     */
    definition: json("definition").notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("scoring_policies_key_version_uq").on(t.policyKey, t.version),
    // At most one active policy at a time (mirrors `active_policy` in the JSON file).
    uniqueIndex("scoring_policies_single_active_uq").on(t.status).where(sql`${t.status} = 'active'`),
    check("scoring_policies_version_positive", sql`${t.version} > 0`),
  ],
);

/**
 * File-level fields of scoring_policy.json — everything except `policies`
 * (`active_policy`, `_induction_max`, `year_total_max`, `_note`…). Append-only:
 * the newest row is current. Kept so the file can be exported without loss.
 */
export const scoringPolicyFileMeta = pgTable("scoring_policy_file_meta", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  meta: json("meta").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/*
 * Reference data. Lookup ids are the PHF ids used in the public seat files, so
 * imported rows keep their identity. Names may be corrected by admins (audited).
 */
const lookup = (table: string) =>
  pgTable(table, {
    id: integer("id").primaryKey(),
    name: text("name").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  });

/** Training programme type: FCPS, MS, MD, FCPSD, MDS (`typeId` in the files). */
export const programs = lookup("programs");
export const quotas = lookup("quotas");
export const specialities = lookup("specialities");
/** `instituteId` 0 with an empty name means "no institute". */
export const institutes = lookup("institutes");
export const hospitals = lookup("hospitals");

/** Seat matrix of an induction (data/induction<n>_seats.json), one row per seat line. */
export const inductionSeats = pgTable(
  "induction_seats",
  {
    inductionId: integer("induction_id").notNull().references(() => inductions.id),
    programId: integer("program_id").notNull().references(() => programs.id),
    quotaId: integer("quota_id").notNull().references(() => quotas.id),
    specialityId: integer("speciality_id").notNull().references(() => specialities.id),
    instituteId: integer("institute_id").notNull().references(() => institutes.id),
    hospitalId: integer("hospital_id").notNull().references(() => hospitals.id),
    seats: integer("seats").notNull(),
    /** Source order, so an export reproduces the original file. */
    position: integer("position").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.inductionId, t.programId, t.quotaId, t.specialityId, t.instituteId, t.hospitalId] }),
    index("induction_seats_position_idx").on(t.inductionId, t.position),
    check("induction_seats_seats_nonnegative", sql`${t.seats} >= 0`),
  ],
);

/**
 * Nested reference files kept whole (disciplines, specialty groups, CPSP accreditation).
 * Append-only: the newest version per kind (and induction, where it applies) is current.
 * `json`, not `jsonb`, so an export keeps the source's key order.
 */
export const referenceDocuments = pgTable(
  "reference_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: referenceDocumentKind("kind").notNull(),
    /** 0 for datasets that do not belong to one induction (avoids NULL in the unique key). */
    inductionId: integer("induction_id").notNull().default(0),
    version: integer("version").notNull(),
    data: json("data").notNull(),
    summary: text("summary").notNull(),
    createdBy: text("created_by").notNull(),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("reference_documents_kind_induction_version_uq").on(t.kind, t.inductionId, t.version),
    check("reference_documents_version_positive", sql`${t.version} > 0`),
  ],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorId: uuid("actor_id").references(() => users.id),
    actorEmail: text("actor_email").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    reason: text("reason"),
    result: auditResult("result").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_entity_idx").on(t.entityType, t.entityId), index("audit_log_created_idx").on(t.createdAt)],
);
