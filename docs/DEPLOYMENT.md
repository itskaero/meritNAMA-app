# Deployment — self-hosting on a NAS

Works on any Linux host or NAS that runs Docker Engine with Compose v2 (amd64 or
arm64). Nothing here assumes a particular NAS vendor. Budget ~1 GB RAM for app + DB.

## 1. First install

```bash
git clone <private repo URL> meritnama-app && cd meritnama-app
cp .env.example .env
chmod 600 .env
```

Edit `.env`:

| Variable | Set to |
|---|---|
| `POSTGRES_PASSWORD` | `openssl rand -base64 32 \| tr -d '/+='` (letters/digits keep the URL valid) |
| `MERITNAMA_DATA_DIR` | A path on a redundant, backed-up volume, e.g. `/volume1/meritnama` |
| `APP_URL` | The URL users will open, e.g. `https://app.example.org` |
| `PUBLIC_SITE_ORIGIN` | `https://itskaero.github.io` (lets the public site probe `/api/health`) |
| `APP_PORT` | Host port, default `3000` (bound to 127.0.0.1) |
| `DEV_AUTH_STUB_ROLE` | **leave empty** — the app will not serve pages with it set |

```bash
docker compose up -d --build
docker compose ps                     # db healthy, migrate exited 0, app healthy
curl -s http://127.0.0.1:3000/api/health   # {"status":"ok","database":"ok"}
```

Startup order is enforced: `db` (healthy) → `migrate` (one-shot, must exit 0) → `app`.

State on disk:

```
$MERITNAMA_DATA_DIR/
  postgres/   database files   (only the db container touches these)
  storage/    approved data files, generated reports
  backups/    output of scripts/backup.sh
  caddy/      certificates (only with the proxy profile)
```

Containers themselves are disposable; nothing important lives in image layers.

## 2. Network exposure

**Do not port-forward the app straight to the internet.** The compose file binds the
app to `127.0.0.1`, and Postgres is on an internal-only network with no published port.

Pick one:

- **VPN only (recommended to start):** WireGuard or Tailscale on the NAS; users
  connect to the VPN and open the app. No inbound ports. If you use this, leave the
  public site's `appHealthUrl` empty.
- **Tunnel:** an outbound tunnel (e.g. Cloudflare Tunnel) to `127.0.0.1:3000` —
  no inbound ports, TLS at the edge; add an access policy for admin paths.
- **Reverse proxy with HTTPS:** `docker compose --profile proxy up -d` starts Caddy on
  80/443 with automatic certificates for `MERITNAMA_DOMAIN` (needs a public DNS name
  and forwarded 80/443). Your NAS's built-in reverse proxy works too — forward to
  `127.0.0.1:3000` and enable HSTS.

Whatever you choose: HTTPS only, keep the NAS OS and Docker updated, and restrict the
NAS admin UI to the LAN/VPN.

## 3. Updates

```bash
scripts/backup.sh                      # always back up first
git pull
docker compose up -d --build           # migrate runs before the new app starts
docker compose ps && curl -s http://127.0.0.1:3000/api/health
```

### Rollback

```bash
git checkout <previous tag or commit>
docker compose up -d --build
```

Migrations are forward-only. If the release you are rolling back from changed the
schema, restore the backup taken before the update (below) instead of only switching
code. Tag every release you deploy (`git tag deploy-YYYYMMDD`).

## 4. Backups

```bash
scripts/backup.sh
```

Writes `$MERITNAMA_DATA_DIR/backups/meritnama-<UTC>/` with `database.dump`
(`pg_dump -Fc`, consistent while running), `storage.tar.gz` and `SHA256SUMS`.

- Schedule it daily (NAS task scheduler or cron), e.g. `0 3 * * * cd /path && scripts/backup.sh`
- Copy backups **off the NAS** (second disk, another site, encrypted cloud) — a
  backup on the same volume does not survive volume loss.
- Prune old ones (e.g. keep 14 daily, 8 weekly).
- Do not rely on copying `postgres/` while the DB is running.

## 5. Restore

```bash
scripts/restore.sh $MERITNAMA_DATA_DIR/backups/meritnama-<UTC>
```

Verifies checksums, asks you to type `restore`, stops the app, restores the database
(`pg_restore --clean`), restores storage (old copy kept as `storage.restore-old`),
restarts the app. **Rehearse this** on a spare machine at least once per quarter.

Verified in development (25 Oct 2026): backup → delete a row → restore brought the
row back and health returned ok.

## 6. Health and logs

- `GET /api/health` → 200 `{"status":"ok","database":"ok"|"not_configured"}` or
  503 `{"status":"degraded","database":"unreachable"}`. Used by the container
  healthcheck and the public site's availability notice. Reports no versions or hosts.
- `docker compose logs -f app` / `db`. Logs must not contain secrets or candidate
  data; report it as a bug if they do.
