#!/usr/bin/env bash
# meritNAMA on a NAS, in one command.
#
#   ./meritnama.sh install        first time: asks a few questions, writes .env with
#                                 generated secrets, creates the data folders, builds,
#                                 starts and waits until https://<domain> is healthy
#
# Day to day:
#   ./meritnama.sh status         containers and health
#   ./meritnama.sh logs [service] follow logs (app by default)
#   ./meritnama.sh update         back up, pull the latest code, rebuild, restart
#   ./meritnama.sh backup         database + storage backup (scripts/backup.sh)
#   ./meritnama.sh restore <dir>  restore a backup (scripts/restore.sh)
#   ./meritnama.sh stop | start   stop or start everything
#   ./meritnama.sh fetch-data [--with-simulation]
#                                 copy the public site's merit lists, seats, policy and
#                                 reference files into the inbox (then Admin → Import all)
#
# Moving to a slow or offline NAS (build elsewhere, carry one file):
#   ./meritnama.sh bundle [platform]   on a PC: build images and save meritnama-images.tar.gz
#                                      (platform: linux/amd64 or linux/arm64; default: this machine)
#   ./meritnama.sh load <file>         on the NAS: load that file and start without building
#
# No SSH? Put install.conf (from install.conf.example) next to this script and run
#   bash /volume1/docker/meritnama/meritnama.sh install > /volume1/docker/meritnama/install.log 2>&1
# from DSM → Control Panel → Task Scheduler (user: root). See docs/NAS-SETUP.md.
#
# Unattended install: set the answers as environment variables and add --yes, e.g.
#   MN_OWNER=you@example.com MN_GMAIL_APP_PASSWORD=abcdabcdabcdabcd MN_ACCESS=tunnel \
#   MN_TUNNEL_TOKEN=eyJ... ./meritnama.sh install --yes
# Variables: MN_DOMAIN (meritnama.online), MN_OWNER, MN_GMAIL (namamerit@gmail.com),
# MN_GMAIL_APP_PASSWORD, MN_ACCESS (tunnel|proxy|local), MN_TUNNEL_TOKEN, MN_DATA_DIR, MN_PORT.
set -euo pipefail
cd "$(dirname "$0")"
# DSM's Task Scheduler runs with a short PATH; Docker lives in /usr/local/bin there.
export PATH="$PATH:/usr/local/bin:/usr/local/sbin:/usr/sbin:/sbin"

say()  { printf '\033[1;36m▸\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

YES=0
for a in "$@"; do [ "$a" = "--yes" ] && YES=1; done

# Answers can come from install.conf next to this script (copy install.conf.example),
# for a NAS without SSH: then the install runs unattended (e.g. from DSM's Task
# Scheduler). The file holds the Gmail app password, so it is deleted once .env exists.
CONF="$(pwd)/install.conf"
if [ -f "$CONF" ]; then
  # Read MN_* lines only (not sourced, so a pasted "abcd efgh ijkl mnop" is fine).
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    case "$line" in MN_[A-Z_]*=*) ;; *) continue ;; esac
    key="${line%%=*}"; val="${line#*=}"
    val="${val#\"}"; val="${val%\"}"; val="${val#\'}"; val="${val%\'}"
    [ -n "$val" ] && [ -z "${!key:-}" ] && export "$key=$val"
  done < "$CONF"
  YES=1
fi

# Docker Compose v2 ("docker compose"), or the standalone v2 binary on older NAS systems.
compose() {
  if docker compose version >/dev/null 2>&1; then docker compose "$@"
  elif command -v docker-compose >/dev/null 2>&1; then docker-compose "$@"
  else die "Docker Compose v2 was not found. Install Docker (Synology: Container Manager) first."; fi
}

need_docker() {
  command -v docker >/dev/null 2>&1 || die "Docker is not installed. Synology: Package Center → Container Manager."
  docker info >/dev/null 2>&1 || die "Docker is installed but not reachable. Run this as root (sudo -i) or start Docker."
  compose version >/dev/null
}

# ask VAR "Question" "default" [secret]
ask() {
  local var="$1" q="$2" def="${3:-}" secret="${4:-}" cur="${!1:-}" ans
  if [ -n "$cur" ]; then printf -v "$var" '%s' "$cur"; return; fi
  if [ "$YES" = 1 ] || [ ! -t 0 ]; then
    [ -n "$def" ] || die "$var is required for an unattended install."
    printf -v "$var" '%s' "$def"; return
  fi
  while :; do
    if [ -n "$secret" ]; then read -r -s -p "$q: " ans; echo; else read -r -p "$q${def:+ [$def]}: " ans; fi
    ans="${ans:-$def}"
    [ -n "$ans" ] && break
    warn "An answer is needed."
  done
  printf -v "$var" '%s' "$ans"
}

rand() { head -c 64 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c "$1"; }

