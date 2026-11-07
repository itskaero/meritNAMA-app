import "server-only";
import { z } from "zod";

// Role names accepted by the dev stub; "admin" is the legacy name for "owner".
const ROLES = ["candidate", "data_editor", "policy_editor", "verifier", "moderator", "owner", "admin"] as const;

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    /** Postgres connection string. Optional so the UI scaffold runs without a database. */
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }).optional(),
    /** Canonical public URL of this app, e.g. https://app.example.org */
    APP_URL: z.url().default("http://localhost:3000"),
    /** Origin of the public website allowed to call /api/health cross-origin. */
    PUBLIC_SITE_ORIGIN: z.url().optional(),
    /** Mounted persistent directory for approved data files and generated reports. */
    APP_STORAGE_DIR: z.string().min(1).default("./var/storage"),
    /** Where scripts/backup.sh writes (mounted read-only into the app), for the backup status on Team & roles. */
    APP_BACKUP_DIR: z.string().min(1).default("./var/backups"),
    /**
     * DEVELOPMENT ONLY. Pretend a user with this role is signed in so the guarded
     * routes can be built before real authentication exists. Rejected in production.
     */
    DEV_AUTH_STUB_ROLE: z.enum(ROLES).optional(),
    /** SMTP server for sign-in links, e.g. smtps://user:pass@smtp.example.org:465. Required in production. */
    SMTP_URL: z.url({ protocol: /^smtps?$/ }).optional(),
    /** Sender of sign-in links, e.g. "meritNAMA <no-reply@example.org>". */
    MAIL_FROM: z.string().min(3).default("meritNAMA <no-reply@localhost>"),
    /** Comma-separated emails that become owners on their first sign-in. */
    OWNER_EMAILS: z.string().default(""),
    /**
     * Key for the HMACs of candidates' emails and PMDC numbers (32+ characters).
     * Required in production; changing it means re-indexing (npm run index:candidates).
     */
    CANDIDATE_INDEX_SECRET: z.string().min(32).optional(),
    /** Google sign-in (optional). Both or neither; the button shows only when set. */
    GOOGLE_CLIENT_ID: z.string().regex(/^[\w.-]+\.apps\.googleusercontent\.com$/, "must be a Google OAuth client ID").optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(10).optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && env.DEV_AUTH_STUB_ROLE) {
      ctx.addIssue({
        code: "custom",
        path: ["DEV_AUTH_STUB_ROLE"],
        message: "DEV_AUTH_STUB_ROLE must not be set in production",
      });
    }
    if (env.NODE_ENV === "production" && !env.SMTP_URL) {
      ctx.addIssue({ code: "custom", path: ["SMTP_URL"], message: "SMTP_URL is required in production (sign-in links are sent by email)" });
    }
    if (Boolean(env.GOOGLE_CLIENT_ID) !== Boolean(env.GOOGLE_CLIENT_SECRET)) {
      ctx.addIssue({ code: "custom", path: ["GOOGLE_CLIENT_SECRET"], message: "Set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or neither" });
    }
    if (env.NODE_ENV === "production" && !env.CANDIDATE_INDEX_SECRET) {
      ctx.addIssue({ code: "custom", path: ["CANDIDATE_INDEX_SECRET"], message: "CANDIDATE_INDEX_SECRET is required in production" });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  // Treat empty strings from .env files as unset.
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined && v !== ""));
  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    // Report variable names only — never echo values, which may be secrets.
    const names = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${names}`);
  }
  return result.data;
}

let cached: Env | undefined;
export function env(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
