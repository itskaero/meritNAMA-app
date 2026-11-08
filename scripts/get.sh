#!/usr/bin/env bash
# Download meritNAMA onto a NAS and install it (or update it), in one command:
#
#   curl -fsSL -H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github.raw" \
#     "https://api.github.com/repos/itskaero/meritNAMA-app/contents/scripts/get.sh?ref=main" \
#     | sudo GH_TOKEN="$GH_TOKEN" bash
#
# GH_TOKEN: a fine-grained GitHub token with read access to itskaero/meritNAMA-app
# (the repository is private). Not needed if the repository is ever made public.
#
# What it does:
#   1. downloads the code (a tarball of MN_REF, default main) from GitHub,
#   2. puts it in MN_DIR (default /volume1/docker/meritnama, or ./meritnama), keeping
#      an existing .env and install.conf, and the previous code as <dir>.previous,
#   3. runs `meritnama.sh install` the first time (it asks its questions on the
#      terminal, or reads MN_* variables / install.conf), or `meritnama.sh update`
#      when .env already exists.
#
# Options (environment variables): MN_REF (branch, tag or commit), MN_DIR, and every
# MN_* answer meritnama.sh accepts (MN_OWNER, MN_GMAIL_APP_PASSWORD, MN_ACCESS,
# MN_TUNNEL_TOKEN, ...) for an unattended install.
set -euo pipefail
export PATH="$PATH:/usr/local/bin:/usr/local/sbin:/usr/sbin:/sbin"

REPO="itskaero/meritNAMA-app"
REF="${MN_REF:-main}"
if [ -z "${MN_DIR:-}" ]; then
  if [ -d /volume1/docker ]; then MN_DIR=/volume1/docker/meritnama; else MN_DIR="$(pwd)/meritnama"; fi
fi

say()  { printf '\033[1;36m▸\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

for tool in curl tar gzip bash; do command -v "$tool" >/dev/null 2>&1 || die "$tool is needed but not installed."; done

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# ── 1. Download ──────────────────────────────────────────────────────────────────
if [ -n "${MN_TARBALL:-}" ]; then
  say "Using local archive $MN_TARBALL"
  cp "$MN_TARBALL" "$work/code.tar.gz"
else
  say "Downloading $REPO ($REF) …"
  auth=()
  [ -n "${GH_TOKEN:-}" ] && auth=(-H "Authorization: Bearer $GH_TOKEN")
  code=$(curl -sSL -w "%{http_code}" -o "$work/code.tar.gz" ${auth[@]+"${auth[@]}"} \
    -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28" \
    "https://api.github.com/repos/$REPO/tarball/$REF") || die "Download failed (network). Can the NAS reach api.github.com?"
  case "$code" in
    200) ;;
    401|403) die "GitHub refused the token (HTTP $code). Check GH_TOKEN: read access to $REPO, not expired." ;;
    404) die "Not found (HTTP 404): a private repository needs GH_TOKEN, or the branch '$REF' does not exist." ;;
    *) die "Download failed (HTTP $code)." ;;
  esac
fi
mkdir -p "$work/src"
tar -xzf "$work/code.tar.gz" -C "$work/src" --strip-components=1 || die "The download is not a valid archive."
[ -f "$work/src/meritnama.sh" ] && [ -f "$work/src/docker-compose.yml" ] || die "The archive does not look like meritNAMA (no meritnama.sh)."
ok "Downloaded $(du -sh "$work/src" | cut -f1)."

# ── 2. Put the code in place, keeping configuration ───────────────────────────────
mkdir -p "$(dirname "$MN_DIR")"
first=1
if [ -d "$MN_DIR" ]; then
  [ -f "$MN_DIR/.env" ] && first=0
  for keep in .env install.conf; do [ -f "$MN_DIR/$keep" ] && cp -p "$MN_DIR/$keep" "$work/src/$keep"; done
  # Data kept inside the code folder (MERITNAMA_DATA_DIR=./var) moves with it.
  [ -d "$MN_DIR/var" ] && mv "$MN_DIR/var" "$work/src/var"
  rm -rf "$MN_DIR.previous"
  mv "$MN_DIR" "$MN_DIR.previous"
  ok "Previous code kept in $MN_DIR.previous"
fi
mv "$work/src" "$MN_DIR"
chmod +x "$MN_DIR/meritnama.sh" "$MN_DIR"/scripts/*.sh 2>/dev/null || true
printf '%s\n' "$REF" > "$MN_DIR/.meritnama-ref"
ok "Code in $MN_DIR"

# ── 3. Install or update ─────────────────────────────────────────────────────────
cd "$MN_DIR"
cmd=install; [ "$first" = 0 ] && cmd=update
say "Running: meritnama.sh $cmd"
# Piped from curl, stdin is this script: give the installer the terminal for its questions.
if [ "$cmd" = install ] && [ -r /dev/tty ] && [ -z "${MN_UNATTENDED:-}" ] && ( : < /dev/tty ) 2>/dev/null; then
  exec bash ./meritnama.sh "$cmd" < /dev/tty
else
  exec bash ./meritnama.sh "$cmd" --yes
fi
