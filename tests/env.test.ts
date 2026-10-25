import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";

describe("environment validation", () => {
  it("runs with no database configured", () => {
    expect(parseEnv({ NODE_ENV: "development" }).DATABASE_URL).toBeUndefined();
  });

  it("treats empty values as unset", () => {
    expect(parseEnv({ NODE_ENV: "development", DATABASE_URL: "" }).DATABASE_URL).toBeUndefined();
  });

  it("refuses the dev auth stub in production", () => {
    expect(() => parseEnv({ NODE_ENV: "production", DEV_AUTH_STUB_ROLE: "admin" })).toThrow(/DEV_AUTH_STUB_ROLE/);
  });

  it("does not echo secret values in errors", () => {
    try {
      parseEnv({ DATABASE_URL: "mysql://user:s3cret@host/db" });
      expect.unreachable();
    } catch (e) {
      expect(String(e)).toContain("DATABASE_URL");
      expect(String(e)).not.toContain("s3cret");
    }
  });
});
