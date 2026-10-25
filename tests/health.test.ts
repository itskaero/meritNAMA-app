import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

async function callHealth(env: Record<string, string>) {
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  const { GET } = await import("@/app/api/health/route");
  return GET();
}

describe("GET /api/health", () => {
  it("is healthy without a database and reports it as not configured", async () => {
    const res = await callHealth({ DATABASE_URL: "" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", database: "not_configured" });
  });

  it("returns 503 when the configured database is unreachable", async () => {
    const res = await callHealth({ DATABASE_URL: "postgres://x:y@127.0.0.1:1/none" });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ status: "degraded", database: "unreachable" });
  });

  it("allows only the configured public-site origin", async () => {
    const res = await callHealth({ DATABASE_URL: "", PUBLIC_SITE_ORIGIN: "https://itskaero.github.io" });
    expect(res.headers.get("access-control-allow-origin")).toBe("https://itskaero.github.io");
  });
});
