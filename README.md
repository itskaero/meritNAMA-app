# meritNAMA-app

**Private.** The MeritNama application: candidate portal, admin workspace, induction
data management and simulation. Designed to self-host on a NAS with Docker Compose.

The public website lives in the separate public repository `itskaero/meritnama`
and only links here. Never copy this source into that repository.

> **Status: scaffold (delivery 1).** Routes, guards, schema, containers and tests are
> real; features are labelled placeholders. **Authentication is not integrated** —
> without the development stub every guarded route redirects to `/sign-in`.
> See `docs/ARCHITECTURE.md` and the public repo's `docs/IMPLEMENTATION_ROADMAP.md`.

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
DEV_AUTH_STUB_ROLE=admin npm run dev              # http://localhost:3000
```

`DEV_AUTH_STUB_ROLE` (`candidate` | `admin`) fakes a signed-in user so guarded pages
can be built before real auth exists. It is shown as a **Dev stub** badge and the app
refuses to start with it when `NODE_ENV=production`.

| Command | Does |
|---|---|
| `npm run dev` | Dev server |
| `npm run check` | Lint + typecheck + unit tests |
| `npm test` | Unit tests; add `TEST_DATABASE_URL=…` to include DB integration tests (use a disposable DB) |
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

Full NAS guide: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Environment

See [.env.example](.env.example). Required in containers: `POSTGRES_PASSWORD`.
Recommended: `APP_URL`, `PUBLIC_SITE_ORIGIN`, `MERITNAMA_DATA_DIR`, `APP_PORT`.

## Layout

```
src/app/            routes — (auth)/sign-in, portal/*, admin/*, api/health
src/components/     AppShell, SideNav, PlaceholderPage, ui/* primitives
src/lib/auth/       roles + server-side session/guards (provider not yet integrated)
src/lib/data/       data-access boundary — every function re-checks the role
src/lib/db/         Drizzle schema + lazy client + DB health check
src/lib/domain/     data contracts (scoring policy)
src/lib/navigation  single source for sections and their planned scope
src/styles/tokens.css  copy of the public site's design tokens
drizzle/            generated SQL migrations (commit these)
scripts/            migrate.mjs, backup.sh, restore.sh
deploy/Caddyfile    optional reverse proxy
docs/               ARCHITECTURE, DEPLOYMENT, SECURITY, DATA_CONTRACTS
```
