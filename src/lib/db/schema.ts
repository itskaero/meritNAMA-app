import { sql } from "drizzle-orm";
import {
  bigserial,
  check,
  index,
  integer,
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
 * Initial schema. Deliberately small: only entities whose shape is already
 * known from the existing data. Candidate records, merit lists, gazette seats
 * and reference data (hospitals, specialties, quotas) arrive in delivery 2
 * once their contracts are mapped — see docs/DATA_CONTRACTS.md.
 */

export const userRole = pgEnum("user_role", ["candidate", "admin"]);
export const inductionStatus = pgEnum("induction_status", ["planned", "active", "completed"]);
export const policyStatus = pgEnum("policy_status", ["draft", "active", "retired"]);
export const auditResult = pgEnum("audit_result", ["success", "failure"]);

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
