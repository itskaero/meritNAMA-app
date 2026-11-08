# Setting up meritNAMA on a NAS at meritnama.online

A step-by-step guide from an empty NAS to `https://meritnama.online`. It complements
[DEPLOYMENT.md](DEPLOYMENT.md), which is the reference for updates, backups and
restores. Commands are run over SSH on the NAS. Where a NAS vendor differs, Synology
is the example; QNAP (Container Station), TrueNAS SCALE and Unraid work the same way
once Docker Compose is available.

**Time:** about an hour, most of it waiting for the first build.

---

## Quickest: one curl command (downloads and installs)

Needs SSH on the NAS (step 1), the Gmail app password (step 3) and, for the tunnel,
its token (step 5A). Make a GitHub token once: GitHub → Settings → Developer settings
→ **Fine-grained tokens** → *Generate*, repository access *Only select* →
`itskaero/meritNAMA-app`, permission **Contents: Read-only**, expiry as you like.

```bash
ssh admin@<nas-ip>
GH_TOKEN=github_pat_xxxxxxxx      # the token you just made
curl -fsSL -H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github.raw" \
  "https://api.github.com/repos/itskaero/meritNAMA-app/contents/scripts/get.sh?ref=main" \
  | sudo GH_TOKEN="$GH_TOKEN" MN_REF=main bash
```

It downloads the code to `/volume1/docker/meritnama`, asks its questions (owner
email, Gmail app password, tunnel/proxy/local, tunnel token), builds, starts and waits
until the site is healthy. **Run the same command again to update**: it keeps `.env`,
keeps the previous code as `meritnama.previous`, backs up and rebuilds.

- Until the pull request is merged, use the branch name instead of `main` in both
  places: `?ref=ccr-3e305929-39xqcm` and `MN_REF=ccr-3e305929-39xqcm`.
