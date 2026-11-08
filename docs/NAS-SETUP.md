# Setting up meritNAMA on a NAS at meritnama.online

A step-by-step guide from an empty NAS to `https://meritnama.online`. It complements
[DEPLOYMENT.md](DEPLOYMENT.md), which is the reference for updates, backups and
restores. Commands are run over SSH on the NAS. Where a NAS vendor differs, Synology
is the example; QNAP (Container Station), TrueNAS SCALE and Unraid work the same way
once Docker Compose is available.

**Time:** about an hour, most of it waiting for the first build.

---

## 0. What you need

- A NAS with Docker and Compose v2 (Synology DSM 7.2+ with *Container Manager*;
  QNAP *Container Station*; TrueNAS SCALE; Unraid), 2 GB of free RAM and ~10 GB of
  disk. Intel/AMD or 64-bit ARM.
- SSH access to the NAS as an administrator.
- The domain **meritnama.online**, with access to its registrar.
- A free **Cloudflare** account (recommended way in, step 5A).
- An **email sending** account for sign-in links (step 3), e.g. Brevo, Zoho Mail,
  Resend, Amazon SES or your host's SMTP.
- Access to the private GitHub repository `itskaero/meritNAMA-app`.

## 1. Prepare the NAS

1. Install Docker: on Synology, *Package Center → Container Manager*.
2. Turn on SSH: *Control Panel → Terminal & SNMP → Enable SSH service*.
3. Create two shared folders (keep them on a redundant volume):
   - `docker`: the code will live in `/volume1/docker/meritnama`
   - `meritnama-data`: database, files and backups, `/volume1/meritnama-data`
4. Connect and check Docker:

   ```bash
   ssh admin@<nas-ip>
   sudo -i
   docker version && docker compose version
   ```

   If `docker compose` is not found on an older DSM, use `docker-compose` with the same arguments
   everywhere below.

## 2. Get the code

The repository is private, so use a GitHub personal access token with read access to
`itskaero/meritNAMA-app` (GitHub → Settings → Developer settings → Fine-grained tokens).

```bash
cd /volume1/docker
git clone https://github.com/itskaero/meritNAMA-app.git meritnama
# Prompted for a password: paste the token.
cd meritnama
```

No `git` on the NAS? Run it from a container instead:

```bash
docker run --rm -it -v /volume1/docker:/git alpine/git clone https://github.com/itskaero/meritNAMA-app.git /git/meritnama
```

## 3. Set up email for sign-in links

meritNAMA signs people in with a one-time link by email, so this must work before
anyone can log in.

1. In your mail provider, add the domain `meritnama.online` and create SMTP
   credentials.
2. Add the DNS records it gives you (do this in Cloudflare after step 5, or at your
   registrar now): **SPF** (TXT on `meritnama.online`), **DKIM** (TXT or CNAME), and a
   **DMARC** record such as `_dmarc` TXT `v=DMARC1; p=quarantine; rua=mailto:you@meritnama.online`.
   Without them, sign-in emails land in spam.
3. Note the SMTP URL in this form (password URL-encoded if it has symbols):
   `smtps://USERNAME:PASSWORD@smtp.provider.com:465`, or
   `smtp://USERNAME:PASSWORD@smtp.provider.com:587` for STARTTLS.

## 4. Fill in `.env`

```bash
cp .env.example .env
chmod 600 .env
openssl rand -base64 32 | tr -d '/+='   # → POSTGRES_PASSWORD
openssl rand -base64 48 | tr -d '/+='   # → CANDIDATE_INDEX_SECRET
vi .env                                  # or: nano .env
```

Set these (everything else can stay as it is):

```ini
POSTGRES_PASSWORD=<first generated value>
APP_URL=https://meritnama.online
MERITNAMA_DOMAIN=meritnama.online
PUBLIC_SITE_ORIGIN=
SMTP_URL=smtps://USERNAME:PASSWORD@smtp.provider.com:465
MAIL_FROM="meritNAMA <no-reply@meritnama.online>"
OWNER_EMAILS=<your own email address>
CANDIDATE_INDEX_SECRET=<second generated value>
MERITNAMA_DATA_DIR=/volume1/meritnama-data
APP_PORT=3000
DEV_AUTH_STUB_ROLE=
```

