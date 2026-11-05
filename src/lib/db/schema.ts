import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
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
    /** The reply the asker (or a moderator) accepted as the answer. */
    acceptedPostId: uuid("accepted_post_id").references((): AnyPgColumn => discussionPosts.id, { onDelete: "set null" }),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    /** Closed as a duplicate of this thread. */
    duplicateOf: uuid("duplicate_of").references((): AnyPgColumn => discussionThreads.id, { onDelete: "set null" }),
    /** A live merit card (see MeritSnippet): rendered from the database, never typed numbers. */
    snippet: json("snippet"),
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
    snippet: json("snippet"),
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
  (t) => [primaryKey({ columns: [t.targetKind, t.targetId, t.userId] }), check("discussion_votes_kind", sql`${t.targetKind} in ('thread', 'post', 'review')`)],
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
    check("discussion_reports_kind", sql`${t.targetKind} in ('thread', 'post', 'review')`),
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

export const changeKind = pgEnum("change_kind", [
  "policy_activate",
  "policy_file_import",
  "seat_matrix_replace",
  "merit_round_replace",
  "merit_round_delete",
]);
export const changeStatus = pgEnum("change_status", ["pending", "published", "discarded", "rolled_back"]);

/**
 * Risky changes go through preview → publish. A change is staged with its input
 * (`payload`, personal fields stripped) and a computed before/after `preview`;
 * publishing applies it and keeps a `snapshot` of what it replaced, so it can be
 * rolled back. `baseline` fingerprints the data the preview was made against;
 * publishing is refused if it no longer matches.
 */