- Unattended (e.g. from DSM's Task Scheduler, no terminal): put the answers in the
  command, `sudo GH_TOKEN=... MN_OWNER=you@example.com MN_GMAIL_APP_PASSWORD=...
  MN_ACCESS=tunnel MN_TUNNEL_TOKEN=... MN_UNATTENDED=1 bash`. A Task Scheduler task
  stores that text, so delete the task afterwards.
- Other folder: add `MN_DIR=/volume2/apps/meritnama`.

## Quick start: one command (code already on the NAS)

After steps 0–3 below (NAS ready, code on it, a Gmail app password, and either a
Cloudflare Tunnel token or ports 80/443 forwarded), everything else is:

```bash
cd /volume1/docker/meritnama
sudo ./meritnama.sh install
```

It asks for your email, the Gmail app password and how the site is reached (tunnel,
proxy or local), then generates the database password and candidate key, writes
`.env`, creates the data folders under `/volume1/meritnama-data`, builds, starts, and
waits until the site is healthy. Afterwards:

| Command | What it does |
|---|---|
| `./meritnama.sh status` | containers and health |
| `./meritnama.sh logs` | follow the app's logs |
| `./meritnama.sh backup` | database + files backup |
| `./meritnama.sh update` | backup, `git pull`, rebuild, restart |
| `./meritnama.sh restore <dir>` | restore a backup |
| `./meritnama.sh stop` / `start` | stop or start everything |

**NAS too slow to build, or without internet?** Build on a PC and carry one file:

```bash
# on the PC (match the NAS: linux/amd64 for Intel/AMD, linux/arm64 for ARM)
./meritnama.sh bundle linux/amd64          # → meritnama-images.tar.gz
# copy the repository folder and that file to the NAS, then on the NAS:
sudo ./meritnama.sh load meritnama-images.tar.gz
```

Building for a different CPU than the PC's (an Intel PC for an ARM NAS) runs under
emulation: Docker Desktop has it built in; it is slower but works.

The rest of this guide is the same steps done by hand, with the background.

## 0. What you need

- A NAS with Docker and Compose v2 (Synology DSM 7.2+ with *Container Manager*;
  QNAP *Container Station*; TrueNAS SCALE; Unraid), 2 GB of free RAM and ~10 GB of
  disk. Intel/AMD or 64-bit ARM.
- SSH access to the NAS as an administrator.
- The domain **meritnama.online**, with access to its registrar.
- A free **Cloudflare** account (recommended way in, step 5A).
- The Gmail account **namamerit@gmail.com** with 2-Step Verification, for sign-in
  emails (step 3).
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

## 2. Get the code onto the NAS

Pick whichever works for you. **A** needs nothing but a browser; **B** and **C** need SSH.

### A. No git, no SSH: upload a ZIP and run the installer from DSM

1. On your PC, open the repository on GitHub (signed in), choose the branch
   (`main`, or `ccr-3e305929-39xqcm` until it is merged), then **Code → Download ZIP**.
2. In DSM **File Station**, open the `docker` shared folder, **Upload** the ZIP, then
   right-click it → **Extract** → *Extract here*. Rename the extracted folder to
   `meritnama` (GitHub names it `meritNAMA-app-<branch>`).
3. On your PC, open `install.conf.example` from the ZIP in a text editor, fill it in
   (your email, the Gmail app password from step 3 below, `tunnel` and its token), and
   save it as **`install.conf`**. Upload it into `/docker/meritnama/` with File Station.
4. DSM → **Control Panel → Task Scheduler → Create → Triggered Task →
   User-defined script**:
   - General: name `meritnama install`, user **root**, event *Boot-up*, untick
     *Enabled* (it is only run by hand).
   - Task Settings → Run command:

     ```bash
     bash /volume1/docker/meritnama/meritnama.sh install > /volume1/docker/meritnama/install.log 2>&1
     ```

5. Select the task → **Run**. The first build takes 5–20 minutes. Open
   `/docker/meritnama/install.log` in File Station (right-click → *Open with Text
   Editor*) to follow it; it ends with **"meritNAMA is running"**. The installer deletes
   `install.conf` once `.env` is written.
6. For later updates: upload the new ZIP, extract it **over** the same folder (keep
   `.env`), and run a second task with `bash /volume1/docker/meritnama/meritnama.sh update`.
   Make a third with `... meritnama.sh backup`, scheduled daily (step 8).

### B. With SSH and git

```bash
cd /volume1/docker
git clone https://github.com/itskaero/meritNAMA-app.git meritnama   # password: a GitHub token
cd meritnama && sudo ./meritnama.sh install
```

For the token: GitHub → Settings → Developer settings → Fine-grained tokens, read
access to `itskaero/meritNAMA-app`.

### C. Build on your PC, carry one file (slow NAS, or no internet on it)

Needs Docker Desktop on the PC. In the downloaded code folder:
`./meritnama.sh bundle linux/amd64` (or `linux/arm64` for an ARM NAS). Upload the
folder and `meritnama-images.tar.gz` as in A, then run
`bash /volume1/docker/meritnama/meritnama.sh load /volume1/docker/meritnama/meritnama-images.tar.gz`
from Task Scheduler or SSH.

## 3. Set up email for sign-in links (Gmail)

meritNAMA signs people in with a one-time link by email, so this must work before
anyone can log in. It sends through the Gmail account **namamerit@gmail.com**.

1. Sign in to that Google account and turn on **2-Step Verification**
   (Google Account → Security).
2. Create an **App Password**: Google Account → Security → *App passwords* (or open
   https://myaccount.google.com/apppasswords), name it `meritnama-nas`. Google shows a
   16-letter password once: copy it **without the spaces**.
3. Your SMTP URL is then (note `%40` in place of `@` in the username):

   ```text
   smtps://namamerit%40gmail.com:<16-letter app password>@smtp.gmail.com:465
   ```

4. The sender must be the Gmail address itself (Gmail rewrites any other From):
   `MAIL_FROM="meritNAMA <namamerit@gmail.com>"`.

Good to know:

- No DNS records are needed for email: mail goes out as `@gmail.com`, so SPF and DKIM
  are Gmail's. (Sending as `no-reply@meritnama.online` would need a mail provider
  that supports your domain, such as Google Workspace, Zoho or Brevo; switch later by
  changing `SMTP_URL` and `MAIL_FROM`.)
- A free Gmail account sends about **500 emails a day**. Each sign-in is one email,
  so that is plenty to start; on round days with many new sign-ins, move to a
  provider with higher limits.
- If Google ever revokes the app password (for example after a password change),
  sign-ins stop: create a new app password and update `.env`, then
  `docker compose up -d`.
- Replies to sign-in emails land in namamerit@gmail.com's inbox.
- **Check it works:** after installing, sign in as the owner → *Team & roles* →
  **Email** → **Send me a test email**. The card shows the server and account in use
  (never the password) and, if sending fails, why: a refused login means the app
  password or the `%40` is wrong; "could not reach" means the NAS cannot connect out
  on port 465.

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
SMTP_URL=smtps://namamerit%40gmail.com:<16-letter app password>@smtp.gmail.com:465
MAIL_FROM="meritNAMA <namamerit@gmail.com>"
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
   `OWNER_EMAILS`. The email arrives from `namamerit@gmail.com`. That account
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
| No sign-in email arrives | `docker compose logs app \| grep -i -E "smtp\|mail"`. "Invalid login" or 535: the app password is wrong or revoked (step 3), or `@` was not written as `%40`. Look in spam. |
| Cloudflare "Bad gateway" (502) or error 1033 | Tunnel public hostname must be `http://app:3000`; `docker compose ps` should show `tunnel` and `app` running; `docker compose logs tunnel`. |
| "Too many redirects" | 5B with Cloudflare proxy on: set *SSL/TLS → Overview* to **Full (strict)**. |
| "address already in use" on 127.0.0.1:3000 | Another app has port 3000 (common on ZimaOS/CasaOS). Set `APP_PORT=3010` in `.env` and `docker compose up -d`; with a NAS reverse proxy, point it at the new port. The tunnel (`app:3000`) needs no change. `meritnama.sh install/start` now picks a free port by itself. |
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