- `APP_URL` must be exactly `https://meritnama.online` (no trailing slash): sign-in
  links and Google's redirect are built from it.
- `PUBLIC_SITE_ORIGIN` only matters if the old GitHub Pages site stays up and probes
  this app's health; the app now serves its own homepage, so leave it empty.
- **Keep a copy of `.env` somewhere safe** (a password manager). Losing
  `CANDIDATE_INDEX_SECRET` means re-indexing candidates; losing `POSTGRES_PASSWORD`
  locks you out of the database files.

Optional, "Continue with Google": in Google Cloud Console → APIs & Services →
Credentials, create an OAuth client (*Web application*), add the authorised redirect
URI `https://meritnama.online/auth/google/callback`, and set `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET`.

## 5. Put meritnama.online on the internet

First move the domain's DNS to Cloudflare: *Cloudflare → Add a site →
meritnama.online → Free plan*, then at your registrar replace the nameservers with
the two Cloudflare gives you. Wait until Cloudflare shows the site as **Active**
(minutes to a few hours).

Then choose **one** of these.

### 5A. Cloudflare Tunnel (recommended)

Nothing is opened on your router, it works behind CGNAT and dynamic IPs, and HTTPS is
handled by Cloudflare.

1. *Cloudflare dashboard → Zero Trust → Networks → Tunnels → Create a tunnel →
   Cloudflared*. Name it `meritnama-nas`.
2. On the "Install connector" screen, copy the **token** (the long string after
   `--token`) and put it in `.env`:

   ```ini
   CLOUDFLARE_TUNNEL_TOKEN=<token>
   ```

