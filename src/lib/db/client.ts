import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

let sqlClient: ReturnType<typeof postgres> | undefined;
let db: Database | undefined;

/** Lazily created so pages that do not touch the database work without DATABASE_URL. */
export function getDb(): Database {
  const url = env().DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  sqlClient ??= postgres(url, { max: 10, idle_timeout: 30, connect_timeout: 5 });
  db ??= drizzle(sqlClient, { schema });
  return db;
}

export type DbStatus = "ok" | "unreachable" | "not_configured";

export async function checkDatabase(timeoutMs = 2000): Promise<DbStatus> {
  if (!env().DATABASE_URL) return "not_configured";
  try {
    getDb();
    await Promise.race([
      sqlClient!`select 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs)),
    ]);
    return "ok";
  } catch {
    return "unreachable";
  }
}
