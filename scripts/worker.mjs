// The worker container's loop: once a minute, ask the app to do its background work
// (src/app/api/internal/tick/route.ts). Runs inside the app image; no extra build.
const url = process.env.TICK_URL ?? "http://app:3000/api/internal/tick";
const token = process.env.INTERNAL_TOKEN ?? "";
const every = Number(process.env.TICK_SECONDS ?? 60) * 1000;
if (token.length < 32) {
  console.error("worker: INTERNAL_TOKEN is not set (32+ characters); background jobs are off. Sleeping.");
  setInterval(() => {}, 1 << 30);
} else {
  let lastError = "";
  const tick = async () => {
    try {
      const r = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${token}` } });
      const body = await r.text();
      if (!r.ok) throw new Error(`HTTP ${r.status} ${body.slice(0, 200)}`);
      const j = JSON.parse(body);
      if (j.startedRuns > 0 || j.retentionRan) console.log(`worker: ${new Date().toISOString()} ${body}`);
      lastError = "";
    } catch (e) {
      const msg = String(e?.message ?? e);
      if (msg !== lastError) console.error(`worker: ${msg}`); // log each new problem once
      lastError = msg;
    } finally {
      setTimeout(tick, every);
    }
  };
  setTimeout(tick, 15_000); // let the app start first
  console.log(`worker: calling ${url} every ${every / 1000}s`);
}