3. Add **Public hostnames** to the tunnel:
   - `meritnama.online` → Service **HTTP** → URL `app:3000`
   - `www.meritnama.online` → Service **HTTP** → URL `app:3000`

   (`app` is the container's name inside Docker; the tunnel container runs next to it.)
4. In Cloudflare for meritnama.online: *SSL/TLS → Edge Certificates → Always Use
   HTTPS: On*, and *Rules → Redirect Rules → Create from template "Redirect from WWW to
   root"* so `www.` goes to `https://meritnama.online`.
5. Optional extra lock on the admin area: *Zero Trust → Access → Applications → Add
   → Self-hosted*, domain `meritnama.online`, path `admin`, policy *Allow → Emails →
   your staff addresses*. The app still requires its own sign-in and role.

Start with: `docker compose --profile tunnel up -d --build` (step 6).

### 5B. Port forwarding with HTTPS on the NAS

Use this only if you cannot use a tunnel. You need a public IPv4 address (not CGNAT).

1. Cloudflare DNS: an **A** record `meritnama.online` → your public IP, and a
   **CNAME** `www` → `meritnama.online`. Set both to **DNS only** (grey cloud) while
   the certificate is issued. If your IP changes, set up DDNS (Synology:
   *Control Panel → External Access → DDNS*, or Cloudflare's API).
2. Router: forward TCP **80** and **443** to the NAS.
3. Synology already listens on 80/443, so use its reverse proxy instead of Caddy:
   - *Control Panel → Security → Certificate → Add → Let's Encrypt* for
     `meritnama.online` (subject alternative name `www.meritnama.online`).
   - *Control Panel → Login Portal → Advanced → Reverse Proxy → Create*:
     source **HTTPS**, host `meritnama.online`, port 443, HSTS on → destination
     **HTTP**, `localhost`, port `3000`. Repeat for `www.meritnama.online`.
   - Assign the certificate to both entries (*Certificate → Settings*).

   On a NAS where 80/443 are free, use the bundled Caddy instead:
   `docker compose --profile proxy up -d --build`. It gets certificates for
   `MERITNAMA_DOMAIN` automatically and redirects `www.` to it.
4. Keep the NAS's own admin page (DSM, port 5000/5001) **off** the internet:
   don't forward those ports.

## 6. Build and start

```bash
cd /volume1/docker/meritnama
docker compose --profile tunnel up -d --build     # 5A
# or: docker compose up -d --build                # 5B with the NAS reverse proxy
# or: docker compose --profile proxy up -d --build  # 5B with Caddy
```

The first build takes 5–20 minutes on a NAS. Then check:

```bash
docker compose ps                              # db healthy · migrate exited (0) · app healthy · tunnel/proxy running
curl -s http://127.0.0.1:3000/api/health       # {"status":"ok","database":"ok"}
docker compose logs --tail 50 app
```

Open **https://meritnama.online**: the homepage should load with the padlock.

## 7. First sign-in and data

1. On https://meritnama.online choose **Sign in** and use the address in
   `OWNER_EMAILS`. The email arrives from `no-reply@meritnama.online`. That account
   becomes the **owner**.
2. *Team & roles*: give other staff their roles; check that **Backups** shows a
   warning (none yet, fixed in step 8).
3. Load data: copy PHF merit-round files, seat matrices and the scoring policy into
   `/volume1/meritnama-data/storage/inbox/` (File Station or SMB works), then import
   them under *Admin → Processing*. Details: DEPLOYMENT.md, "Importing from the inbox".
4. If rounds were imported before candidates signed up, index them once so sign-in
   emails match records:

   ```bash
   set -a; . ./.env; set +a
   docker compose run --rm -e CANDIDATE_INDEX_SECRET \
     -v "$MERITNAMA_DATA_DIR/storage:/storage:ro" \
     migrate node scripts/index-candidates.mjs /storage/inbox/processed
   ```

## 8. Backups (do this on day one)

1. Test it by hand: `cd /volume1/docker/meritnama && scripts/backup.sh`. A folder
   `meritnama-<UTC time>` appears in `/volume1/meritnama-data/backups/`.
2. Schedule it daily: *Control Panel → Task Scheduler → Create → Scheduled Task →
   User-defined script*, user **root**, daily at 03:00, script:

   ```bash
   cd /volume1/docker/meritnama && scripts/backup.sh >> /volume1/meritnama-data/backups/backup.log 2>&1
   ```

3. Copy backups **off the NAS**: *Hyper Backup* of the `meritnama-data/backups`
   folder (not `postgres/`) to a USB disk or cloud storage, encrypted.
4. Prune old backups (e.g. keep 14 days) and **rehearse a restore** once a quarter
   (DEPLOYMENT.md §5).

## 9. Updating later

```bash
cd /volume1/docker/meritnama
scripts/backup.sh
git pull
docker compose --profile tunnel up -d --build    # same profile as you started with
docker compose ps && curl -s http://127.0.0.1:3000/api/health
```

Database migrations run automatically before the new version starts.

## 10. If something goes wrong

| Symptom | Fix |
|---|---|
| Sign-in email links point to `localhost` | `APP_URL` is wrong in `.env`. Set `https://meritnama.online`, then `docker compose up -d`. |
| No sign-in email arrives | `docker compose logs app \| grep -i smtp`; check `SMTP_URL`, and the SPF/DKIM records (step 3). Look in spam. |
| Cloudflare "Bad gateway" (502) or error 1033 | Tunnel public hostname must be `http://app:3000`; `docker compose ps` should show `tunnel` and `app` running; `docker compose logs tunnel`. |
| "Too many redirects" | 5B with Cloudflare proxy on: set *SSL/TLS → Overview* to **Full (strict)**. |
| Port 3000 already in use | Change `APP_PORT` (e.g. 3010) and the reverse proxy destination to match. |
| `migrate` exited with an error | `docker compose logs migrate`; usually a wrong `POSTGRES_PASSWORD` after the database was created. |
| Health says `degraded` | `docker compose logs db`; check free disk space on the data volume. |
| Google sign-in error "redirect_uri_mismatch" | The OAuth client's redirect URI must be exactly `https://meritnama.online/auth/google/callback`. |

## Checklist

- [ ] `https://meritnama.online` loads with a valid certificate; `www.` redirects to it
- [ ] Owner can sign in by email link
- [ ] `/api/health` reports `ok`
- [ ] Daily backup task scheduled and an off-NAS copy configured
- [ ] `.env` saved in a password manager
- [ ] Router forwards only what you chose (none for the tunnel; 80/443 for 5B)
- [ ] NAS admin UI not reachable from the internet