# Set KEY=VALUE in .env, replacing an existing line or appending.
setenv() {
  local key="$1" val="$2" tmp
  tmp="$(mktemp)"
  if grep -q "^${key}=" .env 2>/dev/null; then
    awk -v k="$key" -v v="$val" 'BEGIN{FS=OFS="="} $1==k {print k "=" v; next} {print}' .env > "$tmp"
  else
    cat .env > "$tmp" 2>/dev/null || true
    printf '%s=%s\n' "$key" "$val" >> "$tmp"
  fi
  cat "$tmp" > .env && rm -f "$tmp"
}

load_env() { [ -f .env ] && { set -a; . ./.env; set +a; } || true; }

configure() {
  if [ -f .env ] && grep -q '^POSTGRES_PASSWORD=' .env && ! grep -q '^POSTGRES_PASSWORD=change-me' .env; then
    ok ".env already exists; keeping it (delete it to start over)."
    return
  fi
  say "A few questions. Press Enter to accept the [default]."
  ask MN_DOMAIN "Domain" "meritnama.online"
  ask MN_OWNER "Your email (becomes the owner on first sign-in)" ""
  ask MN_GMAIL "Gmail address that sends sign-in links" "namamerit@gmail.com"
  echo "  Sign-in emails go out through Gmail. Create an App Password at"
  echo "  https://myaccount.google.com/apppasswords (2-Step Verification must be on)."
  ask MN_GMAIL_APP_PASSWORD "Gmail app password (16 letters)" "" secret
  MN_GMAIL_APP_PASSWORD="$(printf '%s' "$MN_GMAIL_APP_PASSWORD" | tr -d ' ')"
  [ "${#MN_GMAIL_APP_PASSWORD}" -eq 16 ] || warn "App passwords are 16 letters; got ${#MN_GMAIL_APP_PASSWORD}. Continuing."
  echo "  How will people reach https://$MN_DOMAIN?"
  echo "    tunnel  Cloudflare Tunnel (recommended: no router changes)"
  echo "    proxy   built-in Caddy on ports 80/443 (router forwards 80/443 to this NAS)"
  echo "    local   only this machine on port 3000 (use your NAS's own reverse proxy)"
  ask MN_ACCESS "Access" "tunnel"
  case "$MN_ACCESS" in tunnel|proxy|local) ;; *) die "Access must be tunnel, proxy or local." ;; esac
  if [ "$MN_ACCESS" = tunnel ]; then
    echo "  Cloudflare → Zero Trust → Networks → Tunnels → Create → Cloudflared; copy the token."
    echo "  Public hostnames: $MN_DOMAIN and www.$MN_DOMAIN → HTTP → app:3000"
    ask MN_TUNNEL_TOKEN "Tunnel token" "" secret
  fi
  local default_data="./var"
  [ -d /volume1 ] && default_data="/volume1/meritnama-data"   # Synology
  [ -d /DATA ] && [ ! -d /volume1 ] && default_data="/DATA/meritnama-data"   # ZimaOS / CasaOS
  ask MN_DATA_DIR "Folder for all data (database, files, backups)" "$default_data"
  ask MN_PORT "Local port for the app" "3000"

  [ -f .env ] || cp .env.example .env
  chmod 600 .env
  local user="${MN_GMAIL%@*}" domain="${MN_GMAIL#*@}"
  setenv POSTGRES_PASSWORD "$(rand 40)"
  setenv CANDIDATE_INDEX_SECRET "$(rand 64)"
  setenv INTERNAL_TOKEN "$(rand 48)"
  setenv APP_URL "https://$MN_DOMAIN"
  setenv MERITNAMA_DOMAIN "$MN_DOMAIN"
  setenv PUBLIC_SITE_ORIGIN ""
  setenv SMTP_URL "smtps://${user}%40${domain}:${MN_GMAIL_APP_PASSWORD}@smtp.gmail.com:465"
  setenv MAIL_FROM "\"meritNAMA <$MN_GMAIL>\""
  setenv OWNER_EMAILS "$MN_OWNER"
  setenv MERITNAMA_DATA_DIR "$MN_DATA_DIR"
  setenv APP_PORT "$MN_PORT"
  setenv DEV_AUTH_STUB_ROLE ""
  setenv DATABASE_URL ""
  case "$MN_ACCESS" in
    tunnel) setenv COMPOSE_PROFILES "tunnel"; setenv CLOUDFLARE_TUNNEL_TOKEN "${MN_TUNNEL_TOKEN:-}" ;;
    proxy)  setenv COMPOSE_PROFILES "proxy" ;;
    local)  setenv COMPOSE_PROFILES "" ;;
  esac
  ok "Wrote .env (secrets generated). Keep a copy of it in a password manager."
  if [ -f "$CONF" ]; then rm -f "$CONF"; ok "Deleted install.conf (its answers are now in .env)."; fi
}

prepare_dirs() {
  load_env
  local d="${MERITNAMA_DATA_DIR:-./var}"
  mkdir -p "$d/postgres" "$d/storage/inbox" "$d/storage/simulation" "$d/backups" "$d/caddy/data" "$d/caddy/config"
  # The app runs as uid 1000 and moves inbox files to processed/.
  chown -R 1000:1000 "$d/storage" 2>/dev/null || warn "Could not chown $d/storage to 1000:1000 (run as root if imports fail)."
  chmod -R go-rwx "$d/storage/simulation" 2>/dev/null || true
  ok "Data folder: $d"
}

