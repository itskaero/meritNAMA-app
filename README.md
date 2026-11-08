# meritNAMA-app

**Private.** The MeritNama application: candidate portal, admin workspace, induction
data management and simulation. Designed to self-host on a NAS with Docker Compose.

The public website lives in the separate public repository `itskaero/meritnama`
and only links here. Never copy this source into that repository.

> **Status: feature-complete for the candidate portal and admin workspace; release
> hardening in progress.** Remaining work is listed under [What is left](#what-is-left).

## What it does

**Candidates** sign in with an emailed link (or Google, if configured) and verify their
merit record. They get: a dashboard of the current cycle; merit lists and history with
closing merit by round; a score finder (where marks would have reached) with
next-round predictions; a merit calculator for any scoring policy; a preference planner;
a **what-if simulation** (change their own consent on a list and simulate the next one);
hospital and speciality pages with reviews; and a community with Q&A, polls and an inbox.

**Staff**, by role (data editor, policy editor, verifier, moderator, owner): a
work-queue home; candidate records (verification, search, marks per programme and
preference, consent, staged corrections with a reason, possible duplicates, CSV export
and corrections import); merit rounds, seats and reference data (uploads or a watched
folder on the NAS); versioned scoring policies and allocation rules, each with an
**impact preview** (round 1 simulated under the change, compared with now);
**simulation** of round 1 and of each next round from the published list and consent,
compared with what PHF published, with downloadable outputs; risky changes previewed
before publishing, with rollback; community moderation; the audit history; team and
roles, candidate feature switches, data retention and backup status.

**Simulation accuracy** on induction 21 (real data, back-tested): round 1 reproduces
98.9% of PHF's allocations; each later round 96–99%. Details and the rules behind them
are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#calculation-and-simulation-engines).

## Stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 4 ·
PostgreSQL 17 · Drizzle ORM + SQL migrations · zod · Vitest · Docker Compose.

## Local development

Requires Node ≥ 22.12 and Docker.

```bash
cp .env.example .env                              # set POSTGRES_PASSWORD and DATABASE_URL
docker compose -f docker-compose.dev.yml up -d    # Postgres on 127.0.0.1:5432
npm ci
npm run db:migrate
DEV_AUTH_STUB_ROLE=owner npm run dev              # http://localhost:3000
```

`DEV_AUTH_STUB_ROLE` (`candidate`, `data_editor`, `policy_editor`, `verifier`,
`moderator` or `owner`) signs you in as that role without email. It is shown as a
**Dev stub** badge and the app refuses to start with it when `NODE_ENV=production`.
Without it, sign in at `/sign-in`: in development the link appears at `/dev/mailbox`.

| Command | Does |
|---|---|
| `npm run dev` | Dev server |
| `npm run check` | Lint + typecheck + unit tests |
| `npm test` | Unit tests; add `TEST_DATABASE_URL=…` to include DB integration tests (use a disposable DB) |
| `UPDATE_AUTHZ_MATRIX=1 npx vitest run tests/authz-matrix.test.ts` | Accept a reviewed change to who may call which data function |
| `node scripts/golden/legacy-engine.mjs <legacy checkout>` | Regenerate the engine's golden files from the legacy simulator (rarely) |
| `npm run build` | Production build (`.next/standalone`) |
| `npm run db:generate` | New SQL migration from `src/lib/db/schema.ts` changes |
| `npm run db:migrate` | Apply migrations to `DATABASE_URL` |

## Containers

```bash
cp .env.example .env          # set a strong POSTGRES_PASSWORD
docker compose up -d --build  # db → migrate (one-shot) → app on 127.0.0.1:${APP_PORT}
curl -s http://127.0.0.1:3000/api/health
docker compose --profile proxy up -d   # optional Caddy HTTPS proxy (set MERITNAMA_DOMAIN)
scripts/backup.sh                      # pg_dump + storage archive under $MERITNAMA_DATA_DIR/backups
scripts/restore.sh <backup-dir>
```

One-command NAS install: download and install with one `curl` (see the top of [docs/NAS-SETUP.md](docs/NAS-SETUP.md)), or `sudo ./meritnama.sh install` from a checkout. Step-by-step setup at meritnama.online: [docs/NAS-SETUP.md](docs/NAS-SETUP.md). Reference for updates, backups and restores: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Environment

See [.env.example](.env.example). Required in production: `POSTGRES_PASSWORD`,
`SMTP_URL` (sign-in links), `CANDIDATE_INDEX_SECRET` (record matching), and
`OWNER_EMAILS` for the first owner. Recommended: `APP_URL`, `PUBLIC_SITE_ORIGIN`,
`MERITNAMA_DATA_DIR`, `APP_PORT`. Optional: `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`.

## Layout

```
src/app/            routes — (auth)/sign-in, portal/*, admin/*, api/health
src/proxy.ts        per-request Content Security Policy; sign-in redirect
src/components/     AppShell, SideNav, charts, what-if, ui/* primitives
src/lib/auth/       roles → capabilities, sessions, email links, Google sign-in
src/lib/data/       data-access boundary — every function checks the caller (tests/authz-matrix.test.ts)
src/lib/db/         Drizzle schema + lazy client + DB health check
src/lib/domain/     data contracts and pure helpers (policies, merit files, simulation inputs)
src/lib/engine/     marks, round-1 placement, next-round cascade, rules, merit calculator
src/lib/navigation  single source for sections
src/styles/tokens.css  design tokens, light and dark (docs/DESIGN.md)
drizzle/            generated SQL migrations (commit these)
scripts/            migrate.mjs, backup.sh, restore.sh, golden/ (legacy parity generators)
deploy/Caddyfile    optional reverse proxy
docs/               ARCHITECTURE, DESIGN, DEPLOYMENT, SECURITY, DATA_CONTRACTS
```

## What is left

Needs the operator, a decision or access this repository does not have:

- **NAS rehearsal:** fresh install, update, rollback and the restore drill on the NAS
  itself (the steps are in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md); backup → restore
  was verified in development).
- **Cut-over:** point the public site at the app and remove the legacy app pages and
  datasets from the public repository; finish the public-repo security items in
  [docs/SECURITY.md](docs/SECURITY.md) (history purge, Firestore rules) if not done.
- **Grievance status** and a **publication monitor** (alert when PHF publishes a list)
  need a source to read from: where grievance decisions are published, and which PHF
  page or feed to watch.
- **Separate worker container** for simulation runs, only if runs grow well beyond
  their current few seconds (round 1 of induction 21 takes about 2 s).

Done in this round: accessibility and mobile audit (axe-core on 31 pages at desktop and
phone width: no findings, no sideways scrolling), shortlist alerts, a printable merit
report (print or save as PDF from the browser).
