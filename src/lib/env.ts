import "server-only";
import { z } from "zod";

const ROLES = ["candidate", "admin"] as const;

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
    /**
     * DEVELOPMENT ONLY. Pretend a user with this role is signed in so the guarded
     * routes can be built before real authentication exists. Rejected in production.
     */
    DEV_AUTH_STUB_ROLE: z.enum(ROLES).optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && env.DEV_AUTH_STUB_ROLE) {
      ctx.addIssue({
        code: "custom",
        path: ["DEV_AUTH_STUB_ROLE"],
        message: "DEV_AUTH_STUB_ROLE must not be set in production",
      });
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
