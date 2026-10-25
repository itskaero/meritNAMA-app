// Runs once when the server starts: refuse to boot with invalid configuration
// (e.g. the development auth stub enabled in production) instead of failing per request.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { env } = await import("@/lib/env");
    env();
  }
}
