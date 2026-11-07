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
| `SMTP_URL` | Your mail provider, e.g. `smtps://user:pass@smtp.example.org:465` (sign-in links) |
| `MAIL_FROM` | Sender shown on sign-in emails, e.g. `meritNAMA <no-reply@example.org>` |
| `OWNER_EMAILS` | Your own email: it becomes owner on first sign-in. Owners give others roles on Team & roles. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional "Continue with Google". In Google Cloud Console → APIs & Services → Credentials, create an OAuth client of type *Web application* with the redirect URI `<APP_URL>/auth/google/callback`. Leave both empty to offer email links only. |
| `CANDIDATE_INDEX_SECRET` | `openssl rand -base64 48 \| tr -d '/+='`. Keep it with your backups; changing it needs a re-index. |
| `DEV_AUTH_STUB_ROLE` | **leave empty** — the app will not serve pages with it set |

```bash
docker compose up -d --build
docker compose ps                     # db healthy, migrate exited 0, app healthy
curl -s http://127.0.0.1:3000/api/health   # {"status":"ok","database":"ok"}
```

If merit rounds were imported before candidate accounts existed, index them once so
sign-in emails can be matched (the files moved to `storage/inbox/processed/` work;
run it from the folder with `.env`, after `set -a; . ./.env; set +a`):

```bash
docker compose run --rm \
  -e CANDIDATE_INDEX_SECRET -v "$MERITNAMA_DATA_DIR/storage:/storage:ro" \
  migrate node scripts/index-candidates.mjs /storage/inbox/processed
```

Startup order is enforced: `db` (healthy) → `migrate` (one-shot, must exit 0) → `app`.

State on disk:

```
$MERITNAMA_DATA_DIR/
  postgres/   database files   (only the db container touches these)
  storage/    approved data files, generated reports
    evidence/   proof documents from candidates (verifiers only)
    inbox/      drop new data files here (see "Importing from the inbox")
  backups/    output of scripts/backup.sh
  caddy/      certificates (only with the proxy profile)
```

Containers themselves are disposable; nothing important lives in image layers.

### Importing from the inbox

Import past inductions too (every round file you have): next-round predictions learn from how closing merit moved in earlier cycles, and get more confident with more of them. Round files without allocations (PHF publishes empty shells before a round) are refused and can be skipped.

New data files can be copied onto the NAS instead of uploaded through a browser.
The app creates these folders on first use of the admin pages:

```
$MERITNAMA_DATA_DIR/storage/inbox/
  merit/      round_<n>.json (also i20_round_6.json …): merit rounds; the induction is read from the file
  seats/      induction<n>_seats.json: seat matrices
  policy/     scoring_policy.json
  processed/  where files go after Import or Skip, prefixed with a UTC timestamp
```

- Admin home → **Files in the inbox** (or Inductions & merit lists → Inbox) lists every
  file with its validation result. **Import** applies new data at once; a file that
  would replace existing data is staged under **Changes to review** for a preview first.
- Only names matching a folder's pattern are opened; anything else is listed as "not
  recognised". Symlinks and files over 3 MB are refused.
- The app runs as the image's `node` user (uid 1000). It must be able to read the
  files and move them to `processed/`:
  `sudo chown -R 1000:1000 "$MERITNAMA_DATA_DIR/storage"`.
- `processed/` is kept, and backed up with the rest of `storage/`. Delete old files
  from it whenever you like.

### Simulation data (restricted)

Candidate marks and portal preferences are personal data and never go through the
inbox, a browser upload or the repository. Your backend writes them onto the NAS,
one folder per induction:

```
$MERITNAMA_DATA_DIR/storage/simulation/induction22/
  marks.json          required: one row per candidate
  preferences.json    required: one row per preference (as set on the official portal)
  certificates.json   optional: certificate marks
  ProfileStatus.json  optional but needed for realistic results (or profile_status.json)
  components.json     optional: corrected marks (override marks.json)
  consent_round1.json consent replies fetched from the portal after round 1, then round 2 …
```

Names may carry the induction (`induction22_marks.json` …). Field names are the
portal's:

```jsonc
// marks.json
[{ "applicantId": 27267, "marksTotal": 21.85,
   "programMarks": { "FCPS": 5 },                  // optional, per-programme marks
   "applied_in": { "FCPS": true, "MS": false },    // optional
   "profileStatus": 1 }]                           // optional: 1 Accepted, 2 Rejected, 11 Pending
// preferences.json
[{ "applicantId": 27267, "typeName": "FCPS", "typeId": 1, "preferenceNo": 1,
   "quotaName": "Punjab", "specialityId": 2, "hospitalName": "Mayo Hospital, Lahore",
   "disciplineIds": [2], "programMarks": 5, "marks": 0 }]   // marks = parent-institute bonus
// certificates.json
{ "27267": [{ "disciplineId": 2, "typeId": 1, "status": "Pass",
              "certificateMarks": 5, "computerizedMarks": 4 }] }
```

Both marks.json and preferences.json may instead be objects keyed by applicant id;
certificates.json may be a list of rows with `applicantId`. Extra fields (names,
emails …) are ignored and never stored. A legacy combined `candidates.json` is still
accepted in place of marks.json + preferences.json. Preferences of applicants missing
from marks.json are left out and counted on the page.

```bash
mkdir -p "$MERITNAMA_DATA_DIR/storage/simulation/induction22"
sudo chown -R 1000:1000 "$MERITNAMA_DATA_DIR/storage/simulation"
chmod -R go-rwx "$MERITNAMA_DATA_DIR/storage/simulation"
```

```jsonc
// consent_round<r>.json (as fetched from the portal; name and marks are ignored)
[{ "applicantId": 27267, "program": "FCPS", "quota": "Punjab", "preferenceNo": 3,
   "infoTitle": "FCPS - Punjab - Medicine - Mayo Hospital, Lahore", "status": "Accepted" }]  // or Rejected / Awaited
```

After the portal publishes a round's consent, drop its file in the folder and click
**Import consent files** (the large files are not re-read). Each round with consent
and its published list imported offers **Simulate round r+1**.

Then **Processing & simulation** → Import. Only marks, preferences, certificate marks
and profile status are stored in the database; names, PMDC numbers, emails, phone
numbers and CNICs are dropped. The files stay in the folder (and in backups of
`storage/`); delete them once imported if you do not need to re-import. Files up to
200 MB are accepted. **Simulate round 1** runs in the background (seconds for one
induction) and compares the result with the published round 1 when it is imported.

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
- Team & roles shows the newest backups and warns when the latest is more than a day
  old. Compose mounts `backups/` read-only into the app as `/app/backups`
  (`APP_BACKUP_DIR`); the app cannot see off-site copies.

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