# True when something already listens on 127.0.0.1:$1.
port_busy() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

# Before starting: if APP_PORT is taken by something that is not meritNAMA (common on
# ZimaOS/CasaOS, where other apps use 3000), move to the next free port. Inside Docker
# the app keeps port 3000, so the tunnel's "app:3000" is unaffected.
ensure_port() {
  load_env
  local p="${APP_PORT:-3000}"
  if compose ps --status running --services 2>/dev/null | grep -qx app; then return; fi
  port_busy "$p" || return 0
  local n=$((p + 1))
  while port_busy "$n" && [ "$n" -lt $((p + 100)) ]; do n=$((n + 1)); done
  port_busy "$n" && die "Port $p is in use and no free port was found up to $n. Set APP_PORT in .env."
  setenv APP_PORT "$n"
  say "Port $p is used by another program; meritNAMA will listen on $n instead (APP_PORT in .env)."
}

wait_healthy() {
  load_env
  local port="${APP_PORT:-3000}" i
  say "Waiting for the app on 127.0.0.1:$port …"
  for i in $(seq 1 90); do
    if curl -fsS "http://127.0.0.1:$port/api/health" 2>/dev/null | grep -q '"database":"ok"'; then
      ok "Healthy: $(curl -fsS "http://127.0.0.1:$port/api/health")"
      return 0
    fi
    sleep 4
  done
  compose ps
  die "The app did not become healthy in 6 minutes. See: ./meritnama.sh logs"
}

finish_msg() {
  load_env
  echo
  ok "meritNAMA is running."
  echo "   Open:   ${APP_URL:-http://127.0.0.1:${APP_PORT:-3000}}"
  echo "   Sign in with ${OWNER_EMAILS:-your owner email}; that account becomes the owner."
  case "${COMPOSE_PROFILES:-}" in
    *tunnel*) echo "   Tunnel: check Cloudflare shows the tunnel as HEALTHY." ;;
    *proxy*)  echo "   Proxy:  the first HTTPS certificate can take a minute; ports 80/443 must reach this NAS." ;;
    *)        echo "   Local:  point your NAS reverse proxy at http://127.0.0.1:${APP_PORT:-3000}." ;;
  esac
  echo "   Next:   schedule './meritnama.sh backup' daily (docs/NAS-SETUP.md §8)."
}

cmd="${1:-help}"
case "$cmd" in
  install)
    need_docker
    configure
    prepare_dirs
    ensure_port
    say "Building and starting (the first build takes 5–20 minutes on a NAS) …"
    compose up -d --build
    wait_healthy
    finish_msg
    ;;
  configure) configure ;;
  start)   need_docker; ensure_port; compose up -d; wait_healthy ;;
  stop)    need_docker; compose stop ;;
  status)  need_docker; compose ps; load_env; curl -fsS "http://127.0.0.1:${APP_PORT:-3000}/api/health" && echo || warn "Health check failed." ;;
  logs)    need_docker; compose logs -f --tail 100 "${2:-app}" ;;
  backup)  need_docker; sh scripts/backup.sh ;;
  fetch-data) bash scripts/fetch-public-data.sh "${@:2}" ;;
  restore) need_docker; sh scripts/restore.sh "${2:?usage: ./meritnama.sh restore <backup directory>}" ;;
  update)
    need_docker
    say "Backing up first …"; sh scripts/backup.sh
    if [ -d .git ] && command -v git >/dev/null 2>&1; then say "Pulling the latest code …"; git pull --ff-only
    else say "Not a git checkout: rebuilding the files as they are (upload the new ZIP over this folder first)."; fi
    compose up -d --build
    wait_healthy
    ;;
  bundle)
    need_docker
    platform="${2:-}"
    say "Building images${platform:+ for $platform} …"
    if [ -n "$platform" ]; then
      docker buildx build --platform "$platform" --target runtime -t meritnama-app:local --load .
      docker buildx build --platform "$platform" --target migrate -t meritnama-app-migrate:local --load .
    else
      compose build app migrate
    fi
    out="meritnama-images.tar.gz"
    say "Saving images to $out …"
    docker save meritnama-app:local meritnama-app-migrate:local | gzip > "$out"
    ok "Done: $out ($(du -h "$out" | cut -f1)). Copy it and this folder to the NAS, then: ./meritnama.sh load $out"
    ;;
  load)
    need_docker
    file="${2:?usage: ./meritnama.sh load meritnama-images.tar.gz}"
    say "Loading images from $file …"
    gunzip -c "$file" | docker load
    configure
    prepare_dirs
    ensure_port
    compose up -d --no-build
    wait_healthy
    finish_msg
    ;;
  help|-h|--help|*)
    sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'
    ;;
esac
