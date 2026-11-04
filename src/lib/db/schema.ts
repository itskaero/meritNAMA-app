import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  date,
  doublePrecision,
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

/** "admin" is legacy (read as "owner"); Postgres cannot drop enum values. */
export const userRole = pgEnum("user_role", ["candidate", "admin", "data_editor", "policy_editor", "verifier", "moderator", "owner"]);
export const inductionStatus = pgEnum("induction_status", ["planned", "active", "completed"]);
export const policyStatus = pgEnum("policy_status", ["draft", "active", "retired"]);
export const auditResult = pgEnum("audit_result", ["success", "failure"]);
export const nameAliasKind = pgEnum("name_alias_kind", ["speciality", "hospital"]);
export const discussionTopicKind = pgEnum("discussion_topic_kind", ["general", "induction", "round", "speciality", "hospital"]);
export const discussionStatus = pgEnum("discussion_status", ["visible", "hidden"]);
export const reportStatus = pgEnum("report_status", ["open", "resolved", "dismissed"]);
export const referenceDocumentKind = pgEnum("reference_document_kind", ["disciplines", "specialty_groups", "cpsp_accreditation"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  role: userRole("role").notNull().default("candidate"),
  /** Shown on community posts instead of the email address. */
  displayName: text("display_name"),
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

/*
 * Merit rounds (inductions/<n>/merit/round_<r>.json). One row per published round,
 * and its allocations. Only what browsing needs is stored: no names, relations,
 * PMDC numbers, emails or employment fields. `applicant_id` is kept (never shown)
 * so movement between rounds can be counted.
 */
export const meritRounds = pgTable(
  "merit_rounds",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    inductionId: integer("induction_id").notNull().references(() => inductions.id),
    roundNo: integer("round_no").notNull(),
    /** PHF cycle code, e.g. "PHF/26/JAN/01", and its display name ("Jan 2026"). */
    cycleCode: text("cycle_code").notNull(),
    cycleName: text("cycle_name").notNull(),
    startsOn: date("starts_on"),
    endsOn: date("ends_on"),
    allocations: integer("allocations").notNull(),
    importedBy: text("imported_by").notNull(),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("merit_rounds_induction_round_uq").on(t.inductionId, t.roundNo),
    check("merit_rounds_round_positive", sql`${t.roundNo} > 0`),
  ],
);

/**
 * One allocation line of a round. Names are kept as published (ids such as quotaId
 * are not stable across inductions); speciality and hospital are also resolved to
 * the lookup tables by name or admin-defined alias, for cross-induction pages.
 */
export const meritAllocations = pgTable(
  "merit_allocations",
  {
    roundId: integer("round_id").notNull().references(() => meritRounds.id, { onDelete: "cascade" }),
    rowNo: integer("row_no").notNull(),
    applicantId: text("applicant_id").notNull(),
    program: text("program").notNull(),
    quota: text("quota").notNull(),
    specialityJobId: integer("speciality_job_id").notNull(),
    speciality: text("speciality").notNull(),
    specialityId: integer("speciality_id").references(() => specialities.id),
    hospital: text("hospital").notNull(),
    hospitalId: integer("hospital_id").references(() => hospitals.id),
    institute: text("institute").notNull(),
    seats: integer("seats").notNull(),
    marks: doublePrecision("marks").notNull(),
    preferenceNo: integer("preference_no").notNull(),
    /** As published: "Accepted", "Rejected" or "Not Avail". */
    consent: text("consent").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.roundId, t.rowNo] }),
    index("merit_allocations_speciality_idx").on(t.specialityId),
    index("merit_allocations_hospital_idx").on(t.hospitalId),
    index("merit_allocations_round_group_idx").on(t.roundId, t.program, t.quota, t.speciality),
  ],
);

/** Admin-confirmed mapping from a published name to a lookup id ("Family Medicine " → 12). */
export const nameAliases = pgTable(
  "name_aliases",
  {
    kind: nameAliasKind("kind").notNull(),
    /** Normalised name: lower case, punctuation and repeated spaces collapsed. */
    nameKey: text("name_key").notNull(),
    lookupId: integer("lookup_id").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.kind, t.nameKey] })],
);

/*
 * Community discussions. A thread is about one topic: general, an induction, a round,
 * a speciality or a hospital (topic_key holds "20", "20:6", or the lookup id). Every
 * signed-in user can read and post; admins moderate (hide, lock, pin) and act on
 * reports. Hidden content stays in the database for the audit trail.
 */
export const discussionThreads = pgTable(
  "discussion_threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    topicKind: discussionTopicKind("topic_kind").notNull(),
    topicKey: text("topic_key").notNull().default(""),
    title: text("title").notNull(),
    body: text("body").notNull(),
    authorId: uuid("author_id").notNull().references(() => users.id),
    status: discussionStatus("status").notNull().default("visible"),
    locked: boolean("locked").notNull().default(false),
    pinned: boolean("pinned").notNull().default(false),
    replyCount: integer("reply_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("discussion_threads_topic_idx").on(t.topicKind, t.topicKey, t.lastActivityAt),
    index("discussion_threads_activity_idx").on(t.lastActivityAt),
  ],
);

export const discussionPosts = pgTable(
  "discussion_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id").notNull().references(() => discussionThreads.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").notNull().references(() => users.id),
    body: text("body").notNull(),
    status: discussionStatus("status").notNull().default("visible"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("discussion_posts_thread_idx").on(t.threadId, t.createdAt), index("discussion_posts_author_idx").on(t.authorId, t.createdAt)],
);

/** "Helpful" votes on a thread or a reply; one per user per item. */
export const discussionVotes = pgTable(
  "discussion_votes",
  {
    targetKind: text("target_kind").notNull(),
    targetId: uuid("target_id").notNull(),
    userId: uuid("user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.targetKind, t.targetId, t.userId] }), check("discussion_votes_kind", sql`${t.targetKind} in ('thread', 'post')`)],
);

export const discussionReports = pgTable(
  "discussion_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    targetKind: text("target_kind").notNull(),
    targetId: uuid("target_id").notNull(),
    reporterId: uuid("reporter_id").notNull().references(() => users.id),
    reason: text("reason").notNull(),
    status: reportStatus("status").notNull().default("open"),
    resolvedBy: text("resolved_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("discussion_reports_status_idx").on(t.status, t.createdAt),
    uniqueIndex("discussion_reports_once_uq").on(t.targetKind, t.targetId, t.reporterId),
    check("discussion_reports_kind", sql`${t.targetKind} in ('thread', 'post')`),
  ],
);

/**
 * A member's shortlist: speciality + hospital options for one programme and quota,
 * starred while browsing (score finder, merit pages). Feeds the preference planner.
 * Names are as published in merit rounds; ids are filled when mapped.
 */
export const shortlistItems = pgTable(
  "shortlist_items",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    program: text("program").notNull(),
    quota: text("quota").notNull(),
    speciality: text("speciality").notNull(),
    hospital: text("hospital").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.program, t.quota, t.speciality, t.hospital] })],
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
