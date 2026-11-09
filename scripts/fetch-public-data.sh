#!/usr/bin/env bash
# Copy the published data from the public site's repository (itskaero/meritnama) into
# this installation's inbox, ready for Admin → Inductions → "Import all".
#
#   ./meritnama.sh fetch-data                    merit rounds, seat matrix, scoring policy,
#                                                reference documents
#   ./meritnama.sh fetch-data --with-simulation  also induction 21's simulation files
#                                                (candidate marks and preferences: restricted)
#
# Files go to <MERITNAMA_DATA_DIR>/storage/inbox/{merit,seats,policy,reference}/ with the
# names the inbox expects (inductions/20/merit/round_3.json → merit/i20_round_3.json).
# Empty round shells (published before a round) and files already imported (found in
# inbox/processed/) are skipped. Nothing is imported until you press Import in the app.
# Options: MN_DATA_REPO (default itskaero/meritnama), MN_DATA_REF (default main).
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$PATH:/usr/local/bin:/usr/local/sbin:/usr/sbin:/sbin"

say()  { printf '\033[1;36m▸\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

WITH_SIM=0
for a in "$@"; do [ "$a" = "--with-simulation" ] && WITH_SIM=1; done

DATA_DIR="./var"
if [ -f .env ]; then
  v="$(grep -E '^MERITNAMA_DATA_DIR=' .env | tail -1 | cut -d= -f2- | tr -d '"')" || true
  [ -n "$v" ] && DATA_DIR="$v"
fi
case "$DATA_DIR" in /*) ;; *) DATA_DIR="$(pwd)/${DATA_DIR#./}" ;; esac
STORAGE="$DATA_DIR/storage"
INBOX="$STORAGE/inbox"
mkdir -p "$INBOX/merit" "$INBOX/seats" "$INBOX/policy" "$INBOX/reference" "$INBOX/processed"

REPO="${MN_DATA_REPO:-itskaero/meritnama}"
REF="${MN_DATA_REF:-main}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

if [ -n "${MN_DATA_TARBALL:-}" ]; then
  say "Using local archive $MN_DATA_TARBALL"; cp "$MN_DATA_TARBALL" "$work/data.tar.gz"
else
say "Downloading $REPO ($REF) … (tens of MB)"
auth=()
[ -n "${GH_TOKEN:-}" ] && auth=(-H "Authorization: Bearer $GH_TOKEN")
code=$(curl -sSL -w "%{http_code}" -o "$work/data.tar.gz" ${auth[@]+"${auth[@]}"} "https://api.github.com/repos/$REPO/tarball/$REF") || die "Download failed. Can the NAS reach api.github.com?"
[ "$code" = 200 ] || die "Download failed (HTTP $code). Is $REPO public (or GH_TOKEN set) and does '$REF' exist?"
fi
mkdir -p "$work/src"
tar -xzf "$work/data.tar.gz" -C "$work/src" --strip-components=1 || die "The download is not a valid archive."
SRC="$work/src"
[ -d "$SRC/data" ] || die "No data/ folder in $REPO."

copied=0; skipped=0
# put <source> <inbox folder> <target name>
put() {
  local src="$1" folder="$2" name="$3"
  [ -f "$src" ] || return 0
  # Already imported earlier? (processed/ keeps "<stamp>-imported-<kind>-<name>")
  if ls "$INBOX/processed/"*"-imported-$folder-$name" >/dev/null 2>&1; then skipped=$((skipped + 1)); return 0; fi
  cp "$src" "$INBOX/$folder/$name"
  copied=$((copied + 1))
}

# Merit rounds, every induction (files under 10 KB are empty shells: skipped).
for f in "$SRC"/inductions/*/merit/round_*.json; do
  [ -f "$f" ] || continue
  [ "$(wc -c < "$f")" -lt 10240 ] && continue
  ind="$(basename "$(dirname "$(dirname "$f")")")"
  r="$(basename "$f" .json)"; r="${r#round_}"
  put "$f" merit "i${ind}_round_${r}.json"
done
# Note: data/induction<n>_merit_round<r>.json in that repository is a reduced list
# (no consent replies, seats, institute or job ids), not PHF's file, so it is not
# copied. Put PHF's original round files for that induction in inbox/merit/ yourself
# (named i21_round_1.json …).
# Seat matrices, scoring policy, reference documents.
for f in "$SRC"/data/induction*_seats.json; do [ -f "$f" ] && put "$f" seats "$(basename "$f")"; done
put "$SRC/data/scoring_policy.json" policy scoring_policy.json
put "$SRC/data/disciplineFullData.json" reference disciplineFullData.json
put "$SRC/data/cpsp_accreditation.json" reference cpsp_accreditation.json
for f in "$SRC"/data/induction*_specialty_groups.json; do [ -f "$f" ] && put "$f" reference "$(basename "$f")"; done

if [ "$WITH_SIM" = 1 ]; then
  for ind in $(ls "$SRC"/data/induction*_candidates.json 2>/dev/null | sed -E 's#.*/induction([0-9]+)_candidates\.json#\1#'); do
    dest="$STORAGE/simulation/induction$ind"
    mkdir -p "$dest"
    for f in "$SRC"/data/induction${ind}_candidates.json "$SRC"/data/induction${ind}_certificates.json \
             "$SRC"/data/induction${ind}_components.json "$SRC"/data/induction${ind}_consent_round*.json; do
      [ -f "$f" ] && cp "$f" "$dest/"
    done
    [ -f "$SRC/data/ProfileStatus.json" ] && cp "$SRC/data/ProfileStatus.json" "$dest/"
    # PHF's gazette: official marks and eligibility (they override the portal's marks).
    [ -f "$SRC/inductions/$ind/gazette/gazette_$ind.json" ] && cp "$SRC/inductions/$ind/gazette/gazette_$ind.json" "$dest/"
    chmod -R go-rwx "$dest" 2>/dev/null || true
    ok "Simulation files for induction $ind → $dest (Admin → Processing)"
  done
fi

chown -R 1000:1000 "$STORAGE" 2>/dev/null || true
ok "Copied $copied file(s) into $INBOX${skipped:+ ($skipped already imported, skipped)}."
echo "   Next: sign in as owner → Admin → Inductions & merit lists → Inbox → Import all."
ls "$SRC"/data/induction*_merit_round*.json >/dev/null 2>&1 && echo "   Induction $(ls "$SRC"/data/induction*_merit_round1.json | sed -E 's#.*/induction([0-9]+)_.*#\1#' | head -1): its merit rounds are only in a reduced form there; copy PHF's original round files into $INBOX/merit/ (i<n>_round_<r>.json)."
