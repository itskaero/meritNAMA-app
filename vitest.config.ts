import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // `server-only` throws outside a React Server environment; tests import server modules directly.
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Integration suites share one disposable database and clean up shared tables
    // (lookups, rounds), so run files one at a time when a test database is set.
    fileParallelism: !process.env.TEST_DATABASE_URL,
  },
});