export const stagedChanges = pgTable(
  "staged_changes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: changeKind("kind").notNull(),
    /** What it affects, e.g. "induction:20:round:3", "seats:21", "policy:2026". */
    target: text("target").notNull(),
    title: text("title").notNull(),
    status: changeStatus("status").notNull().default("pending"),
    payload: json("payload").notNull(),
    preview: json("preview").notNull(),
    baseline: text("baseline").notNull(),
    snapshot: json("snapshot"),
    reason: text("reason").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    decidedBy: text("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionReason: text("decision_reason"),
  },
  (t) => [index("staged_changes_status_idx").on(t.status, t.createdAt), index("staged_changes_target_idx").on(t.target, t.decidedAt)],
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

// ── Sign-in (email one-time links) ─────────────────────────────────────────────

/** One-time sign-in links. Only the SHA-256 of the token is stored. */
export const loginTokens = pgTable(
  "login_tokens",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tokenHash: text("token_hash").notNull().unique(),
    email: text("email").notNull(),
    ipHash: text("ip_hash"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("login_tokens_email_idx").on(t.email, t.createdAt), index("login_tokens_ip_idx").on(t.ipHash, t.createdAt)],
);

/** Signed-in sessions. The cookie carries a random id; only its SHA-256 is stored. */
export const sessions = pgTable(
  "sessions",
  {
    idHash: text("id_hash").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** Development only: mail that would have been sent, shown at /dev/mailbox. */
export const devOutbox = pgTable("dev_outbox", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  to: text("to").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Candidate identities and account links ─────────────────────────────────────

/**
 * Keyed HMACs of each applicant's email and PMDC number, taken from merit-round
 * files at import. Raw values are never stored; the key is CANDIDATE_INDEX_SECRET.
 */
export const candidateIdentities = pgTable(
  "candidate_identities",
  {
    applicantId: text("applicant_id").primaryKey(),
    emailHmac: text("email_hmac"),
    pmdcHmac: text("pmdc_hmac"),
    lastInduction: integer("last_induction").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("candidate_identities_email_idx").on(t.emailHmac)],
);

export const candidateLinkStatus = pgEnum("candidate_link_status", ["pending", "verified", "rejected"]);
export const candidateLinkMethod = pgEnum("candidate_link_method", ["email", "manual"]);

/** An account's claim to an applicant record, verified automatically or by a verifier. */
export const candidateLinks = pgTable(
  "candidate_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    applicantId: text("applicant_id").notNull(),
    status: candidateLinkStatus("status").notNull(),
    method: candidateLinkMethod("method").notNull(),
    /** File name under <APP_STORAGE_DIR>/evidence/ (manual requests). */
    evidenceFile: text("evidence_file"),
    evidenceType: text("evidence_type"),
    /** The PMDC number entered matches the record's. A hint for the verifier, not proof. */
    pmdcMatches: boolean("pmdc_matches"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("candidate_links_verified_user_uq").on(t.userId).where(sql`status = 'verified'`),
    uniqueIndex("candidate_links_verified_applicant_uq").on(t.applicantId).where(sql`status = 'verified'`),
    uniqueIndex("candidate_links_pending_user_uq").on(t.userId).where(sql`status = 'pending'`),
    index("candidate_links_status_idx").on(t.status, t.createdAt),
  ],
);

// ── Follows and the in-app inbox ───────────────────────────────────────────────

export const followKind = pgEnum("follow_kind", ["induction", "round", "speciality", "hospital", "thread"]);
export const notificationKind = pgEnum("notification_kind", ["answer", "accepted", "new_thread", "new_round", "new_review"]);

/** What a member follows: a topic (same keys as discussion topics) or a thread (its id). */
export const follows = pgTable(
  "follows",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: followKind("kind").notNull(),
    key: text("key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.kind, t.key] }), index("follows_target_idx").on(t.kind, t.key)],
);

/** In-app inbox. No email is sent. */
export const notifications = pgTable(
  "notifications",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: notificationKind("kind").notNull(),
    title: text("title").notNull(),
    href: text("href").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt, t.createdAt)],
);

// ── Polls and hospital reviews ─────────────────────────────────────────────────

/** A poll attached to a question: one question, 2–6 options, one vote per member (changeable until it closes). */
export const discussionPolls = pgTable("discussion_polls", {
  threadId: uuid("thread_id").primaryKey().references(() => discussionThreads.id, { onDelete: "cascade" }),
  question: text("question").notNull(),
  closesAt: timestamp("closes_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const discussionPollOptions = pgTable(
  "discussion_poll_options",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    threadId: uuid("thread_id").notNull().references(() => discussionPolls.threadId, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    label: text("label").notNull(),
  },
  (t) => [uniqueIndex("discussion_poll_options_pos_uq").on(t.threadId, t.position)],
);

export const discussionPollVotes = pgTable(
  "discussion_poll_votes",
  {
    threadId: uuid("thread_id").notNull().references(() => discussionPolls.threadId, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    optionId: integer("option_id").notNull().references(() => discussionPollOptions.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.threadId, t.userId] }), index("discussion_poll_votes_option_idx").on(t.optionId)],
);

/**
 * Structured reviews of a hospital (optionally one speciality there) by verified
 * candidates: four 1–5 ratings (higher is better) and a short text. One per
 * author per hospital + speciality; editing replaces it.
 */
export const hospitalReviews = pgTable(
  "hospital_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hospitalId: integer("hospital_id").notNull().references(() => hospitals.id),
    specialityId: integer("speciality_id").references(() => specialities.id),
    authorId: uuid("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    induction: integer("induction").notNull(),
    training: integer("training").notNull(),
    workload: integer("workload").notNull(),
    hostel: integer("hostel").notNull(),
    stipend: integer("stipend").notNull(),
    body: text("body").notNull(),
    status: discussionStatus("status").notNull().default("visible"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("hospital_reviews_author_uq").on(t.authorId, t.hospitalId, sql`coalesce(${t.specialityId}, 0)`),
    index("hospital_reviews_hospital_idx").on(t.hospitalId, t.status),
    index("hospital_reviews_speciality_idx").on(t.specialityId, t.status),
    check("hospital_reviews_ratings", sql`${t.training} between 1 and 5 and ${t.workload} between 1 and 5 and ${t.hostel} between 1 and 5 and ${t.stipend} between 1 and 5`),
  ],
);
